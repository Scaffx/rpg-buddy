-- Executar somente no PostgreSQL local com 193625 -> 200215 -> 204003 -> A4.
-- A transacao inteira e revertida; cada recusa compara estado antes/depois.
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION private.a4_snapshot(p_uid uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'profile', (SELECT to_jsonb(p) FROM public.profiles p WHERE p.user_id = p_uid),
    'gold', (SELECT to_jsonb(b) FROM public.user_balance b WHERE b.user_id = p_uid),
    'attributes', (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id)
                   FROM public.attributes a WHERE a.user_id = p_uid),
    'missions', (SELECT jsonb_agg(jsonb_build_object(
                   'id', m.id, 'completed', m.completed, 'daily_status', m.daily_status)
                   ORDER BY m.id) FROM public.missions m WHERE m.user_id = p_uid),
    'ledger', (SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id)
               FROM public.mission_daily_completions l WHERE l.user_id = p_uid),
    'weekly', (SELECT jsonb_agg(to_jsonb(w) ORDER BY w.id)
               FROM public.mission_weekly_progress w WHERE w.user_id = p_uid),
    'paid', (SELECT count(*) FROM private.mission_priority_paid_days p
             WHERE p.user_id = p_uid),
    'xp_history', (SELECT jsonb_build_object('count', count(*),
      'sum', COALESCE(sum(xp_gained), 0)) FROM public.xp_history WHERE user_id = p_uid),
    'gold_history', (SELECT jsonb_build_object('count', count(*),
      'sum', COALESCE(sum(amount), 0)) FROM public.gold_history WHERE user_id = p_uid),
    'activity', (SELECT jsonb_build_object('count', count(*),
      'sum', COALESCE(sum(xp_gained), 0)) FROM public.activity_log WHERE user_id = p_uid)
  );
$$;

DO $test$
DECLARE
  u uuid := 'a4a4a4a4-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  other_u uuid := 'b4b4b4b4-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  a uuid;
  other_a uuid;
  d date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  today_name text;
  yesterday_name text;
  all_days jsonb := '["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]'::jsonb;
  archived uuid[] := ARRAY[]::uuid[];
  active_m uuid;
  other_m uuid;
  unique_m uuid;
  today_m uuid;
  yesterday_m uuid;
  weekly_m uuid;
  full_weekly_m uuid;
  failed_m uuid;
  before_state jsonb;
  result jsonb;
  paid_xp integer;
  paid_gold integer;
  xp_before integer;
  gold_before integer;
  attr_before integer;
  i integer;
BEGIN
  INSERT INTO auth.users(id,email) VALUES
    (u,'a4-a@example.invalid'), (other_u,'a4-b@example.invalid');
  SELECT id INTO STRICT a FROM public.attributes WHERE user_id = u;
  SELECT id INTO STRICT other_a FROM public.attributes WHERE user_id = other_u;
  today_name := (ARRAY['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'])
    [extract(dow FROM d)::integer + 1];
  yesterday_name := (ARRAY['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'])
    [extract(dow FROM d - 1)::integer + 1];
  PERFORM set_config('request.jwt.claim.sub', u::text, true);

  -- Quatro altas ativas e duas arquivadas: a RPC nao pode pagar as arquivadas.
  FOR i IN 1..4 LOOP
    INSERT INTO public.missions(user_id,title,attribute_id,priority,days_of_week)
    VALUES (u,'alta ativa ' || i,a,'alta',all_days) RETURNING id INTO active_m;
  END LOOP;
  FOR i IN 1..2 LOOP
    INSERT INTO public.missions(user_id,title,attribute_id,priority,status,days_of_week)
    VALUES (u,'alta arquivada ' || i,a,'alta','arquivada',all_days)
    RETURNING id INTO active_m;
    archived := array_append(archived, active_m);
  END LOOP;
  PERFORM set_config('request.jwt.claim.sub', other_u::text, true);
  INSERT INTO public.missions(user_id,title,attribute_id,priority,days_of_week)
  VALUES (other_u,'dono cruzado',other_a,'baixa',all_days) RETURNING id INTO other_m;
  PERFORM set_config('request.jwt.claim.sub', u::text, true);

  before_state := private.a4_snapshot(u);
  FOREACH active_m IN ARRAY archived LOOP
    BEGIN
      PERFORM public.complete_mission(active_m,d);
      RAISE EXCEPTION 'archived accepted';
    EXCEPTION WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM <> 'MISSION_NOT_ACTIVE' THEN RAISE; END IF;
    END;
  END LOOP;
  BEGIN
    PERFORM public.complete_mission(other_m,d);
    RAISE EXCEPTION 'cross-owner accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'MISSION_NOT_FOUND' THEN RAISE; END IF;
  END;
  IF private.a4_snapshot(u) IS DISTINCT FROM before_state THEN
    RAISE EXCEPTION 'archived/cross-owner refusal mutated economy';
  END IF;
  FOR active_m IN
    SELECT id FROM public.missions
    WHERE user_id = u AND title LIKE 'alta ativa %' ORDER BY title
  LOOP
    result := public.complete_mission(active_m,d);
    IF (result->>'xp_gained')::integer <> 50 THEN
      RAISE EXCEPTION 'active high did not receive 50 base XP: %', result;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM private.mission_priority_paid_days
      WHERE user_id = u AND priority = 'alta' AND day = d) <> 4 THEN
    RAISE EXCEPTION 'four active high grants not reserved';
  END IF;
  before_state := private.a4_snapshot(u);
  FOREACH active_m IN ARRAY archived LOOP
    BEGIN
      PERFORM public.complete_mission(active_m,d);
      RAISE EXCEPTION 'archived accepted after four paid grants';
    EXCEPTION WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM <> 'MISSION_NOT_ACTIVE' THEN RAISE; END IF;
    END;
  END LOOP;
  IF private.a4_snapshot(u) IS DISTINCT FROM before_state THEN
    RAISE EXCEPTION 'archived refusal after four grants mutated economy';
  END IF;

  INSERT INTO public.missions(user_id,title,attribute_id,priority,due_date)
  VALUES (u,'unica futura',a,'baixa',d + 2) RETURNING id INTO unique_m;
  INSERT INTO public.missions(user_id,title,attribute_id,priority,days_of_week)
  VALUES (u,'diaria hoje',a,'baixa',jsonb_build_array(today_name))
  RETURNING id INTO today_m;
  INSERT INTO public.missions(user_id,title,attribute_id,priority,days_of_week)
  VALUES (u,'diaria ontem',a,'baixa',jsonb_build_array(yesterday_name))
  RETURNING id INTO yesterday_m;
  INSERT INTO public.missions(user_id,title,attribute_id,priority,days_of_week,is_failed)
  VALUES (u,'falha',a,'baixa',all_days,true) RETURNING id INTO failed_m;
  before_state := private.a4_snapshot(u);
  FOR i IN 1..4 LOOP
    BEGIN
      PERFORM public.complete_mission(
        CASE i WHEN 1 THEN unique_m WHEN 2 THEN today_m
               WHEN 3 THEN yesterday_m ELSE failed_m END,
        CASE i WHEN 2 THEN d - 1 ELSE d END);
      RAISE EXCEPTION 'off-schedule or failed accepted: %', i;
    EXCEPTION WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM <> (CASE WHEN i = 4 THEN 'MISSION_NOT_ACTIVE'
                         ELSE 'MISSION_NOT_SCHEDULED' END) THEN RAISE; END IF;
    END;
  END LOOP;
  IF private.a4_snapshot(u) IS DISTINCT FROM before_state THEN
    RAISE EXCEPTION 'schedule refusal mutated economy';
  END IF;

  UPDATE public.missions SET due_date = d WHERE id = unique_m;
  result := public.complete_mission(unique_m,d);
  IF (result->>'xp_gained')::integer <= 0 THEN RAISE EXCEPTION 'unique unpaid'; END IF;
  PERFORM public.complete_mission(today_m,d);
  PERFORM public.complete_mission(yesterday_m,d - 1);
  IF (SELECT count(*) FROM public.mission_daily_completions
      WHERE user_id = u AND mission_id IN (unique_m,today_m,yesterday_m)) <> 3 THEN
    RAISE EXCEPTION 'daily/unique ledger missing';
  END IF;
  before_state := private.a4_snapshot(u);
  BEGIN
    PERFORM public.complete_mission(unique_m,d);
    RAISE EXCEPTION 'unique replay accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'MISSION_NOT_ACTIVE' THEN RAISE; END IF;
  END;
  IF private.a4_snapshot(u) IS DISTINCT FROM before_state THEN
    RAISE EXCEPTION 'unique replay mutated economy';
  END IF;

  INSERT INTO public.missions(user_id,title,attribute_id,priority,
                              frequency_type,target_count,max_count)
  VALUES (u,'semanal flex',a,'baixa','weekly',2,2) RETURNING id INTO weekly_m;
  PERFORM public.complete_mission(weekly_m,d);
  INSERT INTO public.missions(user_id,title,attribute_id,priority,
                              frequency_type,target_count,max_count)
  VALUES (u,'semanal cheia',a,'baixa','weekly',1,1)
  RETURNING id INTO full_weekly_m;
  INSERT INTO public.mission_weekly_progress(mission_id,user_id,week_start,
                                             current_count)
  VALUES (full_weekly_m,u,d - (extract(isodow FROM d)::integer - 1),1);
  before_state := private.a4_snapshot(u);
  BEGIN
    PERFORM public.complete_mission(full_weekly_m,d);
    RAISE EXCEPTION 'weekly quota accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'WEEKLY_CAP_REACHED' THEN RAISE; END IF;
  END;
  IF private.a4_snapshot(u) IS DISTINCT FROM before_state THEN
    RAISE EXCEPTION 'weekly quota refusal mutated economy';
  END IF;

  SELECT xp_earned,gold_earned INTO STRICT paid_xp,paid_gold
  FROM public.mission_daily_completions
  WHERE mission_id = unique_m AND completion_date = d;
  SELECT total_xp INTO xp_before FROM public.profiles WHERE user_id = u;
  SELECT gold INTO gold_before FROM public.user_balance WHERE user_id = u;
  SELECT xp INTO attr_before FROM public.attributes WHERE id = a;
  UPDATE public.profiles SET total_xp = 0 WHERE user_id = u;
  before_state := private.a4_snapshot(u);
  BEGIN
    PERFORM public.undo_mission(unique_m,d);
    RAISE EXCEPTION 'undo without XP accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Saldo de progressao insuficiente%' THEN RAISE; END IF;
  END;
  IF private.a4_snapshot(u) IS DISTINCT FROM before_state THEN
    RAISE EXCEPTION 'insufficient XP undo mutated economy';
  END IF;
  UPDATE public.profiles SET total_xp = xp_before WHERE user_id = u;
  UPDATE public.user_balance SET gold = 0 WHERE user_id = u;
  before_state := private.a4_snapshot(u);
  BEGIN
    PERFORM public.undo_mission(unique_m,d);
    RAISE EXCEPTION 'undo without gold accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Saldo de ouro insuficiente%' THEN RAISE; END IF;
  END;
  IF private.a4_snapshot(u) IS DISTINCT FROM before_state THEN
    RAISE EXCEPTION 'insufficient balance undo mutated economy';
  END IF;
  UPDATE public.user_balance SET gold = gold_before WHERE user_id = u;

  UPDATE public.mission_daily_completions SET xp_earned = -1
  WHERE mission_id = unique_m AND completion_date = d;
  before_state := private.a4_snapshot(u);
  BEGIN
    PERFORM public.undo_mission(unique_m,d);
    RAISE EXCEPTION 'negative XP undo accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'REVERSAL_LEDGER_INVALID' THEN RAISE; END IF;
  END;
  IF private.a4_snapshot(u) IS DISTINCT FROM before_state THEN
    RAISE EXCEPTION 'negative XP undo mutated economy';
  END IF;
  UPDATE public.mission_daily_completions
  SET xp_earned = paid_xp, gold_earned = -1
  WHERE mission_id = unique_m AND completion_date = d;
  before_state := private.a4_snapshot(u);
  BEGIN
    PERFORM public.undo_mission(unique_m,d);
    RAISE EXCEPTION 'negative gold undo accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'REVERSAL_LEDGER_INVALID' THEN RAISE; END IF;
  END;
  IF private.a4_snapshot(u) IS DISTINCT FROM before_state THEN
    RAISE EXCEPTION 'negative gold undo mutated economy';
  END IF;
  UPDATE public.mission_daily_completions SET gold_earned = paid_gold
  WHERE mission_id = unique_m AND completion_date = d;

  result := public.undo_mission(unique_m,d);
  IF (result->>'xpEarned')::integer <> paid_xp
     OR (result->>'goldEarned')::integer <> paid_gold
     OR (SELECT total_xp FROM public.profiles WHERE user_id = u) <> xp_before - paid_xp
     OR (SELECT gold FROM public.user_balance WHERE user_id = u) <> gold_before - paid_gold
     OR (SELECT xp FROM public.attributes WHERE id = a) <> attr_before - paid_xp THEN
    RAISE EXCEPTION 'unique undo did not debit exact ledger';
  END IF;
  result := public.undo_mission(yesterday_m,d - 1);
  IF (result->>'xpEarned')::integer <= 0 OR EXISTS (
    SELECT 1 FROM public.mission_daily_completions WHERE mission_id = yesterday_m
      AND completion_date = d - 1) THEN RAISE EXCEPTION 'D-1 undo failed'; END IF;
  before_state := private.a4_snapshot(u);
  BEGIN
    PERFORM public.undo_mission(yesterday_m,d - 1);
    RAISE EXCEPTION 'undo replay accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%não foi concluída%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.undo_mission(today_m,d - 2);
    RAISE EXCEPTION 'D-2 undo accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'DATE_OUT_OF_WINDOW' THEN RAISE; END IF;
  END;
  IF private.a4_snapshot(u) IS DISTINCT FROM before_state THEN
    RAISE EXCEPTION 'replayed/out-of-window undo mutated economy';
  END IF;
  RAISE NOTICE 'A4 agenda, archive, owner, weekly, ledger and undo: PASS';
END;
$test$;
ROLLBACK;
