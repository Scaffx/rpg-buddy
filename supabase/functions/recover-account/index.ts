import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Todas as tabelas com coluna user_id que referenciam auth.users
const USER_ID_TABLES = [
  "attributes",
  "missions",
  "boss_battles",
  "activity_log",
  "gold_history",
  "xp_history",
  "xp_transactions",
  "meal_log",
  "water_log",
  "body_measurements",
  "user_balance",
  "user_buffs",
  "user_health_stats",
  "user_inventory",
  "subscriptions",
  "mission_daily_completions",
  "npc_challenge_completions",
  "boss_weekly_loot_claims",
  "combat_turn_logs",
  "ai_messages",
  "adventure_journal",
  "user_achievements",
  "daily_tracking",
  "personagens",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // Verificar JWT do usuário logado
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const newUserId = user.id;
    const { old_user_id } = await req.json();

    if (!old_user_id) {
      return new Response(JSON.stringify({ error: "old_user_id é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verificar que old_user_id é de fato um placeholder (segurança)
    const { data: oldAuthUser } = await admin.auth.admin.getUserById(old_user_id);
    if (!oldAuthUser?.user?.email?.includes("@rpgbuddy.import")) {
      return new Response(JSON.stringify({ error: "Perfil inválido para recuperação" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const errors: string[] = [];

    // 1. Deletar perfil e atributos recém-criados pelo trigger (do novo usuário)
    await admin.from("attributes").delete().eq("user_id", newUserId);
    await admin.from("profiles").delete().eq("user_id", newUserId);

    // 2. Remap profiles (principal)
    const { error: profileErr } = await admin
      .from("profiles")
      .update({ user_id: newUserId })
      .eq("user_id", old_user_id);
    if (profileErr) errors.push(`profiles: ${profileErr.message}`);

    // 3. Remap friend_requests (tem requester_id e receiver_id)
    await admin.from("friend_requests").update({ requester_id: newUserId }).eq("requester_id", old_user_id);
    await admin.from("friend_requests").update({ receiver_id: newUserId }).eq("receiver_id", old_user_id);

    // 4. Remap todas as outras tabelas com user_id
    for (const table of USER_ID_TABLES) {
      const { error } = await admin
        .from(table as any)
        .update({ user_id: newUserId } as any)
        .eq("user_id", old_user_id);
      if (error && !error.message.includes("does not exist")) {
        errors.push(`${table}: ${error.message}`);
      }
    }

    // 5. Deletar auth.users placeholder antigo
    await admin.auth.admin.deleteUser(old_user_id);

    return new Response(
      JSON.stringify({ success: true, errors: errors.length ? errors : undefined }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
