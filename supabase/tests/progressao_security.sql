-- PostgreSQL local: identidade, ACL, DML direto e rollback transacional.
BEGIN;
SET LOCAL statement_timeout = '30s';
INSERT INTO auth.users(id,email) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','progressao-a@example.invalid'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','progressao-b@example.invalid');
INSERT INTO public.missions(id,user_id,title,attribute_id,xp_reward,priority,
                            frequency_type,days_of_week)
SELECT 'cccccccc-cccc-cccc-cccc-cccccccccccc',
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','ACL',id,20,'media','daily',
       '["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]'::jsonb
  FROM public.attributes WHERE user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET LOCAL request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

DO $pre$
BEGIN
  IF to_regprocedure('public.complete_mission(uuid)') IS NOT NULL
     OR to_regprocedure('public._complete_mission_with_weekly(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'Alias antigo permaneceu exposto/ambiguo';
  END IF;
  IF has_function_privilege('authenticated','public._complete_mission_daily(uuid,date,integer)','EXECUTE')
     OR has_function_privilege('authenticated','public._complete_mission_with_weekly(uuid,date)','EXECUTE')
     OR has_function_privilege('anon','public._complete_mission_with_weekly(uuid,date)','EXECUTE')
     OR has_function_privilege('authenticated','public.add_xp_to_user(uuid,integer)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.complete_mission(uuid,date)','EXECUTE') THEN
    RAISE EXCEPTION 'ACL de progresso incorreta';
  END IF;
END $pre$;

SET LOCAL ROLE authenticated;
DO $client$
DECLARE
  m uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  d date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  rejected boolean;
BEGIN
  rejected := false;
  BEGIN PERFORM public._complete_mission_daily(m,d,12);
  EXCEPTION WHEN insufficient_privilege THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Helper diario exposto'; END IF;
  rejected := false;
  BEGIN PERFORM public._complete_mission_with_weekly(m,d);
  EXCEPTION WHEN insufficient_privilege THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Helper semanal exposto'; END IF;
  rejected := false;
  BEGIN UPDATE public.profiles SET total_xp=1000000
         WHERE user_id=auth.uid();
  EXCEPTION WHEN OTHERS THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'UPDATE direto no XP permitido'; END IF;
  rejected := false;
  BEGIN INSERT INTO public.profiles(user_id,total_xp)
        VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd',1000000);
  EXCEPTION WHEN OTHERS THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'INSERT de perfil com XP permitido'; END IF;
  rejected := false;
  BEGIN INSERT INTO public.attributes(user_id,name,xp)
        VALUES (auth.uid(),'Forjado',1000000);
  EXCEPTION WHEN OTHERS THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'INSERT de atributo com XP permitido'; END IF;
  rejected := false;
  BEGIN INSERT INTO public.checklist_items(mission_id,description,xp_bonus)
        VALUES (m,'Forjado',1000000);
  EXCEPTION WHEN insufficient_privilege THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'INSERT de bonus forjado permitido'; END IF;
  INSERT INTO public.checklist_items(mission_id,description) VALUES (m,'Legitimo');
  rejected := false;
  BEGIN UPDATE public.checklist_items SET xp_bonus=1000000 WHERE mission_id=m;
  EXCEPTION WHEN insufficient_privilege THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'UPDATE de bonus forjado permitido'; END IF;
  UPDATE public.checklist_items SET completed=true WHERE mission_id=m;

  -- O wrapper continua utilizavel pelo dono.
  -- A migration de prioridades fixa a base futura em 25; checklist padrao +2.
  IF (public.complete_mission(m,d)->>'xp_gained')::integer <> 27 THEN
    RAISE EXCEPTION 'Wrapper do dono nao pagou bonus default';
  END IF;
  PERFORM set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',true);
  rejected := false;
  BEGIN PERFORM public.undo_mission(m,d);
  EXCEPTION WHEN OTHERS THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Outro usuario desfez missao alheia'; END IF;
  rejected := false;
  BEGIN PERFORM public.complete_mission(m,d);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM='MISSION_NOT_FOUND' THEN rejected := true; ELSE RAISE; END IF;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Outro usuario concluiu missao alheia'; END IF;
END $client$;
RESET ROLE;
SET LOCAL request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

SET LOCAL ROLE anon;
DO $anon$
DECLARE rejected boolean := false;
BEGIN
  BEGIN PERFORM public.complete_mission('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
    (now() AT TIME ZONE 'America/Sao_Paulo')::date);
  EXCEPTION WHEN insufficient_privilege THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Wrapper anon exposto'; END IF;
END $anon$;
RESET ROLE;

DO $achievements$
DECLARE
  d date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  rejected boolean;
BEGIN
  BEGIN
  INSERT INTO public.achievements(id,condition_type,condition_value,xp_reward) VALUES
    ('11111111-1111-1111-1111-111111111111','missions_total',2,30),
    ('22222222-2222-2222-2222-222222222222','level_reached',2,40),
    ('33333333-3333-3333-3333-333333333333','missions_streak',2,80);
  INSERT INTO public.user_achievements(id,user_id,achievement_id) VALUES
    ('44444444-4444-4444-4444-444444444444',auth.uid(),'11111111-1111-1111-1111-111111111111'),
    ('55555555-5555-5555-5555-555555555555',auth.uid(),'22222222-2222-2222-2222-222222222222'),
    ('66666666-6666-6666-6666-666666666666',auth.uid(),'33333333-3333-3333-3333-333333333333');
  rejected := false;
  BEGIN PERFORM public.claim_achievement('44444444-4444-4444-4444-444444444444');
  EXCEPTION WHEN OTHERS THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'missions_total sem meta pagou XP'; END IF;
  UPDATE public.achievements SET condition_value=1
   WHERE id='11111111-1111-1111-1111-111111111111';
  PERFORM public.claim_achievement('44444444-4444-4444-4444-444444444444');
  rejected := false;
  BEGIN PERFORM public.claim_achievement('55555555-5555-5555-5555-555555555555');
  EXCEPTION WHEN OTHERS THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'level_reached sem nivel pagou XP'; END IF;
  UPDATE public.profiles SET level=2 WHERE user_id=auth.uid();
  PERFORM public.claim_achievement('55555555-5555-5555-5555-555555555555');
  rejected := false;
  BEGIN PERFORM public.claim_achievement('66666666-6666-6666-6666-666666666666');
  EXCEPTION WHEN OTHERS THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'missions_streak sem dias pagou XP'; END IF;
  INSERT INTO public.mission_daily_completions
    (mission_id,completion_date,user_id,credited_total_verified,completion_kind)
  VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc',d-1,auth.uid(),true,'daily');
  PERFORM public.claim_achievement('66666666-6666-6666-6666-666666666666');
  IF (SELECT total_xp FROM public.profiles WHERE user_id=auth.uid()) <> 177 THEN
    RAISE EXCEPTION 'Conquistas legitimas nao mantiveram XP';
  END IF;
  RAISE EXCEPTION USING ERRCODE = 'ZX001', MESSAGE = 'rollback only achievement fixture';
  EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
  END;
END $achievements$;

DO $rollback$
DECLARE
  m uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  d date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  xp_before integer;
  rejected boolean;
BEGIN
  SELECT total_xp INTO xp_before FROM public.profiles WHERE user_id=auth.uid();
  UPDATE public.user_balance SET gold=0 WHERE user_id=auth.uid();
  rejected := false;
  BEGIN PERFORM public.undo_mission(m,d);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'Saldo de ouro insuficiente%' THEN rejected := true; ELSE RAISE; END IF;
  END;
  IF NOT rejected OR (SELECT total_xp FROM public.profiles WHERE user_id=auth.uid()) <> xp_before
     OR NOT EXISTS (SELECT 1 FROM public.mission_daily_completions WHERE mission_id=m)
     OR (SELECT daily_status->>d::text FROM public.missions WHERE id=m) <> 'completed' THEN
    RAISE EXCEPTION 'Falha de ouro mudou estado';
  END IF;
  UPDATE public.user_balance SET gold=100 WHERE user_id=auth.uid();
  UPDATE public.profiles SET total_xp=0 WHERE user_id=auth.uid();
  rejected := false;
  BEGIN PERFORM public.undo_mission(m,d);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'Saldo de progressao insuficiente%' THEN rejected := true; ELSE RAISE; END IF;
  END;
  IF NOT rejected OR NOT EXISTS (SELECT 1 FROM public.mission_daily_completions WHERE mission_id=m) THEN
    RAISE EXCEPTION 'Falha de XP mudou ledger';
  END IF;
  UPDATE public.profiles SET total_xp=xp_before WHERE user_id=auth.uid();
  INSERT INTO public.plans(id,user_id,current_value)
  VALUES ('77777777-7777-7777-7777-777777777777',auth.uid(),1);
  INSERT INTO public.plan_missions(plan_id,mission_id)
  VALUES ('77777777-7777-7777-7777-777777777777',m);
  PERFORM public.undo_mission(m,d);
  IF (SELECT total_xp FROM public.profiles WHERE user_id=auth.uid()) <> 0 THEN
    RAISE EXCEPTION 'Undo final incorreto';
  END IF;
  IF (SELECT total_xp FROM public.profiles WHERE user_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') <> 0 THEN
    RAISE EXCEPTION 'Perfil alheio modificado';
  END IF;
  IF (SELECT current_value FROM public.plans WHERE id='77777777-7777-7777-7777-777777777777') <> 0 THEN
    RAISE EXCEPTION 'Plano vinculado nao revertido';
  END IF;

  -- A nova regra recusa o credito inteiro quando o atributo primario e alheio.
  INSERT INTO public.missions(id,user_id,title,attribute_id,xp_reward,priority,
                              frequency_type,days_of_week)
  SELECT '88888888-8888-8888-8888-888888888888',auth.uid(),'Atributo alheio',
         id,20,'media','daily','["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]'::jsonb
    FROM public.attributes
   WHERE user_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  rejected := false;
  BEGIN
    PERFORM public.complete_mission('88888888-8888-8888-8888-888888888888',d);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'ATTRIBUTE_NOT_OWNED_OR_MISSING' THEN rejected := true;
    ELSE RAISE; END IF;
  END;
  IF NOT rejected OR (SELECT total_xp FROM public.profiles WHERE user_id=auth.uid()) <> 0 THEN
    RAISE EXCEPTION 'Atributo primario alheio nao recusou credito';
  END IF;
  IF (SELECT xp FROM public.attributes
       WHERE user_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') <> 0 THEN
    RAISE EXCEPTION 'Conclusao mudou atributo alheio';
  END IF;
END $rollback$;
ROLLBACK;
