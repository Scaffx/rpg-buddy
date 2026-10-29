-- Reduced local PG17 only; public wrappers run as authenticated. No production SQL.
BEGIN;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='5s';

INSERT INTO auth.users(id,email) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001','d1-a@example.invalid'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0002','d1-b@example.invalid');

-- Trusted historical row existed yesterday. Client-created rows below cannot
-- claim this timestamp even if the payload supplies it.
INSERT INTO public.missions(id,user_id,title,attribute_id,priority,frequency_type,days_of_week,created_at)
SELECT 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0001',u.id,'daily-existing',a.id,'baixa','daily',
  jsonb_build_array('Dom','Seg','Ter','Qua','Qui','Sex','Sáb'), now()-interval '1 day'
FROM auth.users u JOIN public.attributes a ON a.user_id=u.id
WHERE u.id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001';
-- Older row converted/started as weekly today: creation alone is insufficient.
INSERT INTO public.missions(id,user_id,title,attribute_id,priority,frequency_type,
  days_of_week,created_at,target_count,max_count)
SELECT 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0004',u.id,'weekly-started-today',a.id,
  'baixa','weekly','[]'::jsonb,now()-interval '1 day',2,2
FROM auth.users u JOIN public.attributes a ON a.user_id=u.id
WHERE u.id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001';

SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.missions(id,user_id,title,attribute_id,priority,frequency_type,days_of_week,created_at)
SELECT 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0002',a.user_id,'daily-forged',a.id,'baixa','daily',
  jsonb_build_array('Dom','Seg','Ter','Qua','Qui','Sex','Sáb'), now()-interval '30 days'
FROM public.attributes a WHERE a.user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001';
INSERT INTO public.missions(id,user_id,title,attribute_id,priority,frequency_type,days_of_week,
  created_at,weekly_started_at,target_count,max_count)
SELECT 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0003',a.user_id,'weekly-forged',a.id,'baixa','weekly',
  '[]'::jsonb,now()-interval '30 days',now()-interval '30 days',2,2
FROM public.attributes a WHERE a.user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001';

DO $test$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_before timestamptz;
  v_result jsonb;
  v_xp integer;
BEGIN
  IF EXISTS (SELECT 1 FROM public.missions WHERE id IN
      ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0002','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0003')
      AND (created_at AT TIME ZONE 'America/Sao_Paulo')::date <> v_today)
     OR (SELECT (weekly_started_at AT TIME ZONE 'America/Sao_Paulo')::date
         FROM public.missions WHERE id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0003') <> v_today THEN
    RAISE EXCEPTION 'INSERT_TIMESTAMP_FORGERY_ACCEPTED';
  END IF;
  SELECT created_at INTO v_before FROM public.missions WHERE id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0002';
  BEGIN
    UPDATE public.missions SET created_at=now()-interval '30 days'
     WHERE id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0002';
    RAISE EXCEPTION 'EXPECTED_CREATED_AT_REJECTION';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'MISSION_CREATED_AT_IMMUTABLE' THEN RAISE; END IF;
  END;
  IF (SELECT created_at FROM public.missions WHERE id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0002') <> v_before THEN
    RAISE EXCEPTION 'CREATED_AT_CHANGED_AFTER_REJECTION';
  END IF;
  UPDATE public.missions SET title='daily-edited' WHERE id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0002';
  IF (SELECT title FROM public.missions WHERE id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0002') <> 'daily-edited' THEN
    RAISE EXCEPTION 'LEGITIMATE_EDIT_BLOCKED';
  END IF;

  BEGIN
    PERFORM public.complete_mission('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0002',v_today-1);
    RAISE EXCEPTION 'EXPECTED_DAILY_BEFORE_START';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'MISSION_BEFORE_START' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.complete_mission('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0003',v_today-1);
    RAISE EXCEPTION 'EXPECTED_WEEKLY_BEFORE_START';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'MISSION_BEFORE_START' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.complete_mission('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0004',v_today-1);
    RAISE EXCEPTION 'EXPECTED_WEEKLY_START_REJECTION';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'MISSION_BEFORE_START' THEN RAISE; END IF;
  END;
  IF (SELECT total_xp FROM public.profiles WHERE user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001') <> 0
     OR (SELECT gold FROM public.user_balance WHERE user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001') <> 100
     OR EXISTS (SELECT 1 FROM public.mission_daily_completions WHERE mission_id IN
       ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0002','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0003',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0004')) THEN
    RAISE EXCEPTION 'BEFORE_START_MUTATED_REWARD';
  END IF;

  BEGIN
    PERFORM public.complete_mission('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0001',v_today-2);
    RAISE EXCEPTION 'EXPECTED_D2_REJECTION';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'DATE_OUT_OF_WINDOW' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.complete_mission('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0001',v_today+1);
    RAISE EXCEPTION 'EXPECTED_FUTURE_REJECTION';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'DATE_OUT_OF_WINDOW' THEN RAISE; END IF;
  END;

  v_result := public.complete_mission('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0001',v_today-1);
  IF (v_result->>'completed_date')::date <> v_today-1 OR (v_result->>'is_backfill')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'YESTERDAY_RESULT_INVALID';
  END IF;
  SELECT total_xp INTO v_xp FROM public.profiles WHERE user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001';
  BEGIN
    PERFORM public.complete_mission('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0001',v_today-1);
    RAISE EXCEPTION 'EXPECTED_DUPLICATE_REJECTION';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'EXPECTED_DUPLICATE_REJECTION' THEN RAISE; END IF;
  END;
  IF (SELECT total_xp FROM public.profiles WHERE user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001') <> v_xp
     OR (SELECT count(*) FROM public.mission_daily_completions
         WHERE mission_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0001' AND completion_date=v_today-1) <> 1 THEN
    RAISE EXCEPTION 'DUPLICATE_CHANGED_REWARD';
  END IF;
  PERFORM public.undo_mission('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0001',v_today-1);
  IF EXISTS (SELECT 1 FROM public.mission_daily_completions
      WHERE mission_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0001' AND completion_date=v_today-1)
     OR (SELECT total_xp FROM public.profiles WHERE user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001') <> 0 THEN
    RAISE EXCEPTION 'UNDO_D1_INCOMPLETE';
  END IF;
  PERFORM public.complete_mission('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0001',v_today-1);
  PERFORM public.complete_mission('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0001',v_today);
  IF (SELECT count(*) FROM public.mission_daily_completions
      WHERE mission_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0001') <> 2 THEN
    RAISE EXCEPTION 'TODAY_YESTERDAY_NOT_SEPARATE';
  END IF;
  RAISE NOTICE 'MISSION_D1_WRAPPER_PASS';
END;
$test$;

-- Weekly start is immutable on ordinary edits and renewed on format changes.
DO $test$
DECLARE
  v_start timestamptz;
BEGIN
  SELECT weekly_started_at INTO v_start FROM public.missions WHERE id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0003';
  UPDATE public.missions SET weekly_started_at=now()-interval '30 days'
   WHERE id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0003';
  IF (SELECT weekly_started_at FROM public.missions WHERE id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0003') <> v_start THEN
    RAISE EXCEPTION 'WEEKLY_START_FORGED_ON_UPDATE';
  END IF;
  UPDATE public.missions SET frequency_type='weekly',target_count=1,max_count=1
   WHERE id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0002';
  IF (SELECT weekly_started_at FROM public.missions WHERE id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0002') IS NULL THEN
    RAISE EXCEPTION 'DAILY_TO_WEEKLY_START_MISSING';
  END IF;
  UPDATE public.missions SET frequency_type='daily' WHERE id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0002';
  IF (SELECT weekly_started_at FROM public.missions WHERE id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0002') IS NOT NULL THEN
    RAISE EXCEPTION 'WEEKLY_TO_DAILY_START_NOT_CLEARED';
  END IF;
  UPDATE public.missions SET frequency_type='weekly' WHERE id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0002';
  IF (SELECT weekly_started_at FROM public.missions WHERE id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0002') IS NULL THEN
    RAISE EXCEPTION 'SECOND_CONVERSION_START_MISSING';
  END IF;
  RAISE NOTICE 'MISSION_D1_TIMESTAMP_PASS';
END;
$test$;

SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0002',true);
DO $test$
DECLARE v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  BEGIN
    PERFORM public.complete_mission('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0001',v_today);
    RAISE EXCEPTION 'EXPECTED_CROSS_IDENTITY_REJECTION';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'MISSION_NOT_FOUND' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'MISSION_D1_IDENTITY_PASS';
END;
$test$;
RESET ROLE;
-- Simulate a legacy weekly row with NULL start; no client-supplied value may
-- become the fallback after the corrected trigger runs.
SELECT set_config('request.jwt.claim.sub','',true);
ALTER TABLE public.missions DISABLE TRIGGER set_mission_weekly_started_at;
UPDATE public.missions SET weekly_started_at=NULL WHERE id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0003';
ALTER TABLE public.missions ENABLE TRIGGER set_mission_weekly_started_at;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001',true);
SET LOCAL ROLE authenticated;
UPDATE public.missions SET weekly_started_at=now()-interval '30 days'
 WHERE id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0003';
DO $test$
BEGIN
  IF (SELECT weekly_started_at=created_at FROM public.missions
      WHERE id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0003') IS NOT TRUE THEN
    RAISE EXCEPTION 'LEGACY_NULL_WEEKLY_START_FORGED';
  END IF;
  RAISE NOTICE 'MISSION_D1_LEGACY_START_PASS';
END;
$test$;
RESET ROLE;
CREATE ROLE d1_inherited_auth_test NOLOGIN INHERIT IN ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001',true);
SET LOCAL ROLE d1_inherited_auth_test;
INSERT INTO public.missions(id,user_id,title,attribute_id,priority,frequency_type,
  days_of_week,created_at,weekly_started_at,target_count,max_count)
SELECT 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0005',a.user_id,'inherited-role-forgery',a.id,
  'baixa','weekly','[]'::jsonb,now()-interval '30 days',now()-interval '30 days',2,2
FROM public.attributes a WHERE a.user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001';
DO $test$
DECLARE v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF (SELECT (created_at AT TIME ZONE 'America/Sao_Paulo')::date
      FROM public.missions WHERE id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0005') <> v_today
     OR (SELECT (weekly_started_at AT TIME ZONE 'America/Sao_Paulo')::date
      FROM public.missions WHERE id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0005') <> v_today THEN
    RAISE EXCEPTION 'INHERITED_ROLE_TIMESTAMP_FORGERY_ACCEPTED';
  END IF;
  BEGIN
    UPDATE public.missions SET created_at=now()-interval '30 days'
     WHERE id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0005';
    RAISE EXCEPTION 'EXPECTED_INHERITED_ROLE_UPDATE_REJECTION';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'MISSION_CREATED_AT_IMMUTABLE' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'MISSION_D1_INHERITED_ROLE_PASS';
END;
$test$;
RESET ROLE;
DO $test$
BEGIN
  IF has_function_privilege('anon','public.complete_mission(uuid,date)','EXECUTE')
     OR has_function_privilege('anon','public.undo_mission(uuid,date)','EXECUTE')
     OR has_function_privilege('authenticated','public._evaluate_weekly_missions(uuid,date)','EXECUTE') THEN
    RAISE EXCEPTION 'MISSION_D1_ACL_INVALID';
  END IF;
  RAISE NOTICE 'MISSION_D1_ACL_PASS';
END;
$test$;
ROLLBACK;
