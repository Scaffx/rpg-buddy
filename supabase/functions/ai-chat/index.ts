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
          horario: {
            type: "string",
            enum: ["manha","tarde","noite","flex"],
            description: "Período do dia",
          },
          priority: { type: "string", enum: ["baixa","media","alta"] },
        },
        required: ["title","attribute","horario"],
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
async function runTool(name: string, args: any, supa: any, userId: string) {
  try {
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
      const { data, error } = await supa.from("missions").insert({
        user_id: userId,
        title: args.title,
        description: args.description ?? null,
        attribute_id: attr.data.id,
        horario_provavel: args.horario,
        priority: args.priority ?? "media",
        xp_reward: 25,
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
- 11 atributos: Agilidade, Carisma, Criatividade, Disciplina, Força, Inteligência, Resiliência, Sabedoria, Vitalidade, Autoaperfeiçoamento, Relacionamento.
- Períodos das missões: manhã, tarde, noite, flex.

FERRAMENTAS DISPONÍVEIS — use-as sempre que o usuário pedir algo concreto:
- Pergunta sobre status/progresso? → chame get_hero_status
- Pergunta "quais minhas missões"? → chame list_missions
- Pede para criar missão? → chame create_mission (peça atributo e período se faltarem)
- Pede para concluir? → chame list_missions, encontre o ID, depois complete_mission
- Pede para apagar? → confirme e use delete_mission

ESTILO GERAL:
- Português do Brasil, tom encorajador com leve toque épico (sem exagero).
- Respostas curtas (até 6 linhas) salvo se pedido detalhe.
- Quando usar uma ferramenta, comente brevemente o resultado em vez de despejar JSON.
- Use markdown leve (negrito, listas) para clareza.`;

const SYSTEM_PROMPT = `Você é o Mestre RPG, conselheiro motivacional dentro do app Life on RPG.
${APP_CONTEXT}`;

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
    const { messages, npcPersona } = await req.json();
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
    const systemContent = typeof npcPersona === "string" && npcPersona.trim()
      ? `Você é ${npcPersona.trim()}\n\nNÃO se identifique como "Mestre RPG". Você É este personagem, exclusivamente.\n${APP_CONTEXT}`
      : SYSTEM_PROMPT;

    // Loop de tool calling (não-streaming para suportar tools cleanly)
    const convo: any[] = [{ role: "system", content: systemContent }, ...messages];

    for (let step = 0; step < 5; step++) {
      const aiResp = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${GOOGLE_AI_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
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
          const result = await runTool(tc.function.name, args, supa, userId);
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
