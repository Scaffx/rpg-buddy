-- Reduced local PG17 only. Instrument time inside this rollback transaction;
-- public check/complete/undo wrappers and the real evaluator remain in use.
BEGIN;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='5s';
INSERT INTO auth.users(id,email) VALUES
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0011','d1-weekly@example.invalid');
INSERT INTO public.missions(id,user_id,title,attribute_id,priority,frequency_type,
  days_of_week,created_at,target_count,max_count)
SELECT v.id,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0011',v.title,a.id,'baixa','weekly',
  '[]'::jsonb,'2026-10-19 12:00:00-03'::timestamptz,1,1
FROM public.attributes a CROSS JOIN (VALUES
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0011'::uuid,'sunday-done'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0012'::uuid,'sunday-missed')) AS v(id,title)
WHERE a.user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0011';
-- Trusted legacy seed: the row started in the previous week. This is not a
-- client-facing write and happens only inside the rollback test.
ALTER TABLE public.missions DISABLE TRIGGER set_mission_weekly_started_at;
UPDATE public.missions SET weekly_started_at='2026-10-19 12:00:00-03'::timestamptz
 WHERE id IN ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0011','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0012');
ALTER TABLE public.missions ENABLE TRIGGER set_mission_weekly_started_at;

DO $clock$
DECLARE v_def text; v_old text; v_new text;
BEGIN
  v_def := pg_get_functiondef('public.complete_mission(uuid,date)'::regprocedure);
  v_old := 'v_server_today date := (now() AT TIME ZONE ''America/Sao_Paulo'')::date;';
  v_new := 'v_server_today date := DATE ''2026-10-26'';';
  IF length(v_def)-length(replace(v_def,v_old,'')) <> length(v_old) THEN RAISE EXCEPTION 'COMPLETE_CLOCK_ANCHOR_DRIFT'; END IF;
  EXECUTE replace(v_def,v_old,v_new);

  v_def := pg_get_functiondef('public._complete_mission_with_weekly(uuid,date)'::regprocedure);
  v_old := 'v_local_now timestamp := now() AT TIME ZONE ''America/Sao_Paulo'';';
  v_new := 'v_local_now timestamp := TIMESTAMP ''2026-10-26 12:00:00'';';
  IF length(v_def)-length(replace(v_def,v_old,'')) <> length(v_old) THEN RAISE EXCEPTION 'DISPATCH_CLOCK_ANCHOR_DRIFT'; END IF;
  EXECUTE replace(v_def,v_old,v_new);

  v_def := pg_get_functiondef('public.undo_mission(uuid,date)'::regprocedure);
  v_old := 'v_server_date date := (now() AT TIME ZONE ''America/Sao_Paulo'')::date;';
  v_new := 'v_server_date date := DATE ''2026-10-26'';';
  IF length(v_def)-length(replace(v_def,v_old,'')) <> length(v_old) THEN RAISE EXCEPTION 'UNDO_CLOCK_ANCHOR_DRIFT'; END IF;
  EXECUTE replace(v_def,v_old,v_new);

  v_def := pg_get_functiondef('public.check_weekly_mission_failures()'::regprocedure);
  v_old := 'v_today date := (now() AT TIME ZONE ''America/Sao_Paulo'')::date;';
  v_new := 'v_today date := DATE ''2026-10-26'';';
  IF length(v_def)-length(replace(v_def,v_old,'')) <> length(v_old) THEN RAISE EXCEPTION 'WEEKLY_CLOCK_ANCHOR_DRIFT'; END IF;
  EXECUTE replace(v_def,v_old,v_new);
END;
$clock$;

SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0011',true);
SET LOCAL ROLE authenticated;
SELECT public.check_weekly_mission_failures();
RESET ROLE;
DO $test$
BEGIN
  IF EXISTS (SELECT 1 FROM public.mission_weekly_progress
      WHERE mission_id IN ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0011',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0012') AND week_start='2026-10-19')
     OR (SELECT streak_protector_charges FROM public.profiles
         WHERE user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0011') <> 2 THEN
    RAISE EXCEPTION 'MONDAY_PREMATURE_VERDICT';
  END IF;
  RAISE NOTICE 'MISSION_D1_MONDAY_OPEN_PASS';
END;
$test$;

SET LOCAL ROLE authenticated;
SELECT public.complete_mission('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0011','2026-10-25');
RESET ROLE;
DO $test$
BEGIN
  IF (SELECT completion_date FROM public.mission_daily_completions
      WHERE mission_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0011') <> '2026-10-25'
     OR (SELECT week_start FROM public.mission_weekly_progress
         WHERE mission_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0011') <> '2026-10-19' THEN
    RAISE EXCEPTION 'SUNDAY_BACKFILL_WEEK_INVALID';
  END IF;
  RAISE NOTICE 'MISSION_D1_SUNDAY_MONDAY_PASS';
END;
$test$;

-- Undo is still on Monday, inside the D-1 window. It must restore the slot.
SET LOCAL ROLE authenticated;
SELECT public.undo_mission('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0011','2026-10-25');
RESET ROLE;
DO $test$
BEGIN
  IF (SELECT evaluation_status FROM public.mission_weekly_progress
      WHERE mission_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0011' AND week_start='2026-10-19') <> 'pending'
     OR (SELECT evaluated_at FROM public.mission_weekly_progress
      WHERE mission_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0011' AND week_start='2026-10-19') IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.mission_daily_completions
      WHERE mission_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0011') THEN
    RAISE EXCEPTION 'MONDAY_SUNDAY_UNDO_INVALID';
  END IF;
  RAISE NOTICE 'MISSION_D1_WEEKLY_UNDO_MONDAY_PASS';
END;
$test$;

SET LOCAL ROLE authenticated;
SELECT public.complete_mission('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0011','2026-10-25');
RESET ROLE;
-- Advance all instrumented clocks together. Sunday is now D-2 for the RPCs.
DO $clock$
DECLARE v_def text; v_old text; v_new text; v_signature text;
BEGIN
  FOR v_signature,v_old,v_new IN SELECT * FROM (VALUES
    ('public.check_weekly_mission_failures()',
     'v_today date := DATE ''2026-10-26'';', 'v_today date := DATE ''2026-10-27'';'),
    ('public.complete_mission(uuid,date)',
     'v_server_today date := DATE ''2026-10-26'';', 'v_server_today date := DATE ''2026-10-27'';'),
    ('public._complete_mission_with_weekly(uuid,date)',
     'v_local_now timestamp := TIMESTAMP ''2026-10-26 12:00:00'';',
     'v_local_now timestamp := TIMESTAMP ''2026-10-27 12:00:00'';'),
    ('public.undo_mission(uuid,date)',
     'v_server_date date := DATE ''2026-10-26'';', 'v_server_date date := DATE ''2026-10-27'';')
  ) AS clocks(signature,old_anchor,new_anchor) LOOP
    v_def := pg_get_functiondef(to_regprocedure(v_signature));
    IF length(v_def)-length(replace(v_def,v_old,'')) <> length(v_old) THEN
      RAISE EXCEPTION 'TUESDAY_CLOCK_ANCHOR_DRIFT: %',v_signature;
    END IF;
    EXECUTE replace(v_def,v_old,v_new);
  END LOOP;
END;
$clock$;
SET LOCAL ROLE authenticated;
SELECT public.check_weekly_mission_failures();
RESET ROLE;
DO $test$
DECLARE v_xp integer; v_gold integer; v_count integer;
BEGIN
  IF (SELECT evaluation_status FROM public.mission_weekly_progress
      WHERE mission_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0011' AND week_start='2026-10-19') <> 'met'
     OR (SELECT evaluation_status FROM public.mission_weekly_progress
      WHERE mission_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0012' AND week_start='2026-10-19') <> 'grace'
     OR (SELECT streak_protector_charges FROM public.profiles
         WHERE user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0011') <> 2 THEN
    RAISE EXCEPTION 'TUESDAY_CLOSURE_INVALID';
  END IF;
  RAISE NOTICE 'MISSION_D1_TUESDAY_CLOSE_PASS';
END;
$test$;

SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_xp integer; v_gold integer; v_count integer;
BEGIN
  SELECT total_xp INTO v_xp FROM public.profiles WHERE user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0011';
  SELECT gold INTO v_gold FROM public.user_balance WHERE user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0011';
  SELECT count(*) INTO v_count FROM public.mission_daily_completions
   WHERE mission_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0011';
  BEGIN
    PERFORM public.complete_mission('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0011','2026-10-25');
    RAISE EXCEPTION 'EXPECTED_TUESDAY_COMPLETE_REJECTION';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'DATE_OUT_OF_WINDOW' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.undo_mission('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0011','2026-10-25');
    RAISE EXCEPTION 'EXPECTED_TUESDAY_UNDO_REJECTION';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'DATE_OUT_OF_WINDOW' THEN RAISE; END IF;
  END;
  IF (SELECT total_xp FROM public.profiles WHERE user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0011') <> v_xp
     OR (SELECT gold FROM public.user_balance WHERE user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0011') <> v_gold
     OR (SELECT count(*) FROM public.mission_daily_completions
         WHERE mission_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0011') <> v_count THEN
    RAISE EXCEPTION 'TUESDAY_D2_MUTATED';
  END IF;
  RAISE NOTICE 'MISSION_D1_TUESDAY_D2_PASS';
END;
$test$;
RESET ROLE;
ROLLBACK;
