-- Run on a fully migrated local composition DB. The clock substitution and
-- all test rows are transactional and rolled back below.
\set ON_ERROR_STOP on
BEGIN;
CREATE SCHEMA test_clock;
CREATE FUNCTION test_clock.now() RETURNS timestamptz LANGUAGE sql STABLE AS $$
  SELECT current_setting('test_clock.now')::timestamptz
$$;
DO $clock$
DECLARE
  v_func regprocedure;
  v_def text;
  v_old text := 'now() AT TIME ZONE ''America/Sao_Paulo''';
BEGIN
  FOREACH v_func IN ARRAY ARRAY[
    'public._complete_mission_daily(uuid,date,integer)'::regprocedure,
    'public._complete_mission_with_weekly(uuid,date)'::regprocedure,
    'public.complete_mission(uuid,date)'::regprocedure,
    'public.undo_mission(uuid,date)'::regprocedure,
    'private.enforce_mission_priority()'::regprocedure
  ] LOOP
    v_def := pg_get_functiondef(v_func);
    IF position(v_old IN v_def) = 0 THEN
      RAISE EXCEPTION 'Clock resolver absent from %',v_func;
    END IF;
    EXECUTE replace(v_def,v_old,'test_clock.now() AT TIME ZONE ''America/Sao_Paulo''');
  END LOOP;
END $clock$;

SET test_clock.now = '2026-10-19 12:00:00-03';
INSERT INTO auth.users(id,email) VALUES
  ('77777777-7777-7777-7777-777777777777','integration-clock@example.invalid');
INSERT INTO public.attributes(user_id,name) VALUES
  ('77777777-7777-7777-7777-777777777777','Força');
INSERT INTO public.missions
  (id,user_id,title,attribute_id,priority,frequency_type,days_of_week,target_count,max_count)
SELECT '77777777-7777-7777-7777-777777777701',
  '77777777-7777-7777-7777-777777777777','Meta semanal com duas datas',id,
  'media','weekly','[]'::jsonb,1,2
FROM public.attributes
WHERE user_id='77777777-7777-7777-7777-777777777777' AND name='Disciplina';

SET request.jwt.claim.sub = '77777777-7777-7777-7777-777777777777';
SELECT public.complete_mission('77777777-7777-7777-7777-777777777701','2026-10-19');
SET test_clock.now = '2026-10-20 12:00:00-03';
SELECT public.complete_mission('77777777-7777-7777-7777-777777777701','2026-10-20');
DO $assert$
DECLARE v_count integer; v_paid boolean; v_milestone integer;
BEGIN
  SELECT current_count,milestone_paid INTO v_count,v_paid
  FROM public.mission_weekly_progress
  WHERE mission_id='77777777-7777-7777-7777-777777777701';
  SELECT xp_delta INTO v_milestone FROM private.mission_attribute_milestones
  WHERE mission_id='77777777-7777-7777-7777-777777777701';
  IF v_count <> 2 OR NOT v_paid OR coalesce(v_milestone,0) <= 0 THEN
    RAISE EXCEPTION 'Two real dates did not credit one weekly milestone: %, %, %',v_count,v_paid,v_milestone;
  END IF;
END $assert$;

-- Edit the mission's primary attribute after the reward. The receipt still
-- identifies the original attribute for eventual debit.
UPDATE public.missions SET attribute_id = (
  SELECT id FROM public.attributes
  WHERE user_id='77777777-7777-7777-7777-777777777777' AND name='Força'
) WHERE id='77777777-7777-7777-7777-777777777701';
SELECT public.undo_mission('77777777-7777-7777-7777-777777777701','2026-10-19');
DO $assert$
DECLARE v_count integer; v_paid boolean; v_original integer; v_milestone integer;
BEGIN
  SELECT current_count,milestone_paid INTO v_count,v_paid
  FROM public.mission_weekly_progress
  WHERE mission_id='77777777-7777-7777-7777-777777777701';
  SELECT xp_delta INTO v_milestone FROM private.mission_attribute_milestones
  WHERE mission_id='77777777-7777-7777-7777-777777777701';
  SELECT xp INTO v_original FROM public.attributes
  WHERE user_id='77777777-7777-7777-7777-777777777777' AND name='Disciplina';
  IF v_count <> 1 OR NOT v_paid OR v_milestone <= 0 OR v_original <= 0 THEN
    RAISE EXCEPTION 'Undo with another valid date did not retain original milestone';
  END IF;
END $assert$;
SELECT public.undo_mission('77777777-7777-7777-7777-777777777701','2026-10-20');
DO $assert$
DECLARE v_count integer; v_paid boolean; v_original integer; v_new integer;
BEGIN
  SELECT current_count,milestone_paid INTO v_count,v_paid
  FROM public.mission_weekly_progress
  WHERE mission_id='77777777-7777-7777-7777-777777777701';
  SELECT xp INTO v_original FROM public.attributes
  WHERE user_id='77777777-7777-7777-7777-777777777777' AND name='Disciplina';
  SELECT xp INTO v_new FROM public.attributes
  WHERE user_id='77777777-7777-7777-7777-777777777777' AND name='Força';
  IF v_count <> 0 OR v_paid OR v_original <> 0 OR v_new <> 0 THEN
    RAISE EXCEPTION 'Last undo did not debit the original attribute: count %, paid %, old %, new %',
      v_count,v_paid,v_original,v_new;
  END IF;
END $assert$;
SELECT 'same-week clock-controlled completion/undo passed' AS result;
ROLLBACK;
