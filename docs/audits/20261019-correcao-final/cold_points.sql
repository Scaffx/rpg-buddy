-- Independent point ledger proof with captured 3600-XP level-five curve.
BEGIN;
SET LOCAL statement_timeout='30s';
INSERT INTO auth.users(id,email) VALUES
 ('a1300000-0000-0000-0000-000000000001','cold-points@example.invalid');
UPDATE public.profiles SET total_xp=3590,level=4
WHERE user_id='a1300000-0000-0000-0000-000000000001';
INSERT INTO public.talentos_disponiveis(id,nome,descricao,efeito) VALUES
 ('a1300000-0000-0000-0000-000000000011','Audit purchase','Audit purchase','audit_purchase_13');
INSERT INTO public.missions(id,user_id,title,attribute_id,priority,frequency_type,days_of_week,mission_category)
SELECT ('a1300000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,
 a.user_id,'Threshold ' || n,a.id,'media','daily',
 '["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]'::jsonb,'geral'
FROM public.attributes a CROSS JOIN generate_series(101,102) n
WHERE a.user_id='a1300000-0000-0000-0000-000000000001' AND a.name='Disciplina';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='a1300000-0000-0000-0000-000000000001';
DO $points$
DECLARE
 d date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
 a uuid := 'a1300000-0000-0000-0000-000000000101';
 b uuid := 'a1300000-0000-0000-0000-000000000102';
 p record;
 before_attr integer;
 before_gold integer;
 denied boolean := false;
BEGIN
 PERFORM public.complete_mission(a,d);
 SELECT total_xp,level,pontos_talento INTO p FROM public.profiles WHERE user_id=auth.uid();
 IF (p.total_xp,p.level,p.pontos_talento) IS DISTINCT FROM (3615,5,1)
 THEN RAISE EXCEPTION 'LEVEL_UP_WRONG: %',row_to_json(p); END IF;
 PERFORM public.undo_mission(a,d);
 SELECT total_xp,level,pontos_talento INTO p FROM public.profiles WHERE user_id=auth.uid();
 IF (p.total_xp,p.level,p.pontos_talento) IS DISTINCT FROM (3590,4,0)
 THEN RAISE EXCEPTION 'LEVEL_DOWN_WRONG: %',row_to_json(p); END IF;
 PERFORM public.complete_mission(a,d);
 PERFORM public.complete_mission(b,d);
 PERFORM public.undo_mission(a,d);
 SELECT total_xp,level,pontos_talento INTO p FROM public.profiles WHERE user_id=auth.uid();
 IF (p.total_xp,p.level,p.pontos_talento) IS DISTINCT FROM (3615,5,1)
 THEN RAISE EXCEPTION 'A_B_UNDO_A_WRONG: %',row_to_json(p); END IF;
 PERFORM public.undo_mission(b,d);
 SELECT total_xp,level,pontos_talento INTO p FROM public.profiles WHERE user_id=auth.uid();
 IF (p.total_xp,p.level,p.pontos_talento) IS DISTINCT FROM (3590,4,0)
 THEN RAISE EXCEPTION 'A_B_UNDO_B_WRONG: %',row_to_json(p); END IF;
 PERFORM public.complete_mission(a,d);
 PERFORM public.buy_talent('a1300000-0000-0000-0000-000000000011');
 SELECT xp INTO before_attr FROM public.attributes WHERE user_id=auth.uid() AND name='Disciplina';
 SELECT gold INTO before_gold FROM public.user_balance WHERE user_id=auth.uid();
 BEGIN
   PERFORM public.undo_mission(a,d);
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
   IF SQLERRM LIKE 'TALENT_POINTS_SPENT:%' THEN denied := true; ELSE RAISE; END IF;
 END;
 SELECT total_xp,level,pontos_talento INTO p FROM public.profiles WHERE user_id=auth.uid();
 IF NOT denied OR (p.total_xp,p.level,p.pontos_talento) IS DISTINCT FROM (3615,5,0)
    OR (SELECT xp FROM public.attributes WHERE user_id=auth.uid() AND name='Disciplina') <> before_attr
    OR (SELECT gold FROM public.user_balance WHERE user_id=auth.uid()) <> before_gold
    OR NOT EXISTS (SELECT 1 FROM public.mission_daily_completions
       WHERE mission_id=a AND completion_date=d)
 THEN RAISE EXCEPTION 'SPENT_POINT_UNDO_NOT_ATOMIC: %',row_to_json(p); END IF;
 RAISE NOTICE 'COLD_POINTS_PASS: 4->5->4, A/B, spent point atomic refusal';
END $points$;
RESET ROLE;
DO $receipts$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM private.mission_effect_receipts
    WHERE mission_id='a1300000-0000-0000-0000-000000000101')
    OR NOT EXISTS (SELECT 1 FROM private.mission_attribute_receipts
    WHERE mission_id='a1300000-0000-0000-0000-000000000101')
 THEN RAISE EXCEPTION 'SPENT_POINT_UNDO_REMOVED_RECEIPTS'; END IF;
END $receipts$;
ROLLBACK;
