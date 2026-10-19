// Run against integration_cold_pre_a12 only. One psql transaction rolls back
// the owner mutation, migration install, and synthetic user/mission.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const source = readFileSync('supabase/migrations/20261019220257_undo_mission_derived_effect_receipts.sql', 'utf8')
  .replace(/\r\n/g, '\n');
const prefix = `BEGIN;
SET LOCAL statement_timeout='30s';
ALTER FUNCTION public.complete_mission(uuid,date) OWNER TO authenticated;
`;
const suffix = `
DO $owner$
BEGIN
 IF (SELECT pg_get_userbyid(proowner) FROM pg_proc
      WHERE oid='public.complete_mission(uuid,date)'::regprocedure) <> 'authenticated'
 THEN RAISE EXCEPTION 'owner mutation was overwritten'; END IF;
 IF to_regclass('private.mission_effect_receipts') IS NULL
 THEN RAISE EXCEPTION 'A12 did not install'; END IF;
 RAISE NOTICE 'A12_PREFLIGHT_ACCEPTED_OWNER_DRIFT';
END $owner$;
INSERT INTO auth.users(id,email) VALUES
 ('a1200000-0000-0000-0000-000000000001','cold-owner-drift@example.invalid');
INSERT INTO public.missions(id,user_id,title,priority,frequency_type,days_of_week,mission_category)
VALUES ('a1200000-0000-0000-0000-000000000101',
 'a1200000-0000-0000-0000-000000000001','owner drift','media','daily',
 '["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]','geral');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='a1200000-0000-0000-0000-000000000001';
DO $call$
DECLARE denied boolean := false;
BEGIN
 BEGIN
   PERFORM public.complete_mission('a1200000-0000-0000-0000-000000000101',
      (now() AT TIME ZONE 'America/Sao_Paulo')::date);
 EXCEPTION WHEN insufficient_privilege THEN
   denied := true;
   RAISE NOTICE 'RUNTIME_DENIED_AFTER_OWNER_DRIFT: %',SQLERRM;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'expected owner drift to break runtime'; END IF;
END $call$;
ROLLBACK;
`;
const result = spawnSync('C:/Program Files/PostgreSQL/17/bin/psql.exe',
  ['-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', '55579', '-U', 'postgres',
    '-d', 'integration_cold_pre_a12', '-f', '-'],
  { input: prefix + source + suffix, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
process.exit(result.status ?? 1);
