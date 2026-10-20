-- Independent source/cap tests with captured perfect-day and health helpers.
BEGIN;
SET LOCAL statement_timeout='45s';
INSERT INTO auth.users(id,email) VALUES
 ('a1800000-0000-0000-0000-000000000001','cold-effect-edges@example.invalid');
INSERT INTO public.talentos_disponiveis(id,nome,descricao,efeito) VALUES
 ('a1800000-0000-0000-0000-000000000011','Social edges','Social edges','presenca_inspiradora'),
 ('a1800000-0000-0000-0000-000000000012','Health edges','Health edges','corpo_de_ferro'),
 ('a1800000-0000-0000-0000-000000000013','Study edges','Study edges','rato_biblioteca');
INSERT INTO public.talentos_jogador(personagem_id,talento_id,equipped)
SELECT 'a1800000-0000-0000-0000-000000000001',id,true
FROM public.talentos_disponiveis WHERE nome LIKE '% edges';
INSERT INTO public.missions(id,user_id,title,priority,frequency_type,days_of_week,mission_category,is_anchor)
VALUES
 ('a1800000-0000-0000-0000-000000000101','a1800000-0000-0000-0000-000000000001','Anchor','media','daily','["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]','geral',true),
 ('a1800000-0000-0000-0000-000000000102','a1800000-0000-0000-0000-000000000001','Social','baixa','daily','["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]','social',false),
 ('a1800000-0000-0000-0000-000000000103','a1800000-0000-0000-0000-000000000001','Health A','baixa','daily','["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]','fisico',false),
 ('a1800000-0000-0000-0000-000000000104','a1800000-0000-0000-0000-000000000001','Health B','baixa','daily','["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]','fisico',false),
 ('a1800000-0000-0000-0000-000000000105','a1800000-0000-0000-0000-000000000001','Study','baixa','daily','["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]','estudo',false);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='a1800000-0000-0000-0000-000000000001';
SELECT public.complete_mission('a1800000-0000-0000-0000-000000000101',
 (now() AT TIME ZONE 'America/Sao_Paulo')::date)->>'xp_gained' AS anchor_xp;
CREATE TEMP TABLE cold_prior_inspiration AS
SELECT inspired_earned_at FROM public.profiles WHERE user_id=auth.uid();
DO $prior$
DECLARE d date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
 IF (SELECT inspired_available FROM public.profiles WHERE user_id=auth.uid()) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'ELIGIBLE_PERFECT_DAY_DID_NOT_INSPIRE'; END IF;
 PERFORM public.complete_mission('a1800000-0000-0000-0000-000000000102',d);
 PERFORM public.undo_mission('a1800000-0000-0000-0000-000000000102',d);
 IF (SELECT inspired_available FROM public.profiles WHERE user_id=auth.uid()) IS DISTINCT FROM true
    OR (SELECT inspired_earned_at FROM public.profiles WHERE user_id=auth.uid())
       IS DISTINCT FROM (SELECT inspired_earned_at FROM cold_prior_inspiration)
 THEN RAISE EXCEPTION 'PRIOR_PERFECT_DAY_INSPIRATION_LOST'; END IF;
END $prior$;
RESET ROLE;
UPDATE public.profiles SET inspired_available=false,inspired_earned_at=NULL
WHERE user_id='a1800000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.complete_mission('a1800000-0000-0000-0000-000000000102',
 (now() AT TIME ZONE 'America/Sao_Paulo')::date)->>'xp_gained' AS social_xp;
RESET ROLE;
-- Model combat consuming the social charge; undo must not recreate it.
UPDATE public.profiles SET inspired_available=false,inspired_earned_at=NULL
WHERE user_id='a1800000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.undo_mission('a1800000-0000-0000-0000-000000000102',
 (now() AT TIME ZONE 'America/Sao_Paulo')::date)->>'xpEarned' AS consumed_undo_xp;
DO $consumed$
BEGIN
 IF (SELECT inspired_available FROM public.profiles WHERE user_id=auth.uid())
 THEN RAISE EXCEPTION 'CONSUMED_INSPIRATION_RETURNED'; END IF;
END $consumed$;
SELECT public.complete_mission('a1800000-0000-0000-0000-000000000102',
 (now() AT TIME ZONE 'America/Sao_Paulo')::date)->>'xp_gained' AS social_redo_xp;
RESET ROLE;
UPDATE public.profiles SET inspired_available=true,
 inspired_earned_at=clock_timestamp()+interval '1 second'
WHERE user_id='a1800000-0000-0000-0000-000000000001';
CREATE TEMP TABLE cold_later_inspiration AS
SELECT inspired_earned_at FROM public.profiles
WHERE user_id='a1800000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.undo_mission('a1800000-0000-0000-0000-000000000102',
 (now() AT TIME ZONE 'America/Sao_Paulo')::date)->>'xpEarned' AS later_undo_xp;
RESET ROLE;
DO $later$
BEGIN
 IF (SELECT inspired_available FROM public.profiles WHERE user_id=auth.uid()) IS DISTINCT FROM true
    OR (SELECT inspired_earned_at FROM public.profiles WHERE user_id=auth.uid())
       IS DISTINCT FROM (SELECT inspired_earned_at FROM cold_later_inspiration)
 THEN RAISE EXCEPTION 'LATER_INSPIRATION_LOST'; END IF;
END $later$;
SET LOCAL ROLE authenticated;

DO $health_pair$
DECLARE d date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
 PERFORM public.complete_mission('a1800000-0000-0000-0000-000000000103',d);
 PERFORM public.complete_mission('a1800000-0000-0000-0000-000000000104',d);
 IF (SELECT (max_hp,max_mp) FROM public.user_health_stats WHERE user_id=auth.uid())
    IS DISTINCT FROM ROW(104,10)
 THEN RAISE EXCEPTION 'HEALTH_PAIR_GRANT_WRONG'; END IF;
 PERFORM public.undo_mission('a1800000-0000-0000-0000-000000000103',d);
 IF (SELECT (max_hp,max_mp) FROM public.user_health_stats WHERE user_id=auth.uid())
    IS DISTINCT FROM ROW(102,10)
 THEN RAISE EXCEPTION 'UNDO_HEALTH_A_REMOVED_B'; END IF;
 PERFORM public.undo_mission('a1800000-0000-0000-0000-000000000104',d);
 IF (SELECT (max_hp,max_mp) FROM public.user_health_stats WHERE user_id=auth.uid())
    IS DISTINCT FROM ROW(100,10)
 THEN RAISE EXCEPTION 'UNDO_HEALTH_B_RESIDUAL'; END IF;
END $health_pair$;
RESET ROLE;
UPDATE public.user_health_stats
SET max_hp=199,current_hp=150,max_mp=59,current_mp=40
WHERE user_id='a1800000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.complete_mission('a1800000-0000-0000-0000-000000000103',
 (now() AT TIME ZONE 'America/Sao_Paulo')::date)->>'xp_gained' AS cap_xp;
RESET ROLE;
UPDATE public.user_health_stats SET current_hp=80,current_mp=20
WHERE user_id='a1800000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
DO $damage$
DECLARE d date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
 IF (SELECT (max_hp,max_mp) FROM public.user_health_stats WHERE user_id=auth.uid())
    IS DISTINCT FROM ROW(200,59) THEN RAISE EXCEPTION 'HEALTH_CAP_WRONG'; END IF;
 PERFORM public.undo_mission('a1800000-0000-0000-0000-000000000103',d);
 IF (SELECT (max_hp,current_hp,max_mp,current_mp) FROM public.user_health_stats
     WHERE user_id=auth.uid()) IS DISTINCT FROM ROW(199,80,59,20)
 THEN RAISE EXCEPTION 'POST_GRANT_DAMAGE_REVERTED'; END IF;
END $damage$;
SELECT public.complete_mission('a1800000-0000-0000-0000-000000000103',
 (now() AT TIME ZONE 'America/Sao_Paulo')::date)->>'xp_gained' AS regen_xp;
RESET ROLE;
UPDATE public.user_health_stats SET current_hp=190,current_mp=50
WHERE user_id='a1800000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
DO $regen$
DECLARE d date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
 PERFORM public.undo_mission('a1800000-0000-0000-0000-000000000103',d);
 IF (SELECT (max_hp,current_hp,max_mp,current_mp) FROM public.user_health_stats
     WHERE user_id=auth.uid()) IS DISTINCT FROM ROW(199,190,59,50)
 THEN RAISE EXCEPTION 'POST_GRANT_REGEN_REVERTED'; END IF;
END $regen$;
SELECT public.complete_mission('a1800000-0000-0000-0000-000000000105',
 (now() AT TIME ZONE 'America/Sao_Paulo')::date)->>'xp_gained' AS study_xp;
RESET ROLE;
UPDATE public.user_health_stats SET current_mp=20
WHERE user_id='a1800000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
DO $mp$
DECLARE d date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
 IF (SELECT max_mp FROM public.user_health_stats WHERE user_id=auth.uid()) <> 60
 THEN RAISE EXCEPTION 'MP_CAP_WRONG'; END IF;
 PERFORM public.undo_mission('a1800000-0000-0000-0000-000000000105',d);
 IF (SELECT (max_hp,current_hp,max_mp,current_mp) FROM public.user_health_stats
     WHERE user_id=auth.uid()) IS DISTINCT FROM ROW(199,190,59,20)
 THEN RAISE EXCEPTION 'POST_GRANT_MP_SPEND_REVERTED'; END IF;
 RAISE NOTICE 'COLD_EFFECT_EDGES_PASS: perfect-day prior, consumed/later inspiration, HP A+B, HP/MP cap, damage, regen, MP spend';
END $mp$;
ROLLBACK;
