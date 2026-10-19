-- Negative probe for an unconsumed routine-derived XP buff after undo.
-- Replaces only the reduced fixture's neutral helper, inside a transaction,
-- with the exact helper body captured read-only from live-extra-functions.json
-- on 2026-10-19. Run with psql -X -v ON_ERROR_STOP=1 -f this_file.
BEGIN;
SET LOCAL statement_timeout='30s';
CREATE OR REPLACE FUNCTION public._grant_flow_xp_buff(p_uid uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_item uuid;
BEGIN
  SELECT id INTO v_item FROM public.shop_items WHERE effect = 'estado_fluxo_xp' LIMIT 1;
  IF v_item IS NULL THEN RETURN; END IF;
  INSERT INTO public.user_buffs (user_id, item_id, active, expires_at)
  VALUES (p_uid, v_item, true, now() + interval '48 hours');
END;
$function$;
INSERT INTO auth.users(id,email) VALUES
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','audit-flow@example.invalid');
INSERT INTO public.shop_items(id,effect) VALUES
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbc','estado_fluxo_xp');
INSERT INTO public.talentos_disponiveis(id,efeito) VALUES
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbd','estado_de_fluxo');
INSERT INTO public.talentos_jogador(personagem_id,talento_id) VALUES
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbd');
INSERT INTO public.missions(id,user_id,title,priority,frequency_type,days_of_week,mission_category)
VALUES
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'Creative','media','daily','["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]','criativo'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'Other','media','daily','["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]','geral');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SELECT public.complete_mission('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
 (now() AT TIME ZONE 'America/Sao_Paulo')::date)->>'xp_gained' AS first_xp;
SELECT public.undo_mission('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
 (now() AT TIME ZONE 'America/Sao_Paulo')::date)->>'xpEarned' AS undone_xp;
RESET ROLE;
SELECT count(*) AS buff_after_undo FROM public.user_buffs ub
 JOIN public.shop_items si ON si.id=ub.item_id
 WHERE ub.user_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
   AND ub.active AND si.effect='estado_fluxo_xp';
SET LOCAL ROLE authenticated;
SELECT public.complete_mission('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
 (now() AT TIME ZONE 'America/Sao_Paulo')::date)->>'xp_gained' AS second_xp;
RESET ROLE;
DO $audit$
DECLARE v_active integer; v_xp integer;
BEGIN
  SELECT count(*) INTO v_active FROM public.user_buffs ub
   JOIN public.shop_items si ON si.id=ub.item_id
   WHERE ub.user_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
     AND ub.active AND si.effect='estado_fluxo_xp';
  SELECT total_xp INTO v_xp FROM public.profiles
   WHERE user_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  RAISE NOTICE 'active buff after next routine=%, next medium routine XP=%',
    v_active,v_xp;
  IF v_xp>25 THEN
    RAISE EXCEPTION 'AUDIT_FLOW_BUFF_REMAINS: undone routine raises later XP';
  END IF;
END;
$audit$;
ROLLBACK;
