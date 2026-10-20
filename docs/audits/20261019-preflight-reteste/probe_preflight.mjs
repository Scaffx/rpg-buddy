// Independent, rollback-only PostgreSQL preflight probes.
// Usage: node probe_preflight.mjs <a1|a12|p13> <case> <database> [port]
// The database must be at the stage immediately before that migration.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const [stage, probe, database, port = '55579'] = process.argv.slice(2);
const specs = {
  a1: {
    migration: 'supabase/migrations/20261019193625_progressao_reversao_checklist.sql',
    sentinel: `SELECT to_regprocedure('public._guard_progression_initial_values()') IS NOT NULL`,
    source: 'public._complete_mission_daily(uuid,date,integer)',
  },
  a12: {
    migration: 'supabase/migrations/20261019220257_undo_mission_derived_effect_receipts.sql',
    sentinel: `SELECT to_regclass('private.mission_effect_receipts') IS NOT NULL`,
    source: 'public.complete_mission(uuid,date)',
  },
  p13: {
    migration: 'supabase/migrations/20261019222715_talent_points_atomic_purchase_equip.sql',
    sentinel: `SELECT to_regprocedure('public._guard_talent_points_client_write()') IS NOT NULL`,
    source: 'public._complete_mission_daily(uuid,date,integer)',
  },
};
if (!specs[stage] || !probe || !database || !/^[a-z][a-z0-9_]*$/.test(database) || !/^\d+$/.test(port)) {
  throw new Error('usage: node probe_preflight.mjs <a1|a12|p13> <case> <database> [port]');
}
const spec = specs[stage];
const psql = 'C:/Program Files/PostgreSQL/17/bin/psql.exe';
const connection = ['-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', database];
function run(args, input) {
  const result = spawnSync(psql, [...connection, ...args], { input, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (result.error) throw result.error;
  return result;
}
function scalar(sql) {
  const r = run(['-A', '-t', '-c', sql]);
  if (r.status !== 0) throw new Error(`catalog query failed: ${r.stderr}`);
  return r.stdout.trim();
}
if (scalar(spec.sentinel) !== 'f') throw new Error(`not a pre-${stage} database: sentinel exists`);
function definition(signature) {
  const r = run(['-A', '-t', '-c', `SELECT pg_get_functiondef('${signature}'::regprocedure)`]);
  if (r.status !== 0) throw new Error(`definition query failed: ${r.stderr}`);
  // psql on Windows renders stored CRLF as CR-CR-LF in stdout. Rebuild one
  // executable statement, then introduce line-ending drift explicitly per case.
  return r.stdout.replace(/\r+\n/g, '\n').trimEnd() + ';';
}
function replaceOnce(source, from, to) {
  if (!source.includes(from)) throw new Error(`source text absent: ${JSON.stringify(from)}`);
  return source.replace(from, to);
}
const cases = {
  a1: {
    clean: '',
    service_grant: 'GRANT EXECUTE ON FUNCTION public._complete_mission_daily(uuid,date,integer) TO service_role;',
    owner: 'ALTER FUNCTION public.complete_mission(uuid) OWNER TO authenticated;',
    owner_daily: 'ALTER FUNCTION public._complete_mission_daily(uuid,date,integer) OWNER TO authenticated;',
    anon_helper: 'GRANT EXECUTE ON FUNCTION public._complete_mission_daily(uuid,date,integer) TO anon;',
    coexist_complete: `CREATE FUNCTION public.complete_mission(p_mission_id uuid, p_date date DEFAULT NULL)
      RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public
      AS $coexist$ BEGIN RETURN '{}'::jsonb; END $coexist$;
      ALTER FUNCTION public.complete_mission(uuid,date) OWNER TO authenticated;`,
    coexist_weekly: `CREATE FUNCTION public._complete_mission_with_weekly(p_mission_id uuid, p_date date DEFAULT NULL)
      RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public
      AS $coexist$ BEGIN RETURN '{}'::jsonb; END $coexist$;
      ALTER FUNCTION public._complete_mission_with_weekly(uuid,date) OWNER TO authenticated;`,
    source_crlf: () => definition(spec.source).replace(/\r?\n/g, '\r\n'),
    source_isolated_cr: () => replaceOnce(definition(spec.source).replace(/\r\n/g, '\n'), 'AS $function$\n', 'AS $function$\r'),
    source_semantic: () => replaceOnce(definition(spec.source), 'auth.uid()', 'NULL'),
  },
  a12: {
    clean: '',
    service_grant: 'GRANT EXECUTE ON FUNCTION public._grant_flow_xp_buff(uuid) TO service_role;',
    owner: 'ALTER FUNCTION public.complete_mission(uuid,date) OWNER TO authenticated;',
    owner_private_helper: 'ALTER FUNCTION private.undo_mission_attribute_awards(uuid,date,uuid,boolean,date) OWNER TO authenticated;',
    anon_rpc: 'GRANT EXECUTE ON FUNCTION public.complete_mission(uuid,date) TO anon;',
    anon_flow: 'GRANT EXECUTE ON FUNCTION public._grant_flow_xp_buff(uuid) TO anon;',
    anon_health: 'GRANT EXECUTE ON FUNCTION public._apply_mission_health_effects(uuid,numeric,integer,integer) TO anon;',
    revoke_rpc: 'REVOKE EXECUTE ON FUNCTION public.complete_mission(uuid,date) FROM authenticated;',
    default_rpc: () => replaceOnce(definition(spec.source), 'p_date date DEFAULT NULL::date', 'p_date date DEFAULT CURRENT_DATE'),
    argname_rpc: () => `DROP FUNCTION public.complete_mission(uuid,date);\n${replaceOnce(definition(spec.source), 'public.complete_mission(p_mission_id uuid', 'public.complete_mission(p_id uuid')}\nREVOKE EXECUTE ON FUNCTION public.complete_mission(uuid,date) FROM PUBLIC, anon;\nGRANT EXECUTE ON FUNCTION public.complete_mission(uuid,date) TO authenticated;`,
    return_rpc: () => `DROP FUNCTION public.complete_mission(uuid,date);\n${replaceOnce(definition(spec.source), 'RETURNS jsonb', 'RETURNS text')}\nREVOKE EXECUTE ON FUNCTION public.complete_mission(uuid,date) FROM PUBLIC, anon;\nGRANT EXECUTE ON FUNCTION public.complete_mission(uuid,date) TO authenticated;`,
    source_crlf: () => definition(spec.source).replace(/\r?\n/g, '\r\n'),
    source_isolated_cr: () => replaceOnce(definition(spec.source).replace(/\r\n/g, '\n'), 'AS $function$\n', 'AS $function$\r'),
    source_semantic: () => replaceOnce(definition(spec.source), 'auth.uid()', 'NULL'),
    security_rpc: 'ALTER FUNCTION public.complete_mission(uuid,date) SECURITY INVOKER;',
    config_rpc: 'ALTER FUNCTION public.complete_mission(uuid,date) SET search_path TO pg_catalog;',
  },
  p13: {
    clean: '',
    service_grant: 'GRANT EXECUTE ON FUNCTION public._complete_mission_daily(uuid,date,integer) TO service_role;',
    owner_helper: 'ALTER FUNCTION public._complete_mission_daily(uuid,date,integer) OWNER TO authenticated;',
    owner_curve: 'ALTER FUNCTION public.get_level_from_xp_v2(integer) OWNER TO authenticated;',
    owner_trigger: 'ALTER FUNCTION public.sync_talent_points_on_level_change() OWNER TO authenticated;',
    anon_helper: 'GRANT EXECUTE ON FUNCTION public._complete_mission_daily(uuid,date,integer) TO anon;',
    revoke_curve: 'REVOKE EXECUTE ON FUNCTION public.get_level_from_xp_v2(integer) FROM PUBLIC, anon, authenticated;',
    revoke_trigger: 'REVOKE EXECUTE ON FUNCTION public.sync_talent_points_on_level_change() FROM PUBLIC, anon, authenticated;',
    default_helper: () => replaceOnce(definition(spec.source), 'p_hour integer DEFAULT 12', 'p_hour integer DEFAULT 13'),
    return_helper: () => `DROP FUNCTION public._complete_mission_daily(uuid,date,integer);\n${replaceOnce(definition(spec.source), 'RETURNS jsonb', 'RETURNS text')}\nREVOKE EXECUTE ON FUNCTION public._complete_mission_daily(uuid,date,integer) FROM PUBLIC, anon, authenticated;`,
    source_crlf: () => definition(spec.source).replace(/\r?\n/g, '\r\n'),
    source_isolated_cr: () => replaceOnce(definition(spec.source).replace(/\r\n/g, '\n'), 'AS $function$\n', 'AS $function$\r'),
    source_semantic: () => replaceOnce(definition(spec.source), 'auth.uid()', 'NULL'),
    security_helper: 'ALTER FUNCTION public._complete_mission_daily(uuid,date,integer) SECURITY INVOKER;',
    config_helper: 'ALTER FUNCTION public._complete_mission_daily(uuid,date,integer) SET search_path TO pg_catalog;',
  },
};
if (!(probe in cases[stage])) throw new Error(`unknown ${stage} case ${probe}`);
const mutation = typeof cases[stage][probe] === 'function' ? cases[stage][probe]() : cases[stage][probe];
const migration = readFileSync(spec.migration, 'utf8').replace(/\r\n/g, '\n');
const coexistSignature = probe === 'coexist_complete' ? 'public.complete_mission(uuid,date)' : probe === 'coexist_weekly' ? 'public._complete_mission_with_weekly(uuid,date)' : null;
const postcheck = coexistSignature ? `IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='${coexistSignature}'::regprocedure) <> 'authenticated' THEN RAISE EXCEPTION 'COEXIST_OWNER_NOT_PRESERVED'; END IF; RAISE NOTICE 'COEXIST_OWNER_AUTHENTICATED';` : '';
const prefix = `BEGIN;\nSET LOCAL statement_timeout='60s';\n${mutation}\nDO $probe$ BEGIN RAISE NOTICE 'PROBE_MUTATION_APPLIED'; END $probe$;\n`;
const input = `${prefix}${migration}\nDO $probe$ BEGIN IF NOT (${spec.sentinel}) THEN RAISE EXCEPTION 'MIGRATION_SENTINEL_ABSENT'; END IF; ${postcheck} RAISE NOTICE 'PROBE_MIGRATION_ACCEPTED'; END $probe$;\nROLLBACK;\n`;
const result = run(['-f', '-'], input);
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
const marker = (result.stdout ?? '') + (result.stderr ?? '');
const after = scalar(spec.sentinel);
const guardTerminator = stage === 'a1' ? '$source_guard$;' : '$preflight$;';
const preflightEnd = prefix.split('\n').length - 1 + migration.slice(0, migration.indexOf(guardTerminator) + guardTerminator.length).split('\n').length;
const errorLine = Number((result.stderr ?? '').match(/psql:<stdin>:(\d+): (?:ERRO|ERROR):/)?.[1] ?? 0);
const preflightRejected = result.status === 3 && errorLine > 0 && errorLine <= preflightEnd;
console.log(`PROBE_RESULT stage=${stage} case=${probe} psql_exit=${result.status} mutation_applied=${marker.includes('PROBE_MUTATION_APPLIED')} migration_accepted=${marker.includes('PROBE_MIGRATION_ACCEPTED')} preflight_rejected=${preflightRejected} sentinel_after=${after}`);
if (after !== 'f' || !marker.includes('PROBE_MUTATION_APPLIED') || ![0, 3].includes(result.status)) process.exit(2);
