-- PG17 integration: progressao fixture, A193625, B200215, A204003,
-- A204904, B4 migration; execute with ON_ERROR_STOP=1 and -1.
CREATE SCHEMA IF NOT EXISTS test;
CREATE OR REPLACE FUNCTION test.expect_rpc_error(p_sql text, p_message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = p_message THEN RETURN; END IF;
    RAISE;
  END;
  RAISE EXCEPTION 'expected %: %', p_message, p_sql;
END;
$$;
CREATE OR REPLACE FUNCTION test.expect_paid_rpc_cap(p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE p_sql;
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM LIKE 'MISSION_PRIORITY_PAID_CAP:%' THEN RETURN; END IF;
    RAISE;
  END;
  RAISE EXCEPTION 'expected MISSION_PRIORITY_PAID_CAP: %', p_sql;
END;
$$;

INSERT INTO auth.users (id,email)
VALUES ('00000000-0000-0000-0000-000000000031','b4-high@example.invalid');
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000031';
ALTER TABLE public.missions DISABLE TRIGGER enforce_mission_priority;
INSERT INTO public.missions (user_id,title,priority,days_of_week)
SELECT auth.uid(), 'legacy-high-' || n, 'alta', '["Seg"]'::jsonb
FROM generate_series(1,6) n;
ALTER TABLE public.missions ENABLE TRIGGER enforce_mission_priority;
INSERT INTO public.missions (user_id,title,priority,days_of_week,status,completed)
SELECT auth.uid(), 'archived-' || n, 'alta', '["Seg"]'::jsonb,
       'arquivada', true FROM generate_series(1,2) n;

DO $$ DECLARE v_id uuid; v_paid integer := 0; BEGIN
  FOR v_id IN SELECT id FROM public.missions
    WHERE user_id=auth.uid() AND title LIKE 'legacy-high-%'
    ORDER BY title LIMIT 4
  LOOP
    ASSERT (public.complete_mission(v_id,DATE '2026-10-19')->>'xp_gained')::integer = 50,
      'high base XP is not 50';
    v_paid := v_paid + 1;
  END LOOP;
  ASSERT v_paid = 4, 'did not finish four highs';
  ASSERT (SELECT total_xp = 200 AND missions_completed = 4
          FROM public.profiles WHERE user_id=auth.uid()),
    'profile did not receive exactly four highs';
  ASSERT (SELECT count(*) = 4 FROM public.mission_daily_completions
          WHERE user_id=auth.uid() AND completion_date='2026-10-19'
            AND credited_total_verified),
    'four verified ledger rows missing';
  ASSERT (SELECT count(DISTINCT mission_id) = 4
          FROM private.mission_priority_paid_days
          WHERE user_id=auth.uid() AND day='2026-10-19' AND priority='alta'),
    'four historical grant reservations missing';
END $$;
SELECT test.expect_paid_rpc_cap($q$SELECT public.complete_mission(
  (SELECT id FROM public.missions WHERE user_id=auth.uid() AND title='legacy-high-5'),
  DATE '2026-10-19')$q$);
SELECT test.expect_rpc_error($q$SELECT public.complete_mission(
  (SELECT id FROM public.missions WHERE user_id=auth.uid() AND title='archived-1'),
  DATE '2026-10-19')$q$, 'MISSION_NOT_ACTIVE');
DO $$ BEGIN
  ASSERT (SELECT total_xp = 200 AND missions_completed = 4
          FROM public.profiles WHERE user_id=auth.uid()),
    'rejected completion partially paid';
  ASSERT (SELECT daily_status='{}'::jsonb FROM public.missions
          WHERE user_id=auth.uid() AND title='legacy-high-5'),
    'rejected completion partially marked';
END $$;

SELECT public.undo_mission(
  (SELECT id FROM public.missions WHERE user_id=auth.uid() AND title='legacy-high-1'),
  DATE '2026-10-19');
DO $$ BEGIN
  ASSERT (SELECT total_xp = 150 AND missions_completed = 3
          FROM public.profiles WHERE user_id=auth.uid()),
    'undo did not reverse the exact high grant';
  ASSERT (SELECT count(*) = 3 FROM public.mission_daily_completions
          WHERE user_id=auth.uid() AND completion_date='2026-10-19'),
    'undo ledger count did not fall';
  ASSERT (SELECT count(DISTINCT mission_id) = 4
          FROM private.mission_priority_paid_days
          WHERE user_id=auth.uid() AND day='2026-10-19' AND priority='alta'),
    'undo released historical reservation';
END $$;
SELECT test.expect_paid_rpc_cap($q$SELECT public.complete_mission(
  (SELECT id FROM public.missions WHERE user_id=auth.uid() AND title='legacy-high-5'),
  DATE '2026-10-19')$q$);
DO $$ BEGIN
  ASSERT (public.complete_mission(
    (SELECT id FROM public.missions WHERE user_id=auth.uid() AND title='legacy-high-1'),
    DATE '2026-10-19')->>'xp_gained')::integer = 50,
    'same mission redo failed';
  ASSERT (SELECT total_xp=200 AND missions_completed=4
          FROM public.profiles WHERE user_id=auth.uid()),
    'redo did not restore net profile';
END $$;

INSERT INTO auth.users (id,email)
VALUES ('00000000-0000-0000-0000-000000000032','b4-medium@example.invalid');
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000032';
ALTER TABLE public.missions DISABLE TRIGGER enforce_mission_priority;
INSERT INTO public.missions (user_id,title,priority,days_of_week)
SELECT auth.uid(), 'legacy-medium-' || n, 'media', '["Seg"]'::jsonb
FROM generate_series(1,9) n;
ALTER TABLE public.missions ENABLE TRIGGER enforce_mission_priority;
DO $$ DECLARE v_id uuid; BEGIN
  FOR v_id IN SELECT id FROM public.missions
    WHERE user_id=auth.uid() AND title LIKE 'legacy-medium-%'
    ORDER BY title LIMIT 8
  LOOP
    ASSERT (public.complete_mission(v_id,DATE '2026-10-19')->>'xp_gained')::integer = 25,
      'medium base XP is not 25';
  END LOOP;
  ASSERT (SELECT total_xp=200 AND missions_completed=8
          FROM public.profiles WHERE user_id=auth.uid()),
    'medium count/reward mismatch';
END $$;
SELECT test.expect_paid_rpc_cap($q$SELECT public.complete_mission(
  (SELECT id FROM public.missions WHERE user_id=auth.uid() AND title='legacy-medium-9'),
  DATE '2026-10-19')$q$);

INSERT INTO auth.users (id,email)
VALUES ('00000000-0000-0000-0000-000000000033','b4-green@example.invalid');
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000033';
INSERT INTO public.missions (user_id,title,priority,days_of_week)
SELECT auth.uid(), 'green-' || n, 'baixa', '["Seg"]'::jsonb
FROM generate_series(1,12) n;
DO $$ DECLARE v_id uuid; BEGIN
  FOR v_id IN SELECT id FROM public.missions WHERE user_id=auth.uid() ORDER BY title
  LOOP
    PERFORM public.complete_mission(v_id, DATE '2026-10-19');
  END LOOP;
  ASSERT (SELECT count(*)=12 FROM public.mission_daily_completions
          WHERE user_id=auth.uid() AND completion_date='2026-10-19'
            AND credited_total_verified),
    'green completions were capped';
  ASSERT (SELECT total_xp=60 AND missions_completed=12
          FROM public.profiles WHERE user_id=auth.uid()),
    'green XP base or count mismatch';
END $$;
SELECT 'priority_caps_corrective_rpc: PASS' AS result;
