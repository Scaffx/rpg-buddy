-- Negative rollback-only probe: mission-derived max HP after undo.
-- Reduced fixture lacks MP columns, added here inside this transaction.
-- Helper body is from readonly live-health-functions.json at 22:03:32Z.
BEGIN;
SET LOCAL statement_timeout='30s';
ALTER TABLE public.user_health_stats
  ADD COLUMN current_mp integer DEFAULT 10,
  ADD COLUMN max_mp integer DEFAULT 10;
CREATE OR REPLACE FUNCTION public._apply_mission_health_effects(
  p_uid uuid, p_recover_pct numeric, p_add_hp integer, p_add_mp integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  h public.user_health_stats%ROWTYPE;
  base_max_hp int; base_cur_hp int; base_max_mp int; base_cur_mp int; v_fat int;
  hp_cap int; mp_cap int; hp_gain int; mp_gain int;
  max_hp_after int; max_mp_after int; lost_hp int; recovered int; cur_hp_after int; cur_mp_after int;
BEGIN
  SELECT * INTO h FROM public.user_health_stats WHERE user_id = p_uid;
  base_max_hp := COALESCE(h.max_hp, 100);
  base_cur_hp := COALESCE(h.current_hp, base_max_hp);
  base_max_mp := COALESCE(h.max_mp, 10);
  base_cur_mp := COALESCE(h.current_mp, base_max_mp);
  v_fat := COALESCE(h.fatigue, 0);
  hp_cap := GREATEST(0, 200 - base_max_hp);
  mp_cap := GREATEST(0, 60 - base_max_mp);
  hp_gain := GREATEST(0, LEAST(p_add_hp, hp_cap));
  mp_gain := GREATEST(0, LEAST(p_add_mp, mp_cap));
  max_hp_after := base_max_hp + hp_gain;
  max_mp_after := base_max_mp + mp_gain;
  lost_hp := GREATEST(0, max_hp_after - (base_cur_hp + hp_gain));
  recovered := CASE WHEN p_recover_pct > 0 THEN GREATEST(0, ceil(lost_hp * p_recover_pct)::int) ELSE 0 END;
  cur_hp_after := LEAST(max_hp_after, base_cur_hp + hp_gain + recovered);
  cur_mp_after := LEAST(max_mp_after, base_cur_mp + mp_gain);
  IF FOUND THEN
    UPDATE public.user_health_stats
       SET max_hp = max_hp_after, current_hp = cur_hp_after,
           max_mp = max_mp_after, current_mp = cur_mp_after
     WHERE user_id = p_uid;
  ELSE
    INSERT INTO public.user_health_stats (user_id, max_hp, current_hp, max_mp, current_mp, fatigue)
    VALUES (p_uid, max_hp_after, cur_hp_after, max_mp_after, cur_mp_after, v_fat);
  END IF;
END;
$function$;
INSERT INTO auth.users(id,email) VALUES
 ('cccccccc-cccc-cccc-cccc-cccccccccccc','audit-health@example.invalid');
INSERT INTO public.talentos_disponiveis(id,efeito) VALUES
 ('cccccccc-cccc-cccc-cccc-cccccccccccd','corpo_de_ferro');
INSERT INTO public.talentos_jogador(personagem_id,talento_id) VALUES
 ('cccccccc-cccc-cccc-cccc-cccccccccccc','cccccccc-cccc-cccc-cccc-cccccccccccd');
INSERT INTO public.missions(id,user_id,title,priority,frequency_type,days_of_week,mission_category)
VALUES ('cccccccc-cccc-cccc-cccc-ccccccccccce',
 'cccccccc-cccc-cccc-cccc-cccccccccccc','Physical','baixa','daily',
 '["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]','fisico');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='cccccccc-cccc-cccc-cccc-cccccccccccc';
SELECT public.complete_mission('cccccccc-cccc-cccc-cccc-ccccccccccce',
 (now() AT TIME ZONE 'America/Sao_Paulo')::date);
SELECT public.undo_mission('cccccccc-cccc-cccc-cccc-ccccccccccce',
 (now() AT TIME ZONE 'America/Sao_Paulo')::date);
RESET ROLE;
DO $audit$
DECLARE v_hp integer; v_xp integer;
BEGIN
  SELECT max_hp INTO v_hp FROM public.user_health_stats
    WHERE user_id='cccccccc-cccc-cccc-cccc-cccccccccccc';
  SELECT total_xp INTO v_xp FROM public.profiles
    WHERE user_id='cccccccc-cccc-cccc-cccc-cccccccccccc';
  RAISE NOTICE 'after undo max_hp=%, total_xp=%',v_hp,v_xp;
  IF v_hp<>100 OR v_xp<>0 THEN
    RAISE EXCEPTION 'AUDIT_HEALTH_EFFECT_REMAINS';
  END IF;
END;
$audit$;
ROLLBACK;
