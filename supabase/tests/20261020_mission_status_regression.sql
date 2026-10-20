-- PG17 local integration test. Load the three 20261019_integracao_* fixtures and
-- the thirteen reforma migrations first. This file rolls back all test data.
BEGIN;
SET LOCAL statement_timeout = '60s';

-- Reproduce the published schema drift before applying BUG32.
ALTER TABLE public.missions ALTER COLUMN status DROP NOT NULL;
ALTER TABLE public.missions ALTER COLUMN status DROP DEFAULT;
CREATE TEMP TABLE bug32_before (state jsonb);
INSERT INTO auth.users(id,email) VALUES
  ('b3200000-0000-0000-0000-000000000001','bug32@example.invalid');
SET LOCAL request.jwt.claim.sub = 'b3200000-0000-0000-0000-000000000001';

DO $seed$
DECLARE
  v_uid uuid := auth.uid();
  v_attr uuid;
  v_day text := (ARRAY['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'])
    [extract(dow FROM (now() AT TIME ZONE 'America/Sao_Paulo')::date)::int + 1];
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  SELECT id INTO STRICT v_attr FROM public.attributes
  WHERE user_id = v_uid AND name = 'Disciplina';
  INSERT INTO public.missions(user_id,title,attribute_id,priority,days_of_week)
  VALUES (v_uid,'legacy-active',v_attr,'baixa',jsonb_build_array(v_day));
  INSERT INTO public.missions(user_id,title,attribute_id,priority,
    frequency_type,target_count,max_count,weekly_started_at)
  VALUES (v_uid,'legacy-weekly',v_attr,'baixa','weekly',4,4,now());
  INSERT INTO public.missions(user_id,title,attribute_id,priority,
    completed,due_date,status)
  VALUES (v_uid,'legacy-completed',v_attr,'baixa',true,v_today,NULL);
  INSERT INTO public.missions(user_id,title,attribute_id,priority,
    is_failed,days_of_week,status)
  VALUES (v_uid,'legacy-failed',v_attr,'baixa',true,
    jsonb_build_array(v_day),NULL);
  INSERT INTO public.missions(user_id,title,attribute_id,priority,
    status,days_of_week)
  VALUES (v_uid,'archived',v_attr,'baixa','arquivada',
    jsonb_build_array(v_day));

  IF (SELECT count(*) FROM public.missions
      WHERE user_id=v_uid AND status IS NULL) <> 4 THEN
    RAISE EXCEPTION 'pre-migration NULL reproduction failed';
  END IF;
END;
$seed$;

INSERT INTO bug32_before(state)
SELECT jsonb_build_object(
  'profile', (SELECT to_jsonb(p) FROM public.profiles p WHERE user_id=auth.uid()),
  'attributes', (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id)
                 FROM public.attributes a WHERE user_id=auth.uid()),
  'balance', (SELECT to_jsonb(b) FROM public.user_balance b WHERE user_id=auth.uid()),
  'ledger', (SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id)
             FROM public.mission_daily_completions l WHERE user_id=auth.uid()),
  'weekly', (SELECT jsonb_agg(to_jsonb(w) ORDER BY w.id)
             FROM public.mission_weekly_progress w WHERE user_id=auth.uid()),
  'xp_history', (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id)
                 FROM public.xp_history x WHERE user_id=auth.uid()),
  'gold_history', (SELECT jsonb_agg(to_jsonb(g) ORDER BY g.id)
                   FROM public.gold_history g WHERE user_id=auth.uid()),
  'activity', (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id)
               FROM public.activity_log a WHERE user_id=auth.uid()),
  'mission_business', (SELECT jsonb_agg(jsonb_build_object(
    'id',m.id,'completed',m.completed,'is_failed',m.is_failed,
    'daily_status',m.daily_status,'frequency_type',m.frequency_type,
    'target_count',m.target_count,'max_count',m.max_count) ORDER BY m.id)
    FROM public.missions m WHERE user_id=auth.uid())
);

\ir ../migrations/20261020020920_normalize_mission_status_for_completion.sql

DO $post_apply$
DECLARE v_now jsonb;
BEGIN
  SELECT jsonb_build_object(
    'profile', (SELECT to_jsonb(p) FROM public.profiles p WHERE user_id=auth.uid()),
    'attributes', (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id)
                   FROM public.attributes a WHERE user_id=auth.uid()),
    'balance', (SELECT to_jsonb(b) FROM public.user_balance b WHERE user_id=auth.uid()),
    'ledger', (SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id)
               FROM public.mission_daily_completions l WHERE user_id=auth.uid()),
    'weekly', (SELECT jsonb_agg(to_jsonb(w) ORDER BY w.id)
               FROM public.mission_weekly_progress w WHERE user_id=auth.uid()),
    'xp_history', (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id)
                   FROM public.xp_history x WHERE user_id=auth.uid()),
    'gold_history', (SELECT jsonb_agg(to_jsonb(g) ORDER BY g.id)
                     FROM public.gold_history g WHERE user_id=auth.uid()),
    'activity', (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id)
                 FROM public.activity_log a WHERE user_id=auth.uid()),
    'mission_business', (SELECT jsonb_agg(jsonb_build_object(
      'id',m.id,'completed',m.completed,'is_failed',m.is_failed,
      'daily_status',m.daily_status,'frequency_type',m.frequency_type,
      'target_count',m.target_count,'max_count',m.max_count) ORDER BY m.id)
      FROM public.missions m WHERE user_id=auth.uid())
  ) INTO v_now;
  IF v_now IS DISTINCT FROM (SELECT state FROM bug32_before) THEN
    RAISE EXCEPTION 'schema apply changed progression or mission history';
  END IF;
  IF (SELECT count(*) FROM public.missions WHERE user_id=auth.uid()
      AND title IN ('legacy-active','legacy-weekly') AND status='pendente') <> 2
     OR (SELECT count(*) FROM public.missions WHERE user_id=auth.uid()
      AND title IN ('legacy-completed','legacy-failed') AND status IS NULL) <> 2
     OR (SELECT status FROM public.missions WHERE user_id=auth.uid()
      AND title='archived') <> 'arquivada' THEN
    RAISE EXCEPTION 'backfill changed inactive states or missed active legacy';
  END IF;
  IF (SELECT pg_get_expr(d.adbin,d.adrelid)
      FROM pg_attrdef d JOIN pg_attribute a
        ON a.attrelid=d.adrelid AND a.attnum=d.adnum
      WHERE a.attrelid='public.missions'::regclass AND a.attname='status')
      <> '''pendente''::text' THEN
    RAISE EXCEPTION 'status default missing';
  END IF;
END;
$post_apply$;

CREATE FUNCTION pg_temp.expect_bug32_error(p_sql text, p_prefix text)
RETURNS void LANGUAGE plpgsql AS $expect$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE p_prefix || '%' THEN RETURN; END IF;
    RAISE;
  END;
  RAISE EXCEPTION 'expected % from %', p_prefix, p_sql;
END;
$expect$;

-- The reduced fixture omits this read grant; RPC execution remains unchanged.
GRANT SELECT ON public.mission_weekly_progress TO authenticated;
SET LOCAL ROLE authenticated;
DO $exercise$
DECLARE
  v_uid uuid := auth.uid();
  v_attr uuid;
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_day text := (ARRAY['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'])
    [extract(dow FROM (now() AT TIME ZONE 'America/Sao_Paulo')::date)::int + 1];
  v_all jsonb := '["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]'::jsonb;
  v_id uuid;
  v_result jsonb;
  v_xp_before integer;
  v_attr_before integer;
  v_gold_before integer;
  v_xp integer;
  v_gold integer;
  v_profile_before jsonb;
  v_ledger_before integer;
BEGIN
  SELECT id,xp INTO STRICT v_attr,v_attr_before FROM public.attributes
  WHERE user_id=v_uid AND name='Disciplina';
  SELECT total_xp INTO STRICT v_xp_before FROM public.profiles WHERE user_id=v_uid;
  SELECT gold INTO STRICT v_gold_before FROM public.user_balance WHERE user_id=v_uid;

  -- The old NULL daily row works with no manual Resume action.
  SELECT id INTO STRICT v_id FROM public.missions
  WHERE user_id=v_uid AND title='legacy-active';
  v_result := public.complete_mission(v_id,v_today);
  SELECT xp_earned,gold_earned INTO STRICT v_xp,v_gold
  FROM public.mission_daily_completions
  WHERE mission_id=v_id AND completion_date=v_today;
  IF (v_result->>'xp_gained')::int <> v_xp
     OR (v_result->>'gold_gained')::int <> v_gold
     OR (SELECT total_xp FROM public.profiles WHERE user_id=v_uid) <> v_xp_before+v_xp
     OR (SELECT xp FROM public.attributes WHERE id=v_attr) <> v_attr_before+v_xp
     OR (SELECT gold FROM public.user_balance WHERE user_id=v_uid) <> v_gold_before+v_gold THEN
    RAISE EXCEPTION 'legacy completion credited wrong amount';
  END IF;
  PERFORM pg_temp.expect_bug32_error(
    format('SELECT public.complete_mission(%L::uuid,%L::date)',v_id,v_today),
    'Missão já concluída hoje');
  IF (SELECT count(*) FROM public.mission_daily_completions
      WHERE mission_id=v_id AND completion_date=v_today) <> 1 THEN
    RAISE EXCEPTION 'replay created duplicate ledger';
  END IF;
  PERFORM public.undo_mission(v_id,v_today);
  IF (SELECT total_xp FROM public.profiles WHERE user_id=v_uid) <> v_xp_before
     OR (SELECT xp FROM public.attributes WHERE id=v_attr) <> v_attr_before
     OR (SELECT gold FROM public.user_balance WHERE user_id=v_uid) <> v_gold_before
     OR EXISTS (SELECT 1 FROM public.mission_daily_completions
                WHERE mission_id=v_id AND completion_date=v_today) THEN
    RAISE EXCEPTION 'legacy undo did not reverse exact credit';
  END IF;

  -- Omitting status matches the form payload. Explicit NULL uses the trigger.
  INSERT INTO public.missions(user_id,title,attribute_id,mission_category,
    due_date,days_of_week,priority,description,secondary_attribute_ids,
    is_anchor,frequency_type,target_count,max_count)
  VALUES (v_uid,'form-omitted',v_attr,'geral',NULL,jsonb_build_array(v_day),
    'baixa',NULL,'[]'::jsonb,false,'daily',NULL,NULL)
  RETURNING id INTO v_id;
  IF (SELECT status FROM public.missions WHERE id=v_id) <> 'pendente' THEN
    RAISE EXCEPTION 'omitted status did not default active';
  END IF;
  PERFORM public.complete_mission(v_id,v_today);
  PERFORM public.undo_mission(v_id,v_today);

  -- A paid legacy unique row can carry NULL after completion. Only the
  -- SECURITY DEFINER undo may clear completed and restore pending status.
  SELECT total_xp INTO v_xp_before FROM public.profiles WHERE user_id=v_uid;
  INSERT INTO public.missions(user_id,title,attribute_id,priority,due_date)
  VALUES (v_uid,'legacy-unique-undo',v_attr,'baixa',v_today)
  RETURNING id INTO v_id;
  PERFORM public.complete_mission(v_id,v_today);
  UPDATE public.missions SET status=NULL WHERE id=v_id;
  PERFORM public.undo_mission(v_id,v_today);
  IF (SELECT status='pendente' AND completed=false FROM public.missions
      WHERE id=v_id) IS NOT TRUE
     OR (SELECT total_xp FROM public.profiles WHERE user_id=v_uid) <> v_xp_before
     OR EXISTS (SELECT 1 FROM public.mission_daily_completions
                WHERE mission_id=v_id AND completion_date=v_today) THEN
    RAISE EXCEPTION 'legacy unique undo failed';
  END IF;

  INSERT INTO public.missions(user_id,title,attribute_id,priority,
    status,days_of_week)
  VALUES (v_uid,'form-explicit-null',v_attr,'baixa',NULL,
    jsonb_build_array(v_day)) RETURNING id INTO v_id;
  IF (SELECT status FROM public.missions WHERE id=v_id) <> 'pendente' THEN
    RAISE EXCEPTION 'explicit NULL did not normalize';
  END IF;
  PERFORM public.complete_mission(v_id,v_today);
  PERFORM public.undo_mission(v_id,v_today);

  SELECT id INTO STRICT v_id FROM public.missions
  WHERE user_id=v_uid AND title='legacy-weekly';
  v_result := public.complete_mission(v_id,v_today);
  IF (v_result->>'frequency_type') <> 'weekly'
     OR (SELECT current_count FROM public.mission_weekly_progress
         WHERE mission_id=v_id) <> 1 THEN
    RAISE EXCEPTION 'legacy weekly execution failed';
  END IF;
  PERFORM public.undo_mission(v_id,v_today);
  IF (SELECT current_count FROM public.mission_weekly_progress
      WHERE mission_id=v_id) <> 0 THEN
    RAISE EXCEPTION 'legacy weekly undo did not restore count';
  END IF;

  -- No inactive row becomes eligible during backfill or later NULL updates.
  FOR v_id IN SELECT id FROM public.missions WHERE user_id=v_uid
    AND title IN ('legacy-completed','legacy-failed','archived') LOOP
    PERFORM pg_temp.expect_bug32_error(
      format('SELECT public.complete_mission(%L::uuid,%L::date)',v_id,v_today),
      'MISSION_NOT_ACTIVE');
  END LOOP;
  PERFORM pg_temp.expect_bug32_error(
    format('UPDATE public.missions SET status=NULL WHERE user_id=%L::uuid AND title=''archived''',v_uid),
    'MISSION_STATUS_REQUIRED');
  PERFORM pg_temp.expect_bug32_error(
    format('UPDATE public.missions SET completed=false WHERE user_id=%L::uuid AND title=''legacy-completed''',v_uid),
    'MISSION_STATUS_REQUIRED');
  SELECT to_jsonb(p) INTO v_profile_before FROM public.profiles p WHERE user_id=v_uid;
  UPDATE public.missions SET is_failed=false
    WHERE user_id=v_uid AND title='legacy-failed';
  IF (SELECT status FROM public.missions WHERE user_id=v_uid
      AND title='legacy-failed') <> 'pendente'
     OR (SELECT to_jsonb(p) FROM public.profiles p WHERE user_id=v_uid)
        IS DISTINCT FROM v_profile_before THEN
    RAISE EXCEPTION 'legacy failed recovery paid or stayed inactive';
  END IF;

  -- An explicit NULL cannot hide a fifth high or ninth medium scheduled slot.
  FOR v_xp IN 1..4 LOOP
    INSERT INTO public.missions(user_id,title,attribute_id,priority,days_of_week)
    VALUES (v_uid,'high-'||v_xp,v_attr,'alta',v_all);
  END LOOP;
  PERFORM pg_temp.expect_bug32_error(
    format('INSERT INTO public.missions(user_id,title,attribute_id,priority,status,days_of_week) VALUES (%L::uuid,''high-5'',%L::uuid,''alta'',NULL,%L::jsonb)',v_uid,v_attr,v_all::text),
    'MISSION_PRIORITY_CAP');
  FOR v_xp IN 1..8 LOOP
    INSERT INTO public.missions(user_id,title,attribute_id,priority,days_of_week)
    VALUES (v_uid,'medium-'||v_xp,v_attr,'media',v_all);
  END LOOP;
  PERFORM pg_temp.expect_bug32_error(
    format('INSERT INTO public.missions(user_id,title,attribute_id,priority,status,days_of_week) VALUES (%L::uuid,''medium-9'',%L::uuid,''media'',NULL,%L::jsonb)',v_uid,v_attr,v_all::text),
    'MISSION_PRIORITY_CAP');

  -- Credit four/eight, then make an over-cap legacy row to test paid guard.
  FOR v_id IN SELECT id FROM public.missions WHERE user_id=v_uid
    AND title LIKE 'high-%' ORDER BY title LOOP
    PERFORM public.complete_mission(v_id,v_today);
  END LOOP;
  FOR v_id IN SELECT id FROM public.missions WHERE user_id=v_uid
    AND title LIKE 'medium-%' ORDER BY title LOOP
    PERFORM public.complete_mission(v_id,v_today);
  END LOOP;
  SELECT to_jsonb(p) INTO v_profile_before FROM public.profiles p WHERE user_id=v_uid;
  SELECT count(*) INTO v_ledger_before FROM public.mission_daily_completions
    WHERE user_id=v_uid;
  PERFORM pg_temp.expect_bug32_error(
    format('SELECT public.complete_mission(%L::uuid,%L::date)',
      (SELECT id FROM public.missions WHERE user_id=v_uid AND title='high-1'),v_today),
    'Missão já concluída hoje');
  IF (SELECT to_jsonb(p) FROM public.profiles p WHERE user_id=v_uid)
      IS DISTINCT FROM v_profile_before
     OR (SELECT count(*) FROM public.mission_daily_completions WHERE user_id=v_uid)
        <> v_ledger_before THEN
    RAISE EXCEPTION 'repeat completion paid twice';
  END IF;
END;
$exercise$;

RESET ROLE;
DO $paid$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF (SELECT count(*) FROM private.mission_priority_paid_days
      WHERE user_id='b3200000-0000-0000-0000-000000000001'
        AND priority='alta' AND day=v_today) <> 4
     OR (SELECT count(*) FROM private.mission_priority_paid_days
      WHERE user_id='b3200000-0000-0000-0000-000000000001'
        AND priority='media' AND day=v_today) <> 8 THEN
    RAISE EXCEPTION 'paid reservation count wrong';
  END IF;
END;
$paid$;

-- Historical over-cap rows can exist. Their explicit NULL must become active,
-- and the paid-grant guard must still refuse a fifth/ninth credit.
ALTER TABLE public.missions DISABLE TRIGGER enforce_mission_priority;
INSERT INTO public.missions(user_id,title,priority,status,days_of_week)
VALUES
  ('b3200000-0000-0000-0000-000000000001','legacy-high-5','alta',NULL,
   '["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]'::jsonb),
  ('b3200000-0000-0000-0000-000000000001','legacy-medium-9','media',NULL,
   '["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]'::jsonb);
ALTER TABLE public.missions ENABLE TRIGGER enforce_mission_priority;
DO $normalized$
BEGIN
  IF (SELECT count(*) FROM public.missions
      WHERE user_id='b3200000-0000-0000-0000-000000000001'
        AND title IN ('legacy-high-5','legacy-medium-9')
        AND status='pendente') <> 2 THEN
    RAISE EXCEPTION 'explicit NULL bypassed normalization';
  END IF;
END;
$normalized$;
SET LOCAL ROLE authenticated;
DO $paid_denial$
DECLARE
  v_id uuid;
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_before jsonb;
BEGIN
  SELECT to_jsonb(p) INTO v_before FROM public.profiles p WHERE user_id=auth.uid();
  FOR v_id IN SELECT id FROM public.missions
    WHERE user_id=auth.uid() AND title IN ('legacy-high-5','legacy-medium-9') LOOP
    PERFORM pg_temp.expect_bug32_error(
      format('SELECT public.complete_mission(%L::uuid,%L::date)',v_id,v_today),
      'MISSION_PRIORITY_PAID_CAP');
    IF EXISTS (SELECT 1 FROM public.mission_daily_completions
               WHERE mission_id=v_id AND completion_date=v_today) THEN
      RAISE EXCEPTION 'paid-cap refusal wrote ledger';
    END IF;
  END LOOP;
  IF (SELECT to_jsonb(p) FROM public.profiles p WHERE user_id=auth.uid())
      IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'paid-cap refusal changed progression';
  END IF;
END;
$paid_denial$;
RESET ROLE;

SELECT 'BUG32 mission status regression: PASS' AS result;
ROLLBACK;
