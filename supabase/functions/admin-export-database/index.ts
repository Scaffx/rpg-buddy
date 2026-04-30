// Admin-only edge function: exports all public tables as a single JSON snapshot.
// This version intentionally avoids external imports to reduce runtime incompatibilities.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const accessToken = authHeader.slice("Bearer ".length).trim();
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceKey) {
      return jsonResponse(
        {
          error:
            "Missing env vars: SUPABASE_URL, SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY",
        },
        500,
      );
    }

    // Validate caller token and check app_metadata.role.
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!userRes.ok) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const userJson = await userRes.json();
    const role = userJson?.app_metadata?.role;
    if (role !== "admin") {
      return jsonResponse({ error: "Forbidden: admin only" }, 403);
    }

    const projectRef = supabaseUrl.replace(/^https?:\/\//, "").split(".")[0];
    const manifest: {
      generated_at: string;
      project_ref: string;
      tables: { name: string; row_count: number; error?: string }[];
    } = {
      generated_at: new Date().toISOString(),
      project_ref: projectRef,
      tables: [],
    };

    const data: Record<string, unknown[]> = {};

    for (const table of TABLES) {
      let offset = 0;
      let tableError: string | undefined;
      const rows: unknown[] = [];

      while (true) {
        const restUrl = `${supabaseUrl}/rest/v1/${encodeURIComponent(table)}?select=*&limit=${PAGE_SIZE}&offset=${offset}`;
        const tableRes = await fetch(restUrl, {
          method: "GET",
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
          },
        });

        if (!tableRes.ok) {
          tableError = `${tableRes.status} ${await tableRes.text()}`;
          break;
        }

        const batch = await tableRes.json();
        if (!Array.isArray(batch) || batch.length === 0) break;

        rows.push(...batch);
        if (batch.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }

      manifest.tables.push({
        name: table,
        row_count: rows.length,
        ...(tableError ? { error: tableError } : {}),
      });
      data[table] = rows;
    }

    const payload = { manifest, data };
    const filename = `rpgbuddy-export-${new Date().toISOString().slice(0, 10)}.json`;

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Export-Format": "json",
        "X-Export-Tables": String(manifest.tables.length),
        "X-Export-Rows": String(manifest.tables.reduce((acc, t) => acc + t.row_count, 0)),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("admin-export-database error:", message);
    return jsonResponse({ error: message }, 500);
  }
});
