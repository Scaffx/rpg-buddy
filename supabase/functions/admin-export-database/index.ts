// Admin-only edge function: exports the entire `public` schema as a ZIP.
// Each table is included as both JSON (lossless) and CSV (Excel-friendly).
// Auth: caller must have JWT + app_metadata.role === 'admin' (checked via is_system_admin RPC).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  BlobWriter,
  TextReader,
  ZipWriter,
} from "https://deno.land/x/zipjs@v2.7.45/index.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// All tables in the public schema (41 tables).
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

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (val: unknown): string => {
    if (val === null || val === undefined) return "";
    let s: string;
    if (typeof val === "object") s = JSON.stringify(val);
    else s = String(val);
    if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
      s = '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(","));
  }
  return lines.join("\n");
}

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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
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

    // 3. Build ZIP.
    const zipBlobWriter = new BlobWriter("application/zip");
    const zip = new ZipWriter(zipBlobWriter);

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

      // JSON (lossless: preserves jsonb, arrays, nulls, timestamps).
      await zip.add(
        `data/${table}.json`,
        new TextReader(JSON.stringify(allRows, null, 2)),
      );

      // CSV (Excel-friendly).
      await zip.add(`data/${table}.csv`, new TextReader(toCsv(allRows)));
    }

    // Manifest + README.
    await zip.add(
      "manifest.json",
      new TextReader(JSON.stringify(manifest, null, 2)),
    );

    const readme = `# Database Export

Generated: ${manifest.generated_at}
Project ref: ${manifest.project_ref}
Tables exported: ${manifest.tables.length}
Total rows: ${manifest.tables.reduce((a, t) => a + t.row_count, 0)}

## How to import into a new Supabase project

1. Create a new Supabase project under your own account.
2. Link your local repo: \`supabase link --project-ref <new-ref>\`
3. Push schema (recreates all tables, RLS, functions, triggers):
   \`supabase db push\`
4. Import data — pick ONE per table:
   - **Easiest (UI)**: Supabase Dashboard → Table Editor → Insert → Import data from CSV (use \`data/<table>.csv\`)
   - **Lossless (recommended for jsonb/arrays)**: Use \`data/<table>.json\` with a custom Node/Python script that calls the Supabase REST API or \`COPY\` via psql.

## Not included (recreate manually)

- **Storage buckets** (e.g. \`body-photos\`): files must be re-uploaded.
- **Edge function secrets**: configure in the new project's secrets.
- **auth.users**: managed by Supabase Auth — users must sign up again, OR use \`supabase auth\` admin tools to import. The \`profiles\` table here references user IDs.

## Per-table summary

${manifest.tables.map((t) => `- \`${t.name}\`: ${t.row_count} rows${t.error ? ` (ERROR: ${t.error})` : ""}`).join("\n")}
`;
    await zip.add("README.md", new TextReader(readme));

    await zip.close();
    const blob = await zipBlobWriter.getData();

    const filename = `rpgbuddy-export-${new Date().toISOString().slice(0, 10)}.zip`;

    return new Response(blob, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
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
