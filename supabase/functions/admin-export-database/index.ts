// Admin-only edge function: exports the entire public schema as JSON.
// Auth: caller must have JWT + app_metadata.role === admin.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// All tables in the public schema.
const TABLES = [
  "activity_log",
  "ai_conversations",
  "ai_messages",
  "app_releases",
  "attributes",
  "body_measurements",
  "boss_battles",
  "boss_weekly_loot_claims",
  "bosses",
  "checklist_items",
  "classes",
  "combat_turn_logs",
  "combates_ativos",
  "daily_tracking",
  "friend_challenges",
  "game_items",
  "gold_history",
  "meal_log",
  "mission_daily_completions",
  "missions",
  "npc_challenge_completions",
  "npc_weekly_challenges",
  "personagens",
  "plan_missions",
  "plans",
  "profiles",
  "shop_items",
  "subscription_access_keys",
  "subscriptions",
  "system_update_logs",
  "talentos_disponiveis",
  "talentos_jogador",
  "user_balance",
  "user_buffs",
  "user_crafting_materials",
  "user_health_stats",
  "user_inventory",
  "water_log",
  "xp_history",
  "xp_transactions",
];

const PAGE_SIZE = 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Validate JWT and admin role.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceKey) {
      return new Response(
        JSON.stringify({
          error:
            "Missing env vars: SUPABASE_URL, SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use the user-scoped client so is_system_admin() reads the caller's JWT.
    const { data: isAdmin, error: adminErr } = await userClient.rpc("is_system_admin");
    if (adminErr || isAdmin !== true) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Service-role client to bypass RLS.
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // 3. Build JSON export payload.
    const exportData: Record<string, Record<string, unknown>[]> = {};

    const manifest: {
      generated_at: string;
      project_ref: string;
      tables: { name: string; row_count: number; error?: string }[];
    } = {
      generated_at: new Date().toISOString(),
      project_ref: supabaseUrl.replace(/^https?:\/\//, "").split(".")[0],
      tables: [],
    };

    for (const table of TABLES) {
      const allRows: Record<string, unknown>[] = [];
      let from = 0;
      let tableError: string | undefined;

      // Paginate to bypass the 1000-row default limit.
      while (true) {
        const { data, error } = await admin
          .from(table)
          .select("*")
          .range(from, from + PAGE_SIZE - 1);

        if (error) {
          tableError = error.message;
          break;
        }
        if (!data || data.length === 0) break;
        allRows.push(...data);
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }

      manifest.tables.push({
        name: table,
        row_count: allRows.length,
        ...(tableError ? { error: tableError } : {}),
      });
      exportData[table] = allRows;
    }

    const payload = {
      manifest,
      data: exportData,
    };

    const filename = `rpgbuddy-export-${new Date().toISOString().slice(0, 10)}.json`;

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Export-Format": "json",
        "X-Export-Tables": String(manifest.tables.length),
        "X-Export-Rows": String(
          manifest.tables.reduce((a, t) => a + t.row_count, 0),
        ),
      },
    });
  } catch (err) {
    console.error("admin-export-database error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
