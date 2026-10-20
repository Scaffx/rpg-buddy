-- Public checklist state change must not pay progression before completion.
BEGIN;
SET LOCAL statement_timeout='30s';
INSERT INTO auth.users(id,email) VALUES
 ('a1600000-0000-0000-0000-000000000001','cold-checklist@example.invalid');
INSERT INTO public.missions(id,user_id,title,priority,frequency_type,days_of_week,mission_category)
VALUES ('a1600000-0000-0000-0000-000000000101',
 'a1600000-0000-0000-0000-000000000001','checklist routine','media','daily',
 '["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]','geral');
INSERT INTO public.checklist_items(id,mission_id,description,xp_bonus)
VALUES
 ('a1600000-0000-0000-0000-000000000011','a1600000-0000-0000-0000-000000000101','step one',2),
 ('a1600000-0000-0000-0000-000000000012','a1600000-0000-0000-0000-000000000101','step two',2);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='a1600000-0000-0000-0000-000000000001';
UPDATE public.checklist_items SET completed=true
WHERE mission_id='a1600000-0000-0000-0000-000000000101';
DO $state$
DECLARE d date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
        v_xp integer;
BEGIN
 IF (SELECT total_xp FROM public.profiles WHERE user_id=auth.uid()) <> 0
    OR (SELECT gold FROM public.user_balance WHERE user_id=auth.uid()) <> 100
    OR EXISTS (SELECT 1 FROM public.attributes WHERE user_id=auth.uid() AND xp<>0)
 THEN RAISE EXCEPTION 'CHECKLIST_TOGGLE_GRANTED_REWARD'; END IF;
 v_xp := (public.complete_mission('a1600000-0000-0000-0000-000000000101',d)->>'xp_gained')::integer;
 IF v_xp <> 29 OR (SELECT total_xp FROM public.profiles WHERE user_id=auth.uid()) <> 29
 THEN RAISE EXCEPTION 'CHECKLIST_COMPLETION_REWARD_WRONG: %',v_xp; END IF;
 PERFORM public.undo_mission('a1600000-0000-0000-0000-000000000101',d);
 IF (SELECT total_xp FROM public.profiles WHERE user_id=auth.uid()) <> 0
    OR EXISTS (SELECT 1 FROM public.attributes WHERE user_id=auth.uid() AND xp<>0)
 THEN RAISE EXCEPTION 'CHECKLIST_UNDO_RESIDUAL'; END IF;
 RAISE NOTICE 'COLD_CHECKLIST_PASS: toggle state only, 29 XP on completion, exact undo';
END $state$;
ROLLBACK;
