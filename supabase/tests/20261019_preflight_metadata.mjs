// Local PG17 provenance probes. Every candidate runs in one rolled-back
// transaction; this never changes a fixture database permanently.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const [port, database, stage] = process.argv.slice(2);
if (!/^\d{2,5}$/.test(port ?? '') || !database?.startsWith('integration_') ||
    !['a1', 'a12', 'p13'].includes(stage)) {
  throw new Error('Usage: node supabase/tests/20261019_preflight_metadata.mjs <port> integration_<db> <a1|a12|p13>');
}
const psql = process.platform === 'win32'
  ? 'C:/Program Files/PostgreSQL/17/bin/psql.exe' : 'psql';
const migrationNames = {
  a1: '20261019193625_progressao_reversao_checklist.sql',
  a12: '20261019220257_undo_mission_derived_effect_receipts.sql',
  p13: '20261019222715_talent_points_atomic_purchase_equip.sql',
};
const source = readFileSync(new URL(`../migrations/${migrationNames[stage]}`, import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n');

function run(sql, terse = false) {
  const result = spawnSync(psql, ['-X', '-q', ...(terse ? ['-A', '-t'] : []), '-v', 'ON_ERROR_STOP=1',
    '-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', database, '-f', '-'],
  { input: sql, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
    error: result.error?.message };
}

function rewrite(signature, oldText, newText) {
  return `DO $rewrite$ DECLARE v text; BEGIN
    v := pg_get_functiondef('${signature}'::regprocedure);
    IF strpos(v, ${oldText}) = 0 THEN RAISE EXCEPTION 'probe anchor missing'; END IF;
    EXECUTE replace(v, ${oldText}, ${newText});
  END $rewrite$;`;
}
function recreate(signature, oldText, newText, access = `REVOKE EXECUTE ON FUNCTION ${signature} FROM PUBLIC, anon, authenticated;`) {
  return `DO $rewrite$ DECLARE v text; BEGIN
    v := pg_get_functiondef('${signature}'::regprocedure);
    IF strpos(v, ${oldText}) = 0 THEN RAISE EXCEPTION 'probe anchor missing'; END IF;
    EXECUTE 'DROP FUNCTION ${signature}';
    EXECUTE replace(v, ${oldText}, ${newText});
  END $rewrite$;
  ${access}`;
}
function newlineRewrite(signature, newline) {
  return `DO $rewrite$ DECLARE v text; BEGIN
    v := replace(pg_get_functiondef('${signature}'::regprocedure), E'\\r\\n', E'\\n');
    EXECUTE replace(v, E'\\n', E'\\${newline}');
    IF strpos((SELECT prosrc FROM pg_proc WHERE oid='${signature}'::regprocedure),
              E'\\${newline}') = 0 THEN
      RAISE EXCEPTION 'probe newline mutation missing';
    END IF;
  END $rewrite$;`;
}

const stageCases = {
  a1: [
    ['known-lf', '', 0],
    ['known-crlf', newlineRewrite('public._complete_mission_daily(uuid,date,integer)', 'r\\n'), 0],
    ['trusted-service-role', 'GRANT EXECUTE ON FUNCTION public._complete_mission_daily(uuid,date,integer) TO service_role;', 0],
    ['owner-rpc', 'ALTER FUNCTION public.complete_mission(uuid) OWNER TO authenticated;', 3],
    ['owner-helper', 'ALTER FUNCTION public._complete_mission_daily(uuid,date,integer) OWNER TO authenticated;', 3],
    ['shadow-target', "CREATE FUNCTION public.complete_mission(uuid,date) RETURNS jsonb LANGUAGE sql AS $stub$ SELECT '{}'::jsonb $stub$; ALTER FUNCTION public.complete_mission(uuid,date) OWNER TO authenticated;", 3],
    ['acl-anon', 'GRANT EXECUTE ON FUNCTION public.complete_mission(uuid) TO anon;', 3],
    ['acl-auth', 'REVOKE EXECUTE ON FUNCTION public.complete_mission(uuid) FROM authenticated;', 3],
    ['acl-helper-auth', 'GRANT EXECUTE ON FUNCTION public._complete_mission_daily(uuid,date,integer) TO authenticated;', 3],
    ['security', 'ALTER FUNCTION public.complete_mission(uuid) SECURITY INVOKER;', 3],
    ['config', 'ALTER FUNCTION public._complete_mission_daily(uuid,date,integer) SET search_path=pg_catalog;', 3],
    ['default', rewrite('public._complete_mission_daily(uuid,date,integer)', "'DEFAULT 12'", "'DEFAULT 13'"), 3],
    ['bare-cr', newlineRewrite('public._complete_mission_daily(uuid,date,integer)', 'r'), 3],
  ],
  a12: [
    ['known-lf', '', 0],
    ['known-crlf', newlineRewrite('public.complete_mission(uuid,date)', 'r\\n'), 0],
    ['trusted-service-role', 'GRANT EXECUTE ON FUNCTION public._grant_flow_xp_buff(uuid) TO service_role;', 0],
    ['owner-rpc', 'ALTER FUNCTION public.complete_mission(uuid,date) OWNER TO authenticated;', 3],
    ['owner-internal', 'ALTER FUNCTION public._complete_mission_daily(uuid,date,integer) OWNER TO authenticated;', 3],
    ['owner-flow', 'ALTER FUNCTION public._grant_flow_xp_buff(uuid) OWNER TO authenticated;', 3],
    ['owner-health', 'ALTER FUNCTION public._apply_mission_health_effects(uuid,numeric,integer,integer) OWNER TO authenticated;', 3],
    ['owner-attribute', 'ALTER FUNCTION private.undo_mission_attribute_awards(uuid,date,uuid,boolean,date) OWNER TO authenticated;', 3],
    ['acl-anon-rpc', 'GRANT EXECUTE ON FUNCTION public.complete_mission(uuid,date) TO anon;', 3],
    ['acl-auth-rpc', 'REVOKE EXECUTE ON FUNCTION public.complete_mission(uuid,date) FROM authenticated;', 3],
    ['acl-helper', 'GRANT EXECUTE ON FUNCTION public._grant_flow_xp_buff(uuid) TO anon;', 3],
    ['acl-helper-auth', 'GRANT EXECUTE ON FUNCTION public._grant_flow_xp_buff(uuid) TO authenticated;', 3],
    ['security', 'ALTER FUNCTION public.complete_mission(uuid,date) SECURITY INVOKER;', 3],
    ['config', 'ALTER FUNCTION public._complete_mission_daily(uuid,date,integer) SET search_path=pg_catalog;', 3],
    ['default', rewrite('public._complete_mission_daily(uuid,date,integer)', "'DEFAULT 12'", "'DEFAULT 13'"), 3],
    ['argument-name', recreate('public._grant_flow_xp_buff(uuid)', "'p_uid uuid'", "'p_other uuid'"), 3],
    ['body', rewrite('public._grant_flow_xp_buff(uuid)', "'''48 hours'''", "'''49 hours'''"), 3],
    ['bare-cr', newlineRewrite('public.complete_mission(uuid,date)', 'r'), 3],
  ],
  p13: [
    ['known-lf', '', 0],
    ['known-crlf', newlineRewrite('public._complete_mission_daily(uuid,date,integer)', 'r\\n'), 0],
    ['trusted-service-role', 'GRANT EXECUTE ON FUNCTION public._complete_mission_daily(uuid,date,integer) TO service_role;', 0],
    ['owner-level', 'ALTER FUNCTION public.get_level_from_xp_v2(integer) OWNER TO authenticated;', 3],
    ['owner-trigger', 'ALTER FUNCTION public.sync_talent_points_on_level_change() OWNER TO authenticated;', 3],
    ['owner-helper', 'ALTER FUNCTION public._complete_mission_with_weekly(uuid,date) OWNER TO authenticated;', 3],
    ['acl-level', 'REVOKE EXECUTE ON FUNCTION public.get_level_from_xp_v2(integer) FROM PUBLIC, anon, authenticated;', 3],
    ['acl-helper', 'GRANT EXECUTE ON FUNCTION public._complete_mission_daily(uuid,date,integer) TO anon;', 3],
    ['acl-helper-auth', 'GRANT EXECUTE ON FUNCTION public._complete_mission_daily(uuid,date,integer) TO authenticated;', 3],
    ['security', 'ALTER FUNCTION public.sync_talent_points_on_level_change() SECURITY DEFINER;', 3],
    ['config', 'ALTER FUNCTION public._complete_mission_daily(uuid,date,integer) SET search_path=pg_catalog;', 3],
    ['default', rewrite('public._complete_mission_daily(uuid,date,integer)', "'DEFAULT 12'", "'DEFAULT 13'"), 3],
    ['result', recreate('public.get_level_from_xp_v2(integer)', "'RETURNS integer'", "'RETURNS bigint'", ''), 3],
    ['bare-cr', newlineRewrite('public._complete_mission_daily(uuid,date,integer)', 'r'), 3],
  ],
};
const markers = {
  a1: { query: "SELECT NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='mission_daily_completions' AND column_name='credited_total_verified')", expected: 't' },
  a12: { query: "SELECT to_regclass('private.mission_effect_receipts') IS NULL", expected: 't' },
  p13: { query: "SELECT to_regprocedure('public.buy_talent(uuid)') IS NULL", expected: 't' },
};
for (const [name, setup, expected] of stageCases[stage]) {
  const { status, output, error } = run(`BEGIN;\n${setup}\n${source}\nROLLBACK;\n`);
  assert.equal(status, expected, `${stage}/${name}: ${output || error}`);
  if (expected === 3) assert.match(output,
    /DRIFT|Unknown progression source signatures|Progression source (metadata or authority changed|changed after known snapshot)/,
    `${stage}/${name}: ${output}`);
  const marker = run(`${markers[stage].query};`, true);
  assert.equal(marker.status, 0, marker.output || marker.error);
  assert.equal(marker.output.trim(), markers[stage].expected, `${stage}/${name}: rollback marker`);
  console.log(`${stage}/${name}: PASS (psql exit ${status}; rollback verified)`);
}
