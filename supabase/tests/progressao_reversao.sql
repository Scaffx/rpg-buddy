-- Somente PostgreSQL LOCAL com schema do app e migration de progressao aplicada.
-- psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/progressao_reversao.sql
-- Nunca apontar este teste para producao; BEGIN/ROLLBACK nao o torna read-only.
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

DO $test$
DECLARE
  v_mode text;
  v_uid uuid;
  v_mission uuid;
  v_attr uuid;
  v_item uuid;
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_date date;
  v_days jsonb;
  v_frequency text;
  v_reward jsonb;
  v_reapply jsonb;
  v_undo jsonb;
  v_xp integer;
  v_gold integer;
  v_start_gold integer;
  v_ledger_xp integer;
  v_ledger_gold integer;
  v_verified boolean;
  v_kind text;
  v_week date;
  v_retry_rejected boolean;
BEGIN
  FOREACH v_mode IN ARRAY ARRAY[
    'daily', 'weekly', 'unique', 'weekly-milestone',
    'd1-daily', 'd1-weekly', 'd1-unique'
  ] LOOP
    v_uid := gen_random_uuid();
    v_mission := gen_random_uuid();
    v_item := gen_random_uuid();
    v_date := CASE WHEN v_mode LIKE 'd1-%' THEN v_today - 1 ELSE v_today END;
    v_frequency := CASE WHEN v_mode LIKE '%weekly%' THEN 'weekly' ELSE 'daily' END;
    v_days := CASE WHEN v_mode LIKE '%daily' THEN
      '["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]'::jsonb
      ELSE '[]'::jsonb END;

    INSERT INTO auth.users (id, email, raw_user_meta_data)
    VALUES (v_uid, 'progression-regression-' || v_uid || '@example.invalid',
      '{"display_name":"Progression regression"}'::jsonb);
    PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);
    PERFORM set_config('request.jwt.claims',
      jsonb_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    SELECT id INTO STRICT v_attr FROM public.attributes
     WHERE user_id = v_uid AND name = 'Disciplina';
    SELECT gold INTO STRICT v_start_gold FROM public.user_balance WHERE user_id = v_uid;

    INSERT INTO public.missions (
      id, user_id, title, attribute_id, xp_reward, priority,
      frequency_type, days_of_week, due_date, target_count, max_count
    ) VALUES (
      v_mission, v_uid, 'Progression regression', v_attr, 20, 'media',
      v_frequency, v_days,
      CASE WHEN v_mode IN ('unique', 'd1-unique') THEN v_date END,
      CASE WHEN v_mode = 'weekly-milestone' THEN 1
           WHEN v_frequency = 'weekly' THEN 6 END,
      CASE WHEN v_mode = 'weekly-milestone' THEN 1
           WHEN v_frequency = 'weekly' THEN 6 END
    );
    INSERT INTO public.checklist_items (id, mission_id, description, xp_bonus)
    VALUES (v_item, v_mission, 'Checklist +7', 7);

    UPDATE public.checklist_items SET completed = true WHERE id = v_item;
    UPDATE public.checklist_items SET completed = false WHERE id = v_item;
    UPDATE public.checklist_items SET completed = true WHERE id = v_item;
    IF (SELECT total_xp FROM public.profiles WHERE user_id = v_uid) <> 0 THEN
      RAISE EXCEPTION '%: toggle creditou XP', v_mode;
    END IF;

    v_retry_rejected := false;
    BEGIN
      PERFORM public.complete_mission(v_mission, v_today - 2);
    EXCEPTION WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM <> 'DATE_OUT_OF_WINDOW' THEN RAISE; END IF;
      v_retry_rejected := true;
    END;
    IF NOT v_retry_rejected THEN
      RAISE EXCEPTION '%: data fora de D-1 aceita', v_mode;
    END IF;
    v_retry_rejected := false;
    BEGIN
      PERFORM public.complete_mission(v_mission, v_today + 1);
    EXCEPTION WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM <> 'DATE_OUT_OF_WINDOW' THEN RAISE; END IF;
      v_retry_rejected := true;
    END;
    IF NOT v_retry_rejected THEN
      RAISE EXCEPTION '%: conclusao futura aceita', v_mode;
    END IF;

    v_reward := public.complete_mission(v_mission, v_date);
    v_xp := (v_reward->>'xp_gained')::integer;
    v_gold := (v_reward->>'gold_gained')::integer;
    IF v_xp <= 0 OR (v_reward->>'completed_date')::date <> v_date
       OR (SELECT total_xp FROM public.profiles WHERE user_id = v_uid) <> v_xp
       OR (SELECT gold FROM public.user_balance WHERE user_id = v_uid) <> v_start_gold + v_gold THEN
      RAISE EXCEPTION '%: concessao incorreta %', v_mode, v_reward;
    END IF;

    SELECT xp_earned, gold_earned, credited_total_verified,
           completion_kind, weekly_week_start
      INTO STRICT v_ledger_xp, v_ledger_gold, v_verified, v_kind, v_week
      FROM public.mission_daily_completions
     WHERE mission_id = v_mission AND completion_date = v_date;
    IF NOT v_verified OR v_kind <> (CASE WHEN v_frequency = 'weekly' THEN 'weekly'
      WHEN v_mode IN ('unique', 'd1-unique') THEN 'unique' ELSE 'daily' END) THEN
      RAISE EXCEPTION '%: ledger nao selado', v_mode;
    END IF;
    IF v_frequency = 'weekly' THEN
      IF v_week IS NULL OR v_ledger_xp <> (v_reward->>'execution_xp')::integer
         OR v_ledger_gold <> (v_reward->>'execution_gold')::integer THEN
        RAISE EXCEPTION '%: parcela semanal errada', v_mode;
      END IF;
    ELSIF v_week IS NOT NULL OR v_ledger_xp <> v_xp OR v_ledger_gold <> v_gold THEN
      RAISE EXCEPTION '%: total diario/unico errado', v_mode;
    END IF;

    v_retry_rejected := false;
    BEGIN
      PERFORM public.complete_mission(v_mission, v_date);
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%concluíd%'
         AND SQLERRM NOT IN ('ALREADY_COMPLETED_TODAY', 'MISSION_NOT_ACTIVE') THEN
        RAISE;
      END IF;
      v_retry_rejected := true;
    END;
    IF NOT v_retry_rejected OR
       (SELECT total_xp FROM public.profiles WHERE user_id = v_uid) <> v_xp THEN
      RAISE EXCEPTION '%: retry duplicou XP', v_mode;
    END IF;

    v_retry_rejected := false;
    BEGIN
      PERFORM public.undo_mission(v_mission, v_today + 1);
    EXCEPTION WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM <> 'DATE_OUT_OF_WINDOW' THEN RAISE; END IF;
      v_retry_rejected := true;
    END;
    IF NOT v_retry_rejected THEN
      RAISE EXCEPTION '%: undo futuro aceito', v_mode;
    END IF;

    v_undo := public.undo_mission(v_mission, v_date);
    IF (v_undo->>'xpEarned')::integer <> v_xp
       OR (v_undo->>'goldEarned')::integer <> v_gold
       OR (SELECT total_xp FROM public.profiles WHERE user_id = v_uid) <> 0
       OR (SELECT xp FROM public.attributes WHERE id = v_attr) <> 0
       OR (SELECT gold FROM public.user_balance WHERE user_id = v_uid) <> v_start_gold
       OR (SELECT COALESCE(sum(xp_gained), 0) FROM public.xp_history
           WHERE user_id = v_uid) <> 0 THEN
      RAISE EXCEPTION '%: undo parcial %', v_mode, v_undo;
    END IF;

    v_retry_rejected := false;
    BEGIN
      PERFORM public.undo_mission(v_mission, v_date);
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%não foi concluída%' THEN RAISE; END IF;
      v_retry_rejected := true;
    END;
    IF NOT v_retry_rejected OR
       (SELECT total_xp FROM public.profiles WHERE user_id = v_uid) <> 0 THEN
      RAISE EXCEPTION '%: segundo undo alterou o saldo', v_mode;
    END IF;

    UPDATE public.checklist_items SET completed = false WHERE id = v_item;
    v_reapply := public.complete_mission(v_mission, v_date);
    IF (v_reapply->>'xp_gained')::integer >= v_xp THEN
      RAISE EXCEPTION '%: reapply manteve checklist desmarcado', v_mode;
    END IF;
    RAISE NOTICE '%: credito %, undo %, reapply %', v_mode, v_xp,
      v_undo->>'xpEarned', v_reapply->>'xp_gained';
  END LOOP;
END;
$test$;
ROLLBACK;
