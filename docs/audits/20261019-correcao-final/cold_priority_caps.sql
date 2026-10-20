-- Own public-path cap probe: scheduled days, 4/8 paid limits, low unlimited,
-- and persistent paid reservation after undo. All rows roll back.
BEGIN;
SET LOCAL statement_timeout='60s';
INSERT INTO auth.users(id,email) VALUES
 ('a1500000-0000-0000-0000-000000000001','cold-priority@example.invalid');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='a1500000-0000-0000-0000-000000000001';
DO $caps$
DECLARE
 d date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
 today_label text;
 tomorrow_label text;
 own_attribute uuid;
 h uuid[] := ARRAY[]::uuid[];
 m uuid[] := ARRAY[]::uuid[];
 l uuid[] := ARRAY[]::uuid[];
 new_id uuid;
 i integer;
 denied boolean;
 paid jsonb;
BEGIN
 today_label := (ARRAY['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'])[extract(dow FROM d)::integer+1];
 tomorrow_label := (ARRAY['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'])[extract(dow FROM d+1)::integer+1];
 SELECT id INTO STRICT own_attribute FROM public.attributes
 WHERE user_id=auth.uid() AND name='Disciplina';
 FOR i IN 1..4 LOOP
   INSERT INTO public.missions(user_id,title,attribute_id,priority,frequency_type,days_of_week)
   VALUES(auth.uid(),'high '||i,own_attribute,'alta','daily',jsonb_build_array(today_label))
   RETURNING id INTO new_id;
   h := array_append(h,new_id);
 END LOOP;
 FOR i IN 1..8 LOOP
   INSERT INTO public.missions(user_id,title,attribute_id,priority,frequency_type,days_of_week)
   VALUES(auth.uid(),'medium '||i,own_attribute,'media','daily',jsonb_build_array(today_label))
   RETURNING id INTO new_id;
   m := array_append(m,new_id);
 END LOOP;
 FOR i IN 1..10 LOOP
   INSERT INTO public.missions(user_id,title,attribute_id,priority,frequency_type,days_of_week)
   VALUES(auth.uid(),'low '||i,own_attribute,'baixa','daily',jsonb_build_array(today_label))
   RETURNING id INTO new_id;
   l := array_append(l,new_id);
 END LOOP;
 denied := false;
 BEGIN
   INSERT INTO public.missions(user_id,title,attribute_id,priority,frequency_type,days_of_week)
   VALUES(auth.uid(),'fifth high today',own_attribute,'alta','daily',jsonb_build_array(today_label));
 EXCEPTION WHEN check_violation THEN
   IF SQLERRM LIKE 'MISSION_PRIORITY_CAP:alta:%' THEN denied := true; ELSE RAISE; END IF;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'FIFTH_SCHEDULED_HIGH_ACCEPTED'; END IF;
 denied := false;
 BEGIN
   INSERT INTO public.missions(user_id,title,attribute_id,priority,frequency_type,days_of_week)
   VALUES(auth.uid(),'ninth medium today',own_attribute,'media','daily',jsonb_build_array(today_label));
 EXCEPTION WHEN check_violation THEN
   IF SQLERRM LIKE 'MISSION_PRIORITY_CAP:media:%' THEN denied := true; ELSE RAISE; END IF;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'NINTH_SCHEDULED_MEDIUM_ACCEPTED'; END IF;
 -- Same user may schedule a fifth high on another day.
 INSERT INTO public.missions(user_id,title,attribute_id,priority,frequency_type,days_of_week)
 VALUES(auth.uid(),'high tomorrow',own_attribute,'alta','daily',jsonb_build_array(tomorrow_label));
 FOREACH new_id IN ARRAY h LOOP
   paid := public.complete_mission(new_id,d);
   IF (paid->>'xp_gained')::integer <> 50 THEN RAISE EXCEPTION 'HIGH_XP_WRONG: %',paid; END IF;
 END LOOP;
 FOREACH new_id IN ARRAY m LOOP
   paid := public.complete_mission(new_id,d);
   IF (paid->>'xp_gained')::integer <> 25 THEN RAISE EXCEPTION 'MEDIUM_XP_WRONG: %',paid; END IF;
 END LOOP;
 FOREACH new_id IN ARRAY l LOOP
   paid := public.complete_mission(new_id,d);
   IF (paid->>'xp_gained')::integer <> 5 THEN RAISE EXCEPTION 'LOW_XP_WRONG: %',paid; END IF;
 END LOOP;
 PERFORM public.undo_mission(h[1],d);
 UPDATE public.missions SET status='arquivada' WHERE id=h[1];
 denied := false;
 BEGIN
   INSERT INTO public.missions(user_id,title,attribute_id,priority,frequency_type,days_of_week)
   VALUES(auth.uid(),'replacement high',own_attribute,'alta','daily',jsonb_build_array(today_label));
 EXCEPTION WHEN check_violation THEN
   IF SQLERRM LIKE 'MISSION_PRIORITY_CAP:alta:%' THEN denied := true; ELSE RAISE; END IF;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'UNDO_FREED_HISTORICAL_HIGH_SLOT'; END IF;
 UPDATE public.missions SET status='pendente' WHERE id=h[1];
 paid := public.complete_mission(h[1],d);
 IF (paid->>'xp_gained')::integer <> 50 THEN RAISE EXCEPTION 'SAME_MISSION_REDO_FAILED'; END IF;
 RAISE NOTICE 'COLD_PRIORITY_PASS: today 4 high/8 medium, 10 low; tomorrow separate; undo preserves paid slot';
END $caps$;
ROLLBACK;
