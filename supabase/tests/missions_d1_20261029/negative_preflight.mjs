// Run only against an isolated, pre-migration PG17 database prepared by
// prepare_predecessors.mjs. Each drift and the attempted migration roll back.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const database = process.argv[2];
const port = process.argv[3];
if (!database?.startsWith('integration_d1_') || !/^\d{2,5}$/.test(port ?? '')) {
  console.error('Usage: node negative_preflight.mjs integration_d1_<db> <local-port>');
  process.exit(2);
}
const psql = process.env.PSQL17 ?? (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/17/bin/psql.exe' : 'psql');
const migration = readFileSync(resolve('supabase/migrations/20261029054922_mission_d1_server_start_and_weekly_close.sql'), 'utf8').replace(/\r\n/g, '\n');
const common = ['-X','-v','ON_ERROR_STOP=1','-v','VERBOSITY=terse','-h','127.0.0.1','-p',port,'-U','postgres','-d',database];
function run(sql) {
  return spawnSync(psql, [...common,'-At','-f','-'], {input:sql,encoding:'utf8',maxBuffer:4*1024*1024});
}
const stateSql = `SELECT encode(sha256(convert_to(replace(pg_get_functiondef('public.complete_mission(uuid,date)'::regprocedure),E'\r\n',E'\n'),'UTF8')),'hex')
  || '|' || (SELECT count(*) FROM pg_proc WHERE oid=to_regprocedure('private.guard_mission_created_at()'))
  || '|' || (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.missions'::regclass AND tgname='guard_mission_created_at');`;
const baseline = run(stateSql);
if (baseline.status !== 0 || !baseline.stdout.startsWith('34317f24abdf4215c1837db9bbf3887f0aa6f6babc0e8d2a58ff5033f93e177f|0|0')) {
  console.error('Not a clean pre-migration predecessor:', baseline.stderr, baseline.stdout);
  process.exit(2);
}
const cases = [
  ['body', `CREATE OR REPLACE FUNCTION private.lock_mission_priority_statement()
    RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$BEGIN RETURN NULL; END;$$;`, 'MISSION_D1_TABLE_TRIGGER_DRIFT'],
  ['acl', `GRANT EXECUTE ON FUNCTION public.complete_mission(uuid,date) TO anon;`, 'MISSION_D1_SOURCE_DRIFT'],
  ['overload', `CREATE FUNCTION public.complete_mission(text,date) RETURNS jsonb LANGUAGE sql AS $$SELECT '{}'::jsonb$$;`, 'MISSION_D1_SIGNATURE_OR_TRIGGER_DRIFT'],
  ['policy', `ALTER POLICY "Users can view own missions" ON public.missions USING (true);`, 'MISSION_D1_TABLE_AUTHORITY_DRIFT'],
  ['owner', `ALTER TABLE public.missions OWNER TO authenticated;`, 'MISSION_D1_TABLE_AUTHORITY_DRIFT'],
  ['unknown_trigger', `CREATE FUNCTION private.zz_d1_override_created_at() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW.created_at := now()-interval '30 days'; RETURN NEW; END;$$;
    CREATE TRIGGER zz_d1_override_created_at BEFORE INSERT OR UPDATE ON public.missions FOR EACH ROW EXECUTE FUNCTION private.zz_d1_override_created_at();`, 'MISSION_D1_TABLE_AUTHORITY_DRIFT'],
];
for (const [name,drift,expected] of cases) {
  const result = run(`BEGIN;\n${drift}\n${migration}\nCOMMIT;`);
  const after = run(stateSql);
  if (result.status !== 3 || !result.stderr.includes(expected) || after.status !== 0 || after.stdout !== baseline.stdout) {
    console.error(`${name} FAILED: exit=${result.status}, expected=${expected}\n${result.stderr}\nbefore=${baseline.stdout} after=${after.stdout}`);
    process.exit(1);
  }
  console.log(`MISSION_D1_PREFLIGHT_${name.toUpperCase()}_PASS: exit=3 ${expected}; catalog unchanged`);
}
