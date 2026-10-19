-- Independent rollback-only public RPC probe on the composed PG17 fixture.
-- Every talent exercised by an effect is explicitly equipped. The inactive
-- talent is a separate negative control. No helper is replaced in this probe.
BEGIN;
SET LOCAL statement_timeout = '30s';
INSERT INTO auth.users(id,email) VALUES
 ('a1100000-0000-0000-0000-000000000001','cold-effects@example.invalid'),
 ('a1100000-0000-0000-0000-000000000002','cold-inactive@example.invalid');
INSERT INTO public.shop_items(id,effect) VALUES
 ('a1100000-0000-0000-0000-000000000010','estado_fluxo_xp');
INSERT INTO public.talentos_disponiveis(id,nome,descricao,efeito) VALUES
 ('a1100000-0000-0000-0000-000000000011','Social audit','Social audit','presenca_inspiradora'),
 ('a1100000-0000-0000-0000-000000000012','Flow audit','Flow audit','estado_de_fluxo'),
 ('a1100000-0000-0000-0000-000000000013','Health audit','Health audit','corpo_de_ferro');
INSERT INTO public.talentos_jogador(personagem_id,talento_id,equipped)
SELECT 'a1100000-0000-0000-0000-000000000001',id,true
FROM public.talentos_disponiveis WHERE nome LIKE '% audit';
INSERT INTO public.talentos_jogador(personagem_id,talento_id,equipped)
VALUES ('a1100000-0000-0000-0000-000000000002',
        'a1100000-0000-0000-0000-000000000011',false);
INSERT INTO public.missions(id,user_id,title,priority,frequency_type,days_of_week,mission_category)
VALUES
 ('a1100000-0000-0000-0000-000000000101','a1100000-0000-0000-0000-000000000001','social A','baixa','daily','["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]','social'),
 ('a1100000-0000-0000-0000-000000000102','a1100000-0000-0000-0000-000000000001','social B','baixa','daily','["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]','social'),
 ('a1100000-0000-0000-0000-000000000103','a1100000-0000-0000-0000-000000000001','creative','baixa','daily','["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]','criativo'),
 ('a1100000-0000-0000-0000-000000000104','a1100000-0000-0000-0000-000000000001','physical','baixa','daily','["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]','fisico'),
 ('a1100000-0000-0000-0000-000000000105','a1100000-0000-0000-0000-000000000001','next XP','media','daily','["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]','geral'),
 ('a1100000-0000-0000-0000-000000000106','a1100000-0000-0000-0000-000000000002','inactive social','baixa','daily','["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]','social');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='a1100000-0000-0000-0000-000000000002';
DO $inactive$
DECLARE d date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
 PERFORM public.complete_mission('a1100000-0000-0000-0000-000000000106',d);
 IF (SELECT inspired_available FROM public.profiles WHERE user_id=auth.uid()) THEN
   RAISE EXCEPTION 'INACTIVE_TALENT_APPLIED';
 END IF;
 PERFORM public.undo_mission('a1100000-0000-0000-0000-000000000106',d);
END $inactive$;

SET LOCAL request.jwt.claim.sub='a1100000-0000-0000-0000-000000000001';
DO $effects$
DECLARE
 d date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
 uid uuid := auth.uid();
 xp1 integer;
BEGIN
 -- A and B both grant inspiration. Remove A first, then B: the first
 -- grant must not reappear as B's predecessor.
 PERFORM public.complete_mission('a1100000-0000-0000-0000-000000000101',d);
 IF (SELECT inspired_available FROM public.profiles WHERE user_id=uid) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'EQUIPPED_SOCIAL_DID_NOT_APPLY'; END IF;
 PERFORM public.complete_mission('a1100000-0000-0000-0000-000000000102',d);
 PERFORM public.undo_mission('a1100000-0000-0000-0000-000000000101',d);
 IF (SELECT inspired_available FROM public.profiles WHERE user_id=uid) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'UNDO_A_CLEARED_B'; END IF;
 PERFORM public.undo_mission('a1100000-0000-0000-0000-000000000102',d);
 IF (SELECT inspired_available FROM public.profiles WHERE user_id=uid) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'UNDO_B_RESURRECTED_A'; END IF;

 PERFORM public.complete_mission('a1100000-0000-0000-0000-000000000103',d);
 IF NOT EXISTS (SELECT 1 FROM public.user_buffs b
                WHERE b.user_id=uid AND b.active
                  AND b.item_id='a1100000-0000-0000-0000-000000000010')
 THEN RAISE EXCEPTION 'EQUIPPED_FLOW_DID_NOT_APPLY'; END IF;
 PERFORM public.undo_mission('a1100000-0000-0000-0000-000000000103',d);
 IF EXISTS (SELECT 1 FROM public.user_buffs b
            WHERE b.user_id=uid AND b.active
              AND b.item_id='a1100000-0000-0000-0000-000000000010')
 THEN RAISE EXCEPTION 'FLOW_REMAINS_AFTER_UNDO'; END IF;
 xp1 := (public.complete_mission('a1100000-0000-0000-0000-000000000105',d)->>'xp_gained')::integer;
 IF xp1 <> 25 THEN RAISE EXCEPTION 'NEXT_XP_AFTER_FLOW_UNDO %',xp1; END IF;
 PERFORM public.undo_mission('a1100000-0000-0000-0000-000000000105',d);
 -- If B already spent A's Flow buff, undo A does not retroactively rewrite
 -- B's paid ledger. B's own undo still removes its actual 30 XP.
 PERFORM public.complete_mission('a1100000-0000-0000-0000-000000000103',d);
 xp1 := (public.complete_mission('a1100000-0000-0000-0000-000000000105',d)->>'xp_gained')::integer;
 IF xp1 <> 30 THEN RAISE EXCEPTION 'FLOW_WAS_NOT_CONSUMED_BY_B: %',xp1; END IF;
 PERFORM public.undo_mission('a1100000-0000-0000-0000-000000000103',d);
 IF (SELECT total_xp FROM public.profiles WHERE user_id=uid) <> 30
 THEN RAISE EXCEPTION 'UNDO_A_RECALCULATED_B_XP'; END IF;
 PERFORM public.undo_mission('a1100000-0000-0000-0000-000000000105',d);

 PERFORM public.complete_mission('a1100000-0000-0000-0000-000000000104',d);
 IF (SELECT max_hp FROM public.user_health_stats WHERE user_id=uid) <> 102
 THEN RAISE EXCEPTION 'EQUIPPED_HEALTH_DID_NOT_APPLY'; END IF;
 PERFORM public.undo_mission('a1100000-0000-0000-0000-000000000104',d);
 IF (SELECT max_hp FROM public.user_health_stats WHERE user_id=uid) <> 100
 THEN RAISE EXCEPTION 'MAX_HP_REMAINS_AFTER_UNDO'; END IF;
 IF (SELECT total_xp FROM public.profiles WHERE user_id=uid) <> 0
 THEN RAISE EXCEPTION 'XP_REMAINS_AFTER_UNDO'; END IF;
 RAISE NOTICE 'COLD_EFFECTS_PASS: equipped social A/B, Flow spent/unspent, HP, inactive talent, next XP=25/30';
END $effects$;
ROLLBACK;
