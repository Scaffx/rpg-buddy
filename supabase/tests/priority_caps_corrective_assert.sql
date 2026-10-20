-- Run after priority_caps_setup.sql, B200215, then B4 corrective migration.
CREATE SCHEMA IF NOT EXISTS test;
CREATE OR REPLACE FUNCTION test.expect_paid_cap(p_sql text)
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
CREATE OR REPLACE FUNCTION test.expect_error(p_sql text, p_message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE p_sql;
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM = p_message THEN RETURN; END IF;
    RAISE;
  END;
  RAISE EXCEPTION 'expected %: %', p_message, p_sql;
END;
$$;

-- Legacy over-cap schedule is preserved. Only four distinct high mission IDs
-- may acquire paid reservations for Monday; archive/undo/delete do not free it.
SET app.uid = '00000000-0000-0000-0000-000000000021';
ALTER TABLE public.missions DISABLE TRIGGER enforce_mission_priority;
INSERT INTO public.missions (user_id, title, priority, days_of_week)
SELECT auth.uid(), 'legacy-high-' || n, 'alta', '["Seg","Ter"]'::jsonb
FROM generate_series(1, 6) n;
INSERT INTO public.missions (user_id, title, priority, days_of_week, status, completed)
VALUES (auth.uid(), 'archived-high', 'alta', '["Seg"]', 'arquivada', true);
ALTER TABLE public.missions ENABLE TRIGGER enforce_mission_priority;
UPDATE public.missions SET title = title || '-kept' WHERE user_id = auth.uid();
DO $$ BEGIN
  ASSERT (SELECT count(*) = 7 FROM public.missions WHERE user_id = auth.uid()),
    'legacy rows were removed';
  ASSERT (SELECT count(*) = 0 FROM private.mission_priority_paid_days
          WHERE user_id = auth.uid()), 'archive consumed a grant';
END $$;
UPDATE public.missions SET daily_status = '{"2026-10-19":"completed"}'::jsonb
WHERE user_id = auth.uid() AND title LIKE 'legacy-high-%'
  AND split_part(title, '-', 3) IN ('1', '2', '3', '4');
DO $$ BEGIN
  ASSERT (SELECT count(DISTINCT mission_id) = 4 FROM private.mission_priority_paid_days
          WHERE user_id = auth.uid() AND priority = 'alta' AND day = '2026-10-19'),
    'four high grant reservations missing';
END $$;
SELECT test.expect_paid_cap($q$UPDATE public.missions
  SET daily_status = '{"2026-10-19":"completed"}'::jsonb
  WHERE user_id = auth.uid() AND title LIKE 'legacy-high-5-%'$q$);
SELECT test.expect_error($q$UPDATE public.missions
  SET daily_status = '{"2026-10-19":"completed"}'::jsonb
  WHERE user_id = auth.uid() AND title LIKE 'archived-high-%'$q$, 'MISSION_NOT_ACTIVE');
UPDATE public.missions SET daily_status = '{}'::jsonb
WHERE user_id = auth.uid() AND title LIKE 'legacy-high-1-%';
SELECT test.expect_paid_cap($q$UPDATE public.missions
  SET daily_status = '{"2026-10-19":"completed"}'::jsonb
  WHERE user_id = auth.uid() AND title LIKE 'legacy-high-5-%'$q$);
UPDATE public.missions SET daily_status = '{"2026-10-19":"completed"}'::jsonb
WHERE user_id = auth.uid() AND title LIKE 'legacy-high-1-%';
UPDATE public.missions SET priority = 'baixa', status = 'arquivada'
WHERE user_id = auth.uid() AND title LIKE 'legacy-high-2-%';
DELETE FROM public.missions WHERE user_id = auth.uid() AND title LIKE 'legacy-high-2-%';
DO $$ BEGIN
  ASSERT (SELECT count(DISTINCT mission_id) = 4 FROM private.mission_priority_paid_days
          WHERE user_id = auth.uid() AND priority = 'alta' AND day = '2026-10-19'),
    'reclassify/delete erased paid high history';
  ASSERT (SELECT count(*) = 0 FROM private.mission_priority_paid_days
          WHERE user_id = auth.uid() AND priority = 'media'),
    'reclassification invented a medium grant';
END $$;
SELECT test.expect_paid_cap($q$UPDATE public.missions
  SET daily_status = '{"2026-10-19":"completed"}'::jsonb
  WHERE user_id = auth.uid() AND title LIKE 'legacy-high-6-%'$q$);
-- Different scheduled day, same set of missions, gets its own cap.
UPDATE public.missions SET daily_status = daily_status || '{"2026-10-20":"completed"}'::jsonb
WHERE user_id = auth.uid() AND title LIKE 'legacy-high-1-%';
DO $$ BEGIN
  ASSERT (SELECT count(*) = 1 FROM private.mission_priority_paid_days
          WHERE user_id = auth.uid() AND priority = 'alta' AND day = '2026-10-20'),
    'Tuesday was falsely blocked by Monday';
END $$;

SET app.uid = '00000000-0000-0000-0000-000000000022';
ALTER TABLE public.missions DISABLE TRIGGER enforce_mission_priority;
INSERT INTO public.missions (user_id, title, priority, days_of_week)
SELECT auth.uid(), 'legacy-medium-' || n, 'media', '["Seg"]'::jsonb
FROM generate_series(1, 9) n;
ALTER TABLE public.missions ENABLE TRIGGER enforce_mission_priority;
UPDATE public.missions SET daily_status = '{"2026-10-19":"completed"}'::jsonb
WHERE user_id = auth.uid() AND title ~ '^legacy-medium-[1-8]$';
SELECT test.expect_paid_cap($q$UPDATE public.missions
  SET daily_status = '{"2026-10-19":"completed"}'::jsonb
  WHERE user_id = auth.uid() AND title = 'legacy-medium-9'$q$);

SET app.uid = '00000000-0000-0000-0000-000000000023';
INSERT INTO public.missions (user_id, title, priority, due_date, status, completed)
VALUES (auth.uid(), 'archive-without-payment', 'alta', '2026-10-19', 'arquivada', true);
DO $$ BEGIN
  ASSERT (SELECT count(*) = 0 FROM private.mission_priority_paid_days
          WHERE user_id = auth.uid()), 'new archive consumed a paid day';
END $$;
INSERT INTO public.missions (user_id, title, priority, due_date)
VALUES (auth.uid(), 'single-paid', 'alta', '2026-10-19');
UPDATE public.missions SET completed = true WHERE user_id = auth.uid() AND title = 'single-paid';
DO $$ BEGIN
  ASSERT (SELECT count(*) = 1 FROM private.mission_priority_paid_days
          WHERE user_id = auth.uid() AND day = '2026-10-19'),
    'single grant did not reserve due date';
END $$;
UPDATE public.missions SET priority = 'media' WHERE user_id = auth.uid() AND title = 'single-paid';
DO $$ BEGIN
  ASSERT (SELECT count(*) = 0 FROM private.mission_priority_paid_days
          WHERE user_id = auth.uid() AND priority = 'media'),
    'single reclassification invented a medium grant';
END $$;

SET app.uid = '00000000-0000-0000-0000-000000000029';
INSERT INTO public.missions (user_id, title, priority, due_date)
SELECT auth.uid(), 'unique-monday-' || n, 'alta', DATE '2026-10-19'
FROM generate_series(1,4) n;
UPDATE public.missions SET completed = true WHERE user_id = auth.uid();
INSERT INTO public.missions (user_id, title, priority, due_date)
VALUES (auth.uid(), 'unique-tuesday', 'alta', DATE '2026-10-20');
DO $$ BEGIN
  ASSERT (SELECT count(*) = 4 FROM private.mission_priority_paid_days
          WHERE user_id=auth.uid() AND day='2026-10-19'),
    'unique Monday history missing';
  ASSERT (SELECT count(*) = 1 FROM public.missions
          WHERE user_id=auth.uid() AND due_date='2026-10-20'),
    'distinct unique due date falsely blocked';
END $$;

SET app.uid = '00000000-0000-0000-0000-000000000024';
INSERT INTO public.missions (user_id, title, priority, frequency_type)
VALUES (auth.uid(), 'weekly-flex', 'alta', 'weekly');
UPDATE public.missions SET daily_status = '{"2026-10-20":"completed"}'::jsonb
WHERE user_id = auth.uid();
DO $$ BEGIN
  ASSERT (SELECT count(*) = 1 FROM private.mission_priority_paid_days
          WHERE user_id = auth.uid() AND day = '2026-10-20'),
    'weekly flexible grant was blocked';
END $$;
SELECT test.expect_error($q$UPDATE public.missions
  SET daily_status = '{"2026-99-99":"completed"}'::jsonb
  WHERE user_id = auth.uid()$q$, 'MISSION_COMPLETION_DATE_INVALID');
SELECT test.expect_error($q$UPDATE public.missions
  SET daily_status = '[1,2]'::jsonb WHERE user_id = auth.uid()$q$,
  'MISSION_DAILY_STATUS_INVALID');
SET app.uid = '00000000-0000-0000-0000-000000000025';
INSERT INTO public.missions (user_id, title, priority, days_of_week)
VALUES (auth.uid(), 'monday-only', 'alta', '["Seg"]');
SELECT test.expect_error($q$UPDATE public.missions
  SET daily_status = '{"2026-10-20":"completed"}'::jsonb
  WHERE user_id = auth.uid()$q$, 'MISSION_NOT_SCHEDULED:2026-10-20');
SELECT 'priority_caps_corrective_assert: PASS' AS result;
