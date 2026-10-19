CREATE SCHEMA test;
CREATE FUNCTION test.expect_cap(p_sql text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM LIKE 'MISSION_PRIORITY_CAP:%' THEN RETURN; END IF;
    RAISE;
  END;
  RAISE EXCEPTION 'expected MISSION_PRIORITY_CAP: %', p_sql;
END;
$$;
CREATE FUNCTION test.expect_invalid_schedule(p_sql text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM = 'MISSION_SCHEDULE_INVALID' THEN RETURN; END IF;
    RAISE;
  END;
  RAISE EXCEPTION 'expected MISSION_SCHEDULE_INVALID: %', p_sql;
END;
$$;

SET app.uid = '00000000-0000-0000-0000-000000000001';
INSERT INTO public.missions (user_id, priority, days_of_week)
SELECT auth.uid(), 'alta', '["Seg"]' FROM generate_series(1, 4);
SELECT test.expect_cap($q$INSERT INTO public.missions (user_id, priority, days_of_week) VALUES (auth.uid(), 'alta', '["Seg"]')$q$);
SELECT test.expect_invalid_schedule($q$INSERT INTO public.missions (user_id, priority, days_of_week) VALUES (auth.uid(), 'alta', '["nunca"]')$q$);
SELECT test.expect_invalid_schedule($q$INSERT INTO public.missions (user_id, priority, days_of_week) VALUES (auth.uid(), 'media', '[]')$q$);
INSERT INTO public.missions (user_id, priority, days_of_week) VALUES (auth.uid(), 'alta', '["Ter"]');
INSERT INTO public.missions (user_id, priority, days_of_week)
SELECT auth.uid(), 'media', '["Seg"]' FROM generate_series(1, 8);
SELECT test.expect_cap($q$INSERT INTO public.missions (user_id, priority, days_of_week) VALUES (auth.uid(), 'media', '["Seg"]')$q$);
INSERT INTO public.missions (user_id, priority, days_of_week) VALUES (auth.uid(), 'baixa', '["Seg"]');

-- A propria vaga nao conta duas vezes; mover para dia cheio conta.
UPDATE public.missions SET title = 'editavel' WHERE id =
  (SELECT id FROM public.missions WHERE user_id = auth.uid() AND priority = 'alta' AND days_of_week = '["Seg"]' LIMIT 1);
UPDATE public.missions SET days_of_week = '["Seg", "Ter"]' WHERE id =
  (SELECT id FROM public.missions WHERE user_id = auth.uid() AND priority = 'alta' AND days_of_week = '["Seg"]' LIMIT 1);
SELECT test.expect_cap($q$UPDATE public.missions SET days_of_week = '["Seg"]' WHERE id =
  (SELECT id FROM public.missions WHERE user_id = auth.uid() AND priority = 'alta' AND days_of_week = '["Ter"]' LIMIT 1)$q$);

SET app.uid = '00000000-0000-0000-0000-000000000002';
INSERT INTO public.missions (user_id, priority, due_date)
SELECT auth.uid(), 'alta', DATE '2026-10-19' FROM generate_series(1, 4);
INSERT INTO public.missions (user_id, priority, due_date) VALUES (auth.uid(), 'alta', DATE '2026-10-26');
SELECT test.expect_cap($q$INSERT INTO public.missions (user_id, priority, due_date) VALUES (auth.uid(), 'alta', DATE '2026-10-19')$q$);

-- Concluir, rebaixar e deletar nao liberam credito de alta no dia.
UPDATE public.missions SET completed = true, daily_status = '{"2026-10-19":"completed"}'
WHERE id = (SELECT id FROM public.missions WHERE user_id = auth.uid() AND due_date = '2026-10-19' LIMIT 1);
UPDATE public.missions SET priority = 'baixa' WHERE id =
  (SELECT id FROM public.missions WHERE user_id = auth.uid() AND completed LIMIT 1);
DELETE FROM public.missions WHERE user_id = auth.uid() AND completed;
SELECT test.expect_cap($q$INSERT INTO public.missions (user_id, priority, due_date) VALUES (auth.uid(), 'alta', DATE '2026-10-19')$q$);

SET app.uid = '00000000-0000-0000-0000-000000000003';
INSERT INTO public.missions (user_id, priority, days_of_week)
SELECT auth.uid(), 'alta', '["Ter"]' FROM generate_series(1, 3);
INSERT INTO public.missions (user_id, priority, frequency_type) VALUES (auth.uid(), 'alta', 'weekly');
SELECT test.expect_cap($q$INSERT INTO public.missions (user_id, priority, days_of_week) VALUES (auth.uid(), 'alta', '["Ter"]')$q$);
SELECT test.expect_cap($q$INSERT INTO public.missions (user_id, priority, frequency_type) VALUES (auth.uid(), 'alta', 'weekly')$q$);

SET app.uid = '00000000-0000-0000-0000-000000000004';
INSERT INTO public.missions (user_id, priority, days_of_week)
SELECT auth.uid(), 'alta', '["Qua"]' FROM generate_series(1, 4);
INSERT INTO public.missions (user_id, priority, days_of_week, status)
VALUES (auth.uid(), 'alta', '["Qua"]', 'arquivada');
SELECT test.expect_cap($q$UPDATE public.missions SET status = 'pendente' WHERE user_id = auth.uid() AND status = 'arquivada'$q$);

SET app.uid = '00000000-0000-0000-0000-000000000005';
INSERT INTO public.missions (user_id, priority, due_date, xp_reward)
VALUES (auth.uid(), 'alta', '2026-10-20', 999);
DO $$ BEGIN
  ASSERT (SELECT xp_reward = 25 FROM public.missions WHERE user_id = auth.uid()), 'client xp_reward was trusted on insert';
END $$;
UPDATE public.missions SET xp_reward = 999 WHERE user_id = auth.uid();
DO $$ BEGIN
  ASSERT (SELECT xp_reward = 25 FROM public.missions WHERE user_id = auth.uid()), 'client xp_reward was trusted on update';
END $$;

SET app.uid = '00000000-0000-0000-0000-000000000006';
INSERT INTO public.missions (user_id, priority, days_of_week)
SELECT auth.uid(), NULL, '["Sex"]' FROM generate_series(1, 8);
SELECT test.expect_cap($q$INSERT INTO public.missions (user_id, priority, days_of_week) VALUES (auth.uid(), 'media', '["Sex"]')$q$);
SELECT test.expect_cap($q$INSERT INTO public.missions (user_id, priority, days_of_week) VALUES (auth.uid(), 'urgente', '["Sex"]')$q$);

SET app.uid = '00000000-0000-0000-0000-000000000009';
INSERT INTO public.missions (user_id, priority, days_of_week)
SELECT auth.uid(), 'alta', '["Seg"]' FROM generate_series(1, 4);
UPDATE public.missions SET daily_status = '{"2026-10-19":"completed"}'
WHERE id = (SELECT id FROM public.missions WHERE user_id = auth.uid() LIMIT 1);
DELETE FROM public.missions WHERE id =
  (SELECT id FROM public.missions WHERE user_id = auth.uid() AND daily_status ? '2026-10-19' LIMIT 1);
SELECT test.expect_cap($q$INSERT INTO public.missions (user_id, priority, days_of_week) VALUES (auth.uid(), 'alta', '["Seg"]')$q$);

-- Legado acima do limite continua disponivel; alteracao de texto segue,
-- aumento/reagendamento que mantem excesso precisa de ajuste explicito.
SET app.uid = '00000000-0000-0000-0000-000000000007';
ALTER TABLE public.missions DISABLE TRIGGER enforce_mission_priority;
INSERT INTO public.missions (user_id, priority, days_of_week)
SELECT auth.uid(), 'alta', '["Dom"]' FROM generate_series(1, 5);
ALTER TABLE public.missions ENABLE TRIGGER enforce_mission_priority;
UPDATE public.missions SET title = 'legado preservado' WHERE user_id = auth.uid();
SELECT test.expect_cap($q$INSERT INTO public.missions (user_id, priority, days_of_week) VALUES (auth.uid(), 'alta', '["Dom"]')$q$);

DO $$ BEGIN
  ASSERT (SELECT count(*) = 5 FROM public.missions WHERE user_id = auth.uid()), 'legacy rows changed';
  ASSERT (SELECT (public._complete_mission_daily(NULL, NULL, NULL)->>'priority_mult')::numeric = 2.0), 'daily reward patch';
  ASSERT (SELECT (public._complete_mission_with_weekly(NULL, NULL)->>'priority_mult')::numeric = 2.0), 'weekly reward patch';
END $$;
SELECT 'priority_caps_assert: PASS' AS result;
