import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const GOOGLE_AI_KEY = Deno.env.get("GOOGLE_AI_KEY");
const SUBSCRIPTION_ENV = Deno.env.get("PADDLE_ENVIRONMENT") === "sandbox" ? "sandbox" : "live";

// ───────────── Tools (function calling) ─────────────
const tools = [
  {
    type: "function",
    function: {
      name: "check_npc_missions",
      description: "Verifica missões já criadas por este NPC para o usuário. Use SEMPRE no início da conversa como NPC para evitar criar missões duplicadas recentes.",
      parameters: {
        type: "object",
        properties: {
          npc_id: { type: "string", description: "ID do NPC (atlas/nova/elara/zephyr/midas)" },
        },
        required: ["npc_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_hero_status",
      description: "Retorna o status atual do herói: nível, XP, ouro, classe, atributos, missões de hoje e missões pendentes. Use quando o usuário perguntar sobre si mesmo, progresso, próximos passos, ou antes de sugerir algo personalizado.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "list_missions",
      description: "Lista as missões do usuário. Use 'today' para missões de hoje, 'pending' para todas as pendentes, 'all' para todas.",
      parameters: {
        type: "object",
        properties: {
          scope: { type: "string", enum: ["today", "pending", "all"] },
        },
        required: ["scope"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_mission",
      description: "Cria uma nova missão para o usuário. Confirme com o usuário antes de criar se houver dúvida sobre algum campo.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Título curto da missão" },
          description: { type: "string", description: "Descrição opcional" },
          attribute: {
            type: "string",
            description: "Nome do atributo principal",
            enum: ["Agilidade","Carisma","Criatividade","Disciplina","Força","Inteligência","Resiliência","Sabedoria","Vitalidade","Autoaperfeiçoamento","Relacionamento"],
          },
          secondary_attributes: {
            type: "array",
            description: "Atributos secundários adicionais (opcional)",
            items: {
              type: "string",
              enum: ["Agilidade","Carisma","Criatividade","Disciplina","Força","Inteligência","Resiliência","Sabedoria","Vitalidade","Autoaperfeiçoamento","Relacionamento"],
            },
          },
          days_of_week: {
            type: "array",
            description: "Dias da semana em que a missão ocorre. Use as abreviações: Seg, Ter, Qua, Qui, Sex, Sáb, Dom",
            items: { type: "string", enum: ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"] },
          },
          horario: {
            type: "string",
            enum: ["manha","tarde","noite","flex"],
            description: "Período do dia (padrão: flex se não especificado)",
          },
          priority: { type: "string", enum: ["baixa","media","alta"] },
          npc_id: { type: "string", description: "ID do NPC que está criando esta missão. Obrigatório quando você é um NPC (atlas/nova/elara/zephyr/midas)." },
        },
        required: ["title","attribute"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_mission",
      description: "Marca uma missão como concluída pelo ID. Use list_missions antes para descobrir o ID se necessário.",
      parameters: {
        type: "object",
        properties: { mission_id: { type: "string" } },
        required: ["mission_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_mission",
      description: "Apaga uma missão pelo ID. Confirme antes se for ambíguo.",
      parameters: {
        type: "object",
        properties: { mission_id: { type: "string" } },
        required: ["mission_id"],
        additionalProperties: false,
      },
    },
  },
];

// ───────────── Tool implementations ─────────────
async function runTool(name: string, args: any, supa: any, userId: string, npcId?: string) {
  try {
    if (name === "check_npc_missions") {
      const targetNpcId = args.npc_id ?? npcId;
      const { data } = await supa
        .from("missions")
        .select("id,title,description,attribute_id,created_at,completed")
        .eq("user_id", userId)
        .eq("npc_id", targetNpcId)
        .order("created_at", { ascending: false })
        .limit(5);
      const missions = data ?? [];
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const recent = missions.filter((m: any) => new Date(m.created_at).getTime() > sevenDaysAgo);
      return { npc_missions: missions, recent_count: recent.length, has_recent: recent.length > 0, most_recent: recent[0] ?? null };
    }
    if (name === "get_hero_status") {
      const [profileR, balR, attrsR, missionsR, classR] = await Promise.all([
        supa.from("profiles").select("display_name,level,total_xp,xp_today,missions_completed,boss_keys,current_class_id").eq("user_id", userId).maybeSingle(),
        supa.from("user_balance").select("gold").eq("user_id", userId).maybeSingle(),
        supa.from("attributes").select("name,level,xp").eq("user_id", userId),
        supa.from("missions").select("id,title,horario_provavel,priority,completed,is_failed").eq("user_id", userId).limit(50),
        supa.from("profiles").select("current_class_id").eq("user_id", userId).maybeSingle(),
      ]);
      let className = null;
      if (classR.data?.current_class_id) {
        const c = await supa.from("classes").select("name").eq("id", classR.data.current_class_id).maybeSingle();
        className = c.data?.name ?? null;
      }
      const missions = missionsR.data ?? [];
      return {
        profile: profileR.data,
        gold: balR.data?.gold ?? 0,
        class: className,
        attributes: attrsR.data ?? [],
        missions_today_pending: missions.filter((m: any) => !m.completed && !m.is_failed).length,
        missions_completed_total: profileR.data?.missions_completed ?? 0,
      };
    }
    if (name === "list_missions") {
      const q = supa.from("missions").select("id,title,horario_provavel,priority,completed,is_failed,description").eq("user_id", userId);
      if (args.scope === "pending") q.eq("completed", false);
      const { data, error } = await q.limit(30);
      if (error) throw error;
      return { missions: data };
    }
    if (name === "create_mission") {
      const attr = await supa.from("attributes").select("id").eq("user_id", userId).eq("name", args.attribute).maybeSingle();
      if (!attr.data) return { error: `Atributo '${args.attribute}' não encontrado` };
      // Resolve IDs dos atributos secundários
      let secondaryIds: string[] = [];
      if (Array.isArray(args.secondary_attributes) && args.secondary_attributes.length > 0) {
        const secRes = await supa.from("attributes").select("id,name").eq("user_id", userId).in("name", args.secondary_attributes);
        secondaryIds = (secRes.data ?? []).map((a: any) => a.id);
      }
      const { data, error } = await supa.from("missions").insert({
        user_id: userId,
        title: args.title,
        description: args.description ?? null,
        attribute_id: attr.data.id,
        secondary_attribute_ids: secondaryIds.length > 0 ? secondaryIds : [],
        horario_provavel: args.horario ?? "flex",
        days_of_week: Array.isArray(args.days_of_week) && args.days_of_week.length > 0 ? args.days_of_week : null,
        priority: args.priority ?? "media",
        xp_reward: 25,
        npc_id: args.npc_id ?? npcId ?? null,
      }).select("id,title").single();
      if (error) throw error;
      return { created: data };
    }
    if (name === "complete_mission") {
      const { data: m, error: mErr } = await supa.from("missions").select("id,title,xp_reward,attribute_id,completed").eq("id", args.mission_id).eq("user_id", userId).maybeSingle();
      if (mErr) throw mErr;
      if (!m) return { error: "Missão não encontrada" };
      if (m.completed) return { error: "Missão já estava concluída" };
      await supa.from("missions").update({ completed: true, completed_at: new Date().toISOString(), status: "concluida" }).eq("id", m.id);
      // XP & ouro
      await supa.rpc("add_xp_to_user", { p_user_id: userId, p_xp: m.xp_reward ?? 25 });
      await supa.rpc("add_gold_to_user", { p_user_id: userId, p_gold: 2 });
      await supa.from("xp_history").insert({ user_id: userId, xp_gained: m.xp_reward ?? 25, type: "mission" });
      return { completed: m.title, xp: m.xp_reward ?? 25, gold: 2 };
    }
    if (name === "delete_mission") {
      const { error } = await supa.from("missions").delete().eq("id", args.mission_id).eq("user_id", userId);
      if (error) throw error;
      return { deleted: true };
    }
    return { error: `Ferramenta desconhecida: ${name}` };
  } catch (e: any) {
    return { error: e?.message ?? "Erro ao executar ferramenta" };
  }
}

const APP_CONTEXT = `
CONTEXTO DO APP Life on RPG:
- O usuário transforma hábitos reais em missões de RPG, ganha XP, ouro, sobe de nível e enfrenta bosses.
- 11 atributos disponíveis: Agilidade, Carisma, Criatividade, Disciplina, Força, Inteligência, Resiliência, Sabedoria, Vitalidade, Autoaperfeiçoamento, Relacionamento.
- Períodos de horário: manhã, tarde, noite, flex.
- Dias da semana (abreviações usadas no app): Seg, Ter, Qua, Qui, Sex, Sáb, Dom.
- Prioridade: baixa, media, alta.

═══════════════════════════════════════
FLUXO DE CRIAÇÃO DE MISSÃO (OBRIGATÓRIO)
═══════════════════════════════════════
Quando o usuário pedir para criar uma missão, NÃO chame create_mission imediatamente.
Colete os dados fazendo UMA PERGUNTA POR VEZ, na ordem abaixo, pulando o que já foi informado:

1. Título — "Qual será o nome da missão?"
2. Atributo principal — mostre a lista completa e peça para escolher um.
   Lista: Agilidade · Carisma · Criatividade · Disciplina · Força · Inteligência · Resiliência · Sabedoria · Vitalidade · Autoaperfeiçoamento · Relacionamento
3. Atributos secundários — "Algum atributo secundário? (até 2, ou 'nenhum')"
4. Descrição — "Quer adicionar uma descrição? (opcional, pode pular)"
5. Tipo — "A missão se repete em dias fixos (recorrente) ou acontece uma única vez?"
   → Se recorrente: "Quais dias? (ex: Seg, Qua, Sex)"
6. Horário — "Qual o período? Manhã, Tarde, Noite ou Flex?"
7. Prioridade — "Qual a prioridade? Baixa, Média ou Alta?"
8. Confirmação — mostre um resumo completo e pergunte "Posso criar assim?"
   → Confirmou? → chame create_mission com todos os dados.
   → Quer ajustar? → volte ao passo necessário.

ATALHO: Se o usuário já adiantou campos (ex: "cria missão X, atributo Y, dias Z"),
pule o que já tem e pergunte apenas o que falta.

═══════════════════════════════════════
OUTRAS FERRAMENTAS
═══════════════════════════════════════
- Pergunta sobre status/progresso? → chame get_hero_status
- Pergunta "quais minhas missões"? → chame list_missions
- Pede para concluir missão? → chame list_missions, encontre o ID, depois complete_mission
- Pede para apagar? → confirme e use delete_mission

ESTILO GERAL:
- Português do Brasil, tom encorajador com leve toque épico (sem exagero).
- Uma pergunta por vez — não sobrecarregue o usuário.
- Respostas curtas. Quando usar ferramenta, comente o resultado brevemente.
- Use markdown leve (negrito, listas) para clareza.`;

const SYSTEM_PROMPT = `Você é o Mestre RPG, conselheiro motivacional dentro do app Life on RPG.
${APP_CONTEXT}`;

// Contexto especial para quando um NPC está no controle — sem fluxo guiado, criação direta de missões
const NPC_APP_CONTEXT = `
CONTEXTO DO APP Life on RPG:
- O usuário transforma hábitos reais em missões de RPG, ganha XP, ouro, sobe de nível e enfrenta bosses.
- 11 atributos disponíveis: Agilidade, Carisma, Criatividade, Disciplina, Força, Inteligência, Resiliência, Sabedoria, Vitalidade, Autoaperfeiçoamento, Relacionamento.
- Períodos de horário: manhã, tarde, noite, flex.
- Dias da semana: Seg, Ter, Qua, Qui, Sex, Sáb, Dom.
- Prioridade: baixa, media, alta.

═══════════════════════════════════════
PROTOCOLO DE SAUDAÇÃO INICIAL (OBRIGATÓRIO)
═══════════════════════════════════════
Na PRIMEIRA mensagem do usuário, você DEVE executar SEMPRE:
1. Chame get_hero_status → leia level, XP e atributos do herói
2. Chame check_npc_missions com o seu npc_id → veja se já criou missão recente (últimos 7 dias)
3. SE has_recent = false:
   a. Calcule a MÉDIA de nível dos atributos do SEU domínio (ex: Atlas → Força, Vitalidade, Agilidade, Disciplina)
   b. CALIBRE a dificuldade:
      - Média < 3  → SEDENTÁRIO  → missão FÁCIL  (5–15 min, iniciante)
      - Média 3–6  → COMUM       → missão MÉDIA   (20–40 min, moderada)
      - Média > 6  → ATLETA      → missão DIFÍCIL (45–90 min, intensa)
   c. Chame create_mission DIRETAMENTE com npc_id = seu ID. NÃO peça confirmação, crie já.
   d. Informe o usuário da missão criada de forma entusiasmada e breve.
4. SE has_recent = true:
   Mencione a missão mais recente e encoraje o usuário a completá-la.

REGRA DE CRIAÇÃO DIRETA: Como NPC, você SEMPRE usa create_mission diretamente.
Nunca faça a sequência de perguntas guiadas para missões que você mesmo sugere.
Se o usuário pedir para criar OUTRA missão específica, crie direto sem guia.

OUTRAS FERRAMENTAS:
- Pergunta sobre status/progresso? → get_hero_status
- Pergunta sobre missões? → list_missions
- Pede para concluir? → complete_mission
- Pede para apagar? → delete_mission (confirme antes)

ESTILO GERAL:
- Português do Brasil, tom alinhado com sua personalidade.
- Respostas curtas (máx 4 linhas). Use markdown leve.
`;

async function ensureActiveSubscriptionOrThrow(supa: any, userId: string) {
  const { data, error } = await supa.rpc("has_active_subscription", {
    user_uuid: userId,
    check_env: SUBSCRIPTION_ENV,
  });

  if (error) {
    throw new Error(`Falha ao validar assinatura: ${error.message}`);
  }

  if (!data) {
    const err = new Error("Assinatura inativa. Assine para continuar.");
    (err as Error & { code?: string }).code = "PAYWALL_LOCKED";
    throw err;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    if (!GOOGLE_AI_KEY) throw new Error("GOOGLE_AI_KEY não configurada");
    const { messages, npcPersona, npcId } = await req.json();
    if (!Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages deve ser array" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cliente Supabase como o próprio usuário (RLS aplicada)
    const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await supa.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: "Usuário inválido" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await ensureActiveSubscriptionOrThrow(supa, userId);

    // Injeta persona de NPC quando fornecida
    // Quando npcPersona está presente, o NPC substitui completamente a identidade do Mestre RPG
    const isNpcMode = typeof npcPersona === "string" && npcPersona.trim();
    const systemContent = isNpcMode
      ? `Você é ${npcPersona.trim()}\n\nNÃO se identifique como "Mestre RPG". Você É este personagem, exclusivamente.\nSeu npc_id é: "${npcId ?? 'npc'}" — use-o em check_npc_missions e create_mission.\n${NPC_APP_CONTEXT}`
      : SYSTEM_PROMPT;

    // Loop de tool calling (não-streaming para suportar tools cleanly)
    const convo: any[] = [{ role: "system", content: systemContent }, ...messages];

    for (let step = 0; step < 8; step++) {
      const aiResp = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${GOOGLE_AI_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gemini-2.5-flash",
          messages: convo,
          tools,
        }),
      });

      if (!aiResp.ok) {
        if (aiResp.status === 429) {
          return new Response(JSON.stringify({ error: "Muitas mensagens. Aguarde alguns segundos." }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (aiResp.status === 402) {
          return new Response(JSON.stringify({ error: "Créditos de IA esgotados." }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const t = await aiResp.text();
        console.error("AI gateway error:", aiResp.status, t);
        return new Response(JSON.stringify({ error: "Erro no gateway de IA" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await aiResp.json();
      const choice = data.choices?.[0];
      const msg = choice?.message;
      if (!msg) {
        return new Response(JSON.stringify({ error: "Resposta vazia da IA" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const toolCalls = msg.tool_calls;
      if (toolCalls?.length) {
        convo.push(msg);
        for (const tc of toolCalls) {
          let args: any = {};
          try { args = JSON.parse(tc.function.arguments || "{}"); } catch { /* */ }
          const result = await runTool(tc.function.name, args, supa, userId, npcId);
          convo.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(result),
          });
        }
        continue; // próxima iteração para a IA processar resultados
      }

      // Resposta final
      return new Response(JSON.stringify({ content: msg.content ?? "" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ content: "Não consegui completar a tarefa em poucas etapas. Tente reformular." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    if (e instanceof Error && (e as Error & { code?: string }).code === "PAYWALL_LOCKED") {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("ai-chat error:", e);
    return new Response(JSON.stringify({ error: "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
