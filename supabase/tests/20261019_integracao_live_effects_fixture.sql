-- Reduced local fixture overlay for real derived-effect behavior.
-- Sources: read-only captures live-health-functions.json (observed 2026-10-19
-- 22:03 UTC) and live-talent-level-trigger.json. These function definitions
-- mirror pg_get_functiondef; this is not a full remote schema or a migration.
-- The live sync_health_on_profile_level_change function has no attached trigger
-- in live-health-triggers.json, so no health-on-level trigger is fabricated here.

ALTER TABLE public.user_health_stats
  ADD COLUMN max_mp integer DEFAULT 10,
  ADD COLUMN current_mp integer DEFAULT 10;
ALTER TABLE public.profiles ADD COLUMN pontos_talento integer DEFAULT 0;

CREATE OR REPLACE FUNCTION public._apply_mission_health_effects(p_uid uuid, p_recover_pct numeric, p_add_hp integer, p_add_mp integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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

CREATE OR REPLACE FUNCTION public._grant_flow_xp_buff(p_uid uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item uuid;
BEGIN
  SELECT id INTO v_item FROM public.shop_items WHERE effect = 'estado_fluxo_xp' LIMIT 1;
  IF v_item IS NULL THEN RETURN; END IF;
  INSERT INTO public.user_buffs (user_id, item_id, active, expires_at)
  VALUES (p_uid, v_item, true, now() + interval '48 hours');
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_talent_points_on_level_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  old_chunks integer;
  new_chunks integer;
  gain integer;
BEGIN
  old_chunks := floor(COALESCE(OLD.level, 1) / 5.0);
  new_chunks := floor(COALESCE(NEW.level, 1) / 5.0);
  gain := GREATEST(0, new_chunks - old_chunks);

  IF gain > 0 THEN
    NEW.pontos_talento := COALESCE(NEW.pontos_talento, 0) + gain;
  ELSE
    NEW.pontos_talento := COALESCE(NEW.pontos_talento, 0);
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER sync_talent_points_on_level_change_trigger
BEFORE UPDATE OF level ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_talent_points_on_level_change();
