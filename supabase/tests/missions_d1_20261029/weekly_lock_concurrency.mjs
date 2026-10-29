// Reduced PG17 fixture: Tuesday closure versus another authenticated mission
// completion for the same user. Local-only notices/sleep force the lock order.
import { spawn, spawnSync } from 'node:child_process';

const database = process.argv[2];
const port = process.argv[3];
const mode = process.argv[4] ?? 'complete';
if (!database?.startsWith('integration_d1_') || !/^\d{2,5}$/.test(port ?? '')) {
  console.error('Usage: node weekly_lock_concurrency.mjs integration_d1_<db> <local-port> [complete|undo]');
  process.exit(2);
}
if (!['complete','undo'].includes(mode)) process.exit(2);
const psql = process.env.PSQL17 ?? (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/17/bin/psql.exe' : 'psql');
const args = ['-X','-At','-q','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',port,'-U','postgres','-d',database,'-f','-'];
function run(sql) { return spawnSync(psql,args,{input:sql,encoding:'utf8',maxBuffer:1024*1024}); }
const user = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0092';
const weekly = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0092';
const daily = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0093';
const setup = run(`
INSERT INTO auth.users(id,email) VALUES ('${user}','d1-lock@example.invalid');
INSERT INTO public.missions(id,user_id,title,attribute_id,priority,frequency_type,days_of_week)
SELECT '${daily}',a.user_id,'daily-to-${mode}',a.id,'baixa','daily',
  jsonb_build_array('Dom','Seg','Ter','Qua','Qui','Sex','Sáb')
FROM public.attributes a WHERE a.user_id='${user}';
${mode === 'undo' ? `SELECT set_config('request.jwt.claim.sub','${user}',false); SET ROLE authenticated;
SELECT public.complete_mission('${daily}',(now() AT TIME ZONE 'America/Sao_Paulo')::date);
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);` : ''}
INSERT INTO public.missions(id,user_id,title,attribute_id,priority,frequency_type,days_of_week,created_at,target_count,max_count)
SELECT '${weekly}',a.user_id,'weekly-to-close',a.id,'baixa','weekly','[]'::jsonb,
  '2026-10-05 12:00:00-03'::timestamptz,1,1
FROM public.attributes a WHERE a.user_id='${user}';
ALTER TABLE public.missions DISABLE TRIGGER set_mission_weekly_started_at;
UPDATE public.missions SET weekly_started_at='2026-10-05 12:00:00-03'::timestamptz WHERE id='${weekly}';
ALTER TABLE public.missions ENABLE TRIGGER set_mission_weekly_started_at;
INSERT INTO public.mission_weekly_progress(mission_id,user_id,week_start,evaluation_status,evaluated_at)
VALUES ('${weekly}','${user}','2026-10-12','protected',now());
UPDATE public.profiles SET streak_protector_week='2026-10-26',streak_protector_charges=0 WHERE user_id='${user}';
DO $clock$
DECLARE v_def text; v_old text;
BEGIN
  v_def := pg_get_functiondef('public.check_weekly_mission_failures()'::regprocedure);
  v_old := 'v_today date := (now() AT TIME ZONE ''America/Sao_Paulo'')::date;';
  IF length(v_def)-length(replace(v_def,v_old,'')) <> length(v_old) THEN RAISE EXCEPTION 'CHECK_CLOCK_ANCHOR_DRIFT'; END IF;
  EXECUTE replace(v_def,v_old,'v_today date := DATE ''2026-10-27'';');
  v_def := pg_get_functiondef('public._evaluate_weekly_missions(uuid,date)'::regprocedure);
  v_old := '  IF v_protector_week IS DISTINCT FROM v_current_week::text THEN';
  IF length(v_def)-length(replace(v_def,v_old,'')) <> length(v_old) THEN RAISE EXCEPTION 'EVALUATOR_INSTRUMENT_ANCHOR_DRIFT'; END IF;
  EXECUTE replace(v_def,v_old,E'  RAISE NOTICE ''MISSION_D1_PROFILE_LOCKED'';\\n  PERFORM pg_catalog.pg_sleep(2);\\n\\n'||v_old);
END;
$clock$;
`);
if (setup.status !== 0) { console.error(`Setup failed: ${setup.stderr}`); process.exit(1); }
const identity = `SELECT set_config('request.jwt.claim.sub','${user}',false); SET ROLE authenticated;`;
const closure = spawn(psql,args,{stdio:['pipe','pipe','pipe']});
let closureOut='', closureErr='';
const closed = new Promise(resolve => closure.on('close',resolve));
const profileLocked = new Promise((resolve,reject) => {
  closure.stdout.on('data',c => { closureOut += c.toString(); });
  closure.stderr.on('data',c => {
    closureErr += c.toString();
    if (closureErr.includes('MISSION_D1_PROFILE_LOCKED')) resolve();
  });
  closure.on('close',code => { if (!closureErr.includes('MISSION_D1_PROFILE_LOCKED')) reject(new Error(`closure exited ${code}: ${closureErr}`)); });
});
closure.stdin.end(`${identity}\nSELECT public.check_weekly_mission_failures();`);
await profileLocked;
const started = Date.now();
const action = mode === 'undo' ? 'undo_mission' : 'complete_mission';
const completion = run(`${identity}\nSELECT public.${action}('${daily}',(now() AT TIME ZONE 'America/Sao_Paulo')::date);`);
const waitedMs = Date.now()-started;
const closureExit = await closed;
const verdict = run(`SELECT (SELECT evaluation_status FROM public.mission_weekly_progress WHERE mission_id='${weekly}' AND week_start='2026-10-19') || '|' || (SELECT count(*) FROM public.mission_daily_completions WHERE mission_id='${daily}') || '|' || (SELECT total_xp FROM public.profiles WHERE user_id='${user}') || '|' || (SELECT gold FROM public.user_balance WHERE user_id='${user}');`);
const expectedVerdict = mode === 'undo' ? /^failed\|0\|0\|100\s*$/ : /^failed\|1\|[1-9][0-9]*\|[1-9][0-9]*\s*$/;
if (closureExit !== 0 || completion.status !== 0 || waitedMs < 800 || verdict.status !== 0
    || !expectedVerdict.test(verdict.stdout)
    || /40P01|deadlock/i.test(closureErr+completion.stderr)) {
  console.error(`Lock order failed: closure=${closureExit} completion=${completion.status} wait=${waitedMs}ms verdict=${verdict.stdout}\n${closureErr}\n${completion.stderr}`);
  process.exit(1);
}
console.log(`MISSION_D1_WEEKLY_LOCK_${mode.toUpperCase()}_PASS: closure and ${mode} exit=0, waited ${waitedMs}ms; verdict/reward ${verdict.stdout.trim()}`);
