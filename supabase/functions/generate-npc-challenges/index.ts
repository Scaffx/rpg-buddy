import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SUBSCRIPTION_ENV = Deno.env.get("PADDLE_ENVIRONMENT") === "sandbox" ? "sandbox" : "live";

const NPC_DEFINITIONS = [
  {
    id: "atlas",
    name: "Atlas",
    title: "O Forjador de Corpos",
    personality: "Motivacional e enérgico",
    focus: "desafios físicos, consistência, vitalidade e disciplina corporal",
  },
  {
    id: "nova",
    name: "Nova",
    title: "A Mente Iluminada",
    personality: "Analítica e curiosa",
    focus: "estudo, lógica, leitura, aprendizado aplicado e inteligência",
  },
  {
    id: "elara",
    name: "Elara",
    title: "A Guardiã da Alma",
    personality: "Empática e sábia",
    focus: "saúde emocional, autocuidado, journaling e resiliência",
  },
  {
    id: "zephyr",
    name: "Zephyr",
    title: "O Sonhador Rebelde",
    personality: "Excêntrico e inspirador",
    focus: "criatividade, experimentação artística e expressão pessoal",
  },
] as const;

// Atributos que pertencem ao domínio de cada NPC (nomes em pt-BR)
const NPC_DOMAIN_ATTRIBUTES: Record<string, string[]> = {
  atlas:  ["Força", "Vitalidade", "Agilidade", "Disciplina"],
  nova:   ["Inteligência", "Sabedoria"],
  elara:  ["Resiliência", "Autoaperfeiçoamento"],
  zephyr: ["Criatividade", "Carisma"],
};

type AttributeRow = {
  id: string;
  name: string;
  level: number;
  xp: number;
};

type MissionRow = {
  title: string;
  is_failed: boolean | null;
  attribute_id: string | null;
  daily_status: string | null;
};

type DomainStat = {
  npc_id: string;
  avgAttributeLevel: number;
  completionRate: number;  // 0–1
  failedMissions: string[]; // títulos das missões falhas no domínio (max 3)
};

type RewardItem = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  rarity: string | null;
  effect: string | null;
  shop_price: number | null;
  stackable: boolean | null;
  category: string | null;
};

type GeneratedChallenge = {
  npc_id: string;
  challenge_id: string;
  title: string;
  description: string;
  xp_reward: number;
  gold_reward: number;
  reward_item_id: string | null;
  reward_item_quantity: number;
};

function clampInt(value: unknown, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function extractJsonObject(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Resposta JSON inválida da IA.");
  }

  return JSON.parse(text.slice(start, end + 1));
}

async function ensureActiveSubscriptionOrThrow(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data, error } = await supabase.rpc("has_active_subscription", {
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

function buildFallbackChallenges(weekToken: string, rewardItems: RewardItem[]): GeneratedChallenge[] {
  const templates: Record<string, Array<{ title: string; description: string; xp: number; gold: number }>> = {
    atlas: [
      { title: "Sessão de movimento progressivo", description: "Faça 20 a 30 minutos de movimento consciente, com foco em constância e execução limpa.", xp: 22, gold: 8 },
      { title: "Desafio de resistência curta", description: "Complete um bloco físico curto, porém intenso, adaptado ao seu nível atual.", xp: 30, gold: 12 },
      { title: "Recuperação ativa estratégica", description: "Feche o dia com alongamento, mobilidade ou caminhada leve para acelerar sua recuperação.", xp: 18, gold: 7 },
    ],
    nova: [
      { title: "Aprendizado com aplicação", description: "Estude um conceito novo e registre como ele pode ser usado na vida real ainda hoje.", xp: 24, gold: 9 },
      { title: "Leitura com síntese", description: "Leia um conteúdo relevante e escreva um resumo direto em até 5 linhas.", xp: 20, gold: 8 },
      { title: "Problema lógico do dia", description: "Resolva um problema, puzzle ou decisão prática sem distrações por pelo menos 15 minutos.", xp: 32, gold: 13 },
    ],
    elara: [
      { title: "Check-in emocional honesto", description: "Registre seu estado emocional atual e nomeie uma ação concreta para cuidar de si hoje.", xp: 20, gold: 10 },
      { title: "Silêncio restaurador", description: "Faça uma pausa de respiração, oração, meditação ou silêncio guiado por pelo menos 10 minutos.", xp: 18, gold: 8 },
      { title: "Conversa de coragem", description: "Resolva uma pendência emocional pequena com honestidade e respeito.", xp: 34, gold: 14 },
    ],
    zephyr: [
      { title: "Explosão criativa rápida", description: "Crie algo pequeno hoje: texto, desenho, ideia, protótipo ou conceito visual.", xp: 22, gold: 9 },
      { title: "Experimento fora do padrão", description: "Teste uma abordagem nova em algo que você normalmente faria no automático.", xp: 28, gold: 11 },
      { title: "Entrega imperfeita", description: "Publique, compartilhe ou finalize uma criação mesmo sem estar perfeita.", xp: 36, gold: 15 },
    ],
  };

  return NPC_DEFINITIONS.flatMap((npc, npcIndex) => {
    const npcTemplates = templates[npc.id] ?? [];

    return npcTemplates.map((template, challengeIndex) => {
      const rewardItem = rewardItems[(npcIndex * 3 + challengeIndex) % Math.max(1, rewardItems.length)] ?? null;
      const hasRewardItem = Boolean(rewardItem?.id);

      return {
        npc_id: npc.id,
        challenge_id: `${npc.id}-${challengeIndex + 1}`,
        title: template.title,
        description: template.description,
        xp_reward: template.xp,
        gold_reward: template.gold,
        reward_item_id: hasRewardItem ? rewardItem!.id : null,
        reward_item_quantity: hasRewardItem && rewardItem?.stackable ? ((npcIndex + challengeIndex + weekToken.length) % 2) + 1 : 0,
      };
    });
  });
}

function computeDomainStats(
  npcId: string,
  attributes: AttributeRow[],
  missions: MissionRow[],
): DomainStat {
  const domainAttrNames = NPC_DOMAIN_ATTRIBUTES[npcId] ?? [];
  const domainAttrs = attributes.filter((a) =>
    domainAttrNames.some((n) => a.name?.toLowerCase() === n.toLowerCase()),
  );

  const avgAttributeLevel =
    domainAttrs.length > 0
      ? domainAttrs.reduce((sum, a) => sum + (Number(a.level) || 1), 0) / domainAttrs.length
      : 1;

  const domainAttrIds = new Set(domainAttrs.map((a) => a.id));
  const domainMissions = missions.filter((m) => m.attribute_id && domainAttrIds.has(m.attribute_id));

  const totalSlots = domainMissions.length;
  const completedSlots = domainMissions.filter(
    (m) => m.daily_status === "done" || m.daily_status === "completed",
  ).length;
  const completionRate = totalSlots > 0 ? completedSlots / totalSlots : 0.5;

  const failedMissions = domainMissions
    .filter((m) => m.is_failed === true)
    .slice(0, 3)
    .map((m) => String(m.title || ""));

  return { npc_id: npcId, avgAttributeLevel, completionRate, failedMissions };
}

async function generateWithAi(
  weekToken: string,
  rewardItems: RewardItem[],
  heroContext: {
    level: number;
    pendingMissionTitles: string[];
    domainStats: DomainStat[];
  },
) {
  if (!LOVABLE_API_KEY) {
    return null;
  }

  const rewardCatalog = rewardItems.slice(0, 12).map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    rarity: item.rarity,
    effect: item.effect,
    shop_price: item.shop_price,
    stackable: item.stackable,
  }));

  const systemPrompt = [
    "Você gera desafios semanais de NPC para um app de RPG de hábitos.",
    "Responda APENAS JSON válido no formato { \"challenges\": [...] }.",
    "Crie exatamente 3 desafios para cada npc_id: atlas, nova, elara, zephyr.",
    "Cada desafio precisa conter: npc_id, challenge_id, title, description, xp_reward, gold_reward, reward_item_id, reward_item_quantity.",
    "Use challenge_id curto e estável, como atlas-1, atlas-2 etc.",
    "reward_item_id deve vir somente da lista de itens recebida.",
    "Nunca use item de boss. A lista já foi filtrada para excluir boss_drop_level.",
    "Use recompensas variadas: alguns desafios só com ouro, outros com item do catálogo + ouro.",
    "Reward item quantity deve ser 0 quando reward_item_id for null.",
    "XP deve variar entre 16 e 80. Ouro deve variar entre 6 e 30.",
    "CALIBRAÇÃO ADAPTATIVA por NPC (baseada em domainStats):",
    "  - avgAttributeLevel baixo (< 3) E completionRate baixa (< 0.4): gere desafios FÁCEIS com XP ALTO (60–80) — o herói precisa de motivação.",
    "  - avgAttributeLevel médio (3–6) E completionRate média (0.4–0.7): desafios MODERADOS, XP moderado (40–60).",
    "  - avgAttributeLevel alto (> 6) OU completionRate alta (> 0.7): desafios DIFÍCEIS e específicos, XP menor (16–40) — o herói é veterano.",
    "  - failedMissions não vazia: pelo menos um desafio deve ser uma versão adaptada/simplificada de uma missão falha, com dica concreta no description.",
    "O herói ganha bônus de XP por streak diário, então o XP base do desafio não precisa compensar isso — calibre para dificuldade real.",
    "Os desafios devem soar humanos, específicos e com cara de missão semanal útil, não genérica.",
  ].join(" ");

  const userPrompt = JSON.stringify({
    weekToken,
    heroLevel: heroContext.level,
    pendingMissionTitles: heroContext.pendingMissionTitles,
    domainStats: heroContext.domainStats,
    npcs: NPC_DEFINITIONS,
    rewardCatalog,
  });

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.8,
    }),
  });

  if (!response.ok) {
    throw new Error(`Falha na IA de NPC: ${response.status}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("Resposta da IA sem conteúdo.");
  }

  const parsed = extractJsonObject(content);
  if (!Array.isArray(parsed?.challenges)) {
    throw new Error("Resposta da IA sem lista de desafios.");
  }

  const validNpcIds = new Set(NPC_DEFINITIONS.map((npc) => npc.id));
  const validItemIds = new Set(rewardItems.map((item) => item.id));

  return parsed.challenges
    .map((challenge: Record<string, unknown>) => {
      const npcId = String(challenge.npc_id || "").toLowerCase();
      const rewardItemId = challenge.reward_item_id ? String(challenge.reward_item_id) : null;

      if (!validNpcIds.has(npcId)) {
        return null;
      }

      if (rewardItemId && !validItemIds.has(rewardItemId)) {
        return null;
      }

      return {
        npc_id: npcId,
        challenge_id: String(challenge.challenge_id || `${npcId}-1`).toLowerCase(),
        title: String(challenge.title || "Missão de NPC"),
        description: String(challenge.description || "Conclua este desafio especial nesta semana."),
        xp_reward: clampInt(challenge.xp_reward, 16, 80),
        gold_reward: clampInt(challenge.gold_reward, 6, 25),
        reward_item_id: rewardItemId,
        reward_item_quantity: rewardItemId ? clampInt(challenge.reward_item_quantity, 1, 3) : 0,
      } satisfies GeneratedChallenge;
    })
    .filter(Boolean) as GeneratedChallenge[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) {
      throw new Error("Usuário inválido.");
    }

    await ensureActiveSubscriptionOrThrow(supabase, userId);

    const body = await req.json().catch(() => ({}));
    const weekToken = typeof body?.weekToken === "string" && body.weekToken.trim() ? body.weekToken.trim() : new Date().toISOString().slice(0, 10);

    const { data: existingRows, error: existingError } = await supabase
      .from("npc_weekly_challenges")
      .select("id, npc_id, challenge_id, title, description, xp_reward, gold_reward, reward_item_id, reward_item_quantity, reward_item:game_items(id, name, icon)")
      .eq("user_id", userId)
      .eq("week_token", weekToken)
      .order("npc_id", { ascending: true })
      .order("challenge_id", { ascending: true });

    if (existingError) {
      throw existingError;
    }

    if ((existingRows ?? []).length > 0) {
      return new Response(JSON.stringify({ challenges: existingRows }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [profileRes, missionsRes, attributesRes, itemsRes] = await Promise.all([
      supabase.from("profiles").select("level").eq("user_id", userId).maybeSingle(),
      supabase
        .from("missions")
        .select("title, is_failed, attribute_id, daily_status")
        .eq("user_id", userId)
        .limit(60),
      supabase
        .from("attributes")
        .select("id, name, level, xp")
        .eq("user_id", userId),
      supabase
        .from("game_items")
        .select("id, name, description, icon, rarity, effect, shop_price, stackable, category")
        .is("boss_drop_level", null)
        .eq("category", "consumable")
        .eq("stackable", true)
        .order("shop_price", { ascending: true, nullsFirst: false }),
    ]);

    if (itemsRes.error) {
      throw itemsRes.error;
    }

    const rewardItems = ((itemsRes.data ?? []) as RewardItem[]).filter((item) => item.id);
    const heroLevel = Number(profileRes.data?.level ?? 1);
    const allMissions = (missionsRes.data ?? []) as MissionRow[];
    const allAttributes = (attributesRes.data ?? []) as AttributeRow[];
    const pendingMissionTitles = allMissions
      .filter((m) => !m.is_failed)
      .slice(0, 12)
      .map((m) => String(m.title || ""));

    const domainStats = NPC_DEFINITIONS.map((npc) =>
      computeDomainStats(npc.id, allAttributes, allMissions),
    );

    let generated = buildFallbackChallenges(weekToken, rewardItems);
    try {
      const aiGenerated = await generateWithAi(weekToken, rewardItems, {
        level: heroLevel,
        pendingMissionTitles,
        domainStats,
      });
      if (aiGenerated && aiGenerated.length >= 12) {
        generated = aiGenerated;
      }
    } catch (error) {
      console.error("[generate-npc-challenges] fallback acionado:", error);
    }

    const rowsToInsert = generated.map((challenge) => ({
      user_id: userId,
      week_token: weekToken,
      ...challenge,
    }));

    const { error: insertError } = await supabase
      .from("npc_weekly_challenges")
      .insert(rowsToInsert);

    if (insertError) {
      throw insertError;
    }

    const rewardMap = new Map(rewardItems.map((item) => [item.id, item]));
    const responseChallenges = generated.map((challenge) => ({
      id: `${weekToken}-${challenge.challenge_id}`,
      ...challenge,
      reward_item: challenge.reward_item_id
        ? {
            id: challenge.reward_item_id,
            name: rewardMap.get(challenge.reward_item_id)?.name ?? "Item misterioso",
            icon: rewardMap.get(challenge.reward_item_id)?.icon ?? "🎁",
          }
        : null,
    }));

    return new Response(JSON.stringify({ challenges: responseChallenges }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof Error && (error as Error & { code?: string }).code === "PAYWALL_LOCKED") {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const message = error instanceof Error ? error.message : "Erro interno ao gerar desafios NPC.";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});