-- Reduced local fixture overlay for real derived-effect behavior.
-- Sources: read-only captures live-health-functions.json (observed 2026-10-19
-- 22:03 UTC), live-perfect-day-functions.json, live-level-functions.json and
-- live-talent-level-trigger.json. These function definitions
-- mirror pg_get_functiondef; this is not a full remote schema or a migration.
-- The live sync_health_on_profile_level_change function has no attached trigger
-- in live-health-triggers.json, so no health-on-level trigger is fabricated here.
-- get_level_from_xp_v2 below comes from live-level-functions.json; the base
-- fixture's 100-XP step is intentionally replaced before composition replay.

-- The base fixture inherits PostgreSQL's default PUBLIC EXECUTE on these two
-- RPCs. The read-only Primary capture live-guard-function-metadata.json at
-- 2026-10-19 23:02:06 UTC instead has anon=false, authenticated=true. Reproduce
-- that observed authority before replay; do not relax the migration guard to
-- accept the fixture's broader default. Trusted service_role ACLs are not
-- modelled by this reduced fixture.
REVOKE EXECUTE ON FUNCTION public.complete_mission(uuid),
  public.undo_mission(uuid,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_mission(uuid),
  public.undo_mission(uuid,date) TO authenticated;

ALTER TABLE public.user_health_stats
  ADD COLUMN max_mp integer DEFAULT 10,
  ADD COLUMN current_mp integer DEFAULT 10;
ALTER TABLE public.profiles ADD COLUMN pontos_talento integer NOT NULL DEFAULT 0;
ALTER TABLE public.missions ADD COLUMN is_anchor boolean NOT NULL DEFAULT false;

-- Read policies are fixture grants for authenticated RPC assertions, not an
-- assertion that the complete remote RLS catalogue has been reproduced.
ALTER TABLE public.user_buffs ENABLE ROW LEVEL SECURITY;
CREATE POLICY integration_effect_buffs_own_select ON public.user_buffs
  FOR SELECT TO authenticated USING (user_id=auth.uid());
GRANT SELECT ON public.user_buffs TO authenticated;
ALTER TABLE public.user_health_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY integration_effect_health_own_select ON public.user_health_stats
  FOR SELECT TO authenticated USING (user_id=auth.uid());
GRANT SELECT ON public.user_health_stats TO authenticated;

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

CREATE OR REPLACE FUNCTION public.get_level_from_xp_v2(p_total_xp integer)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  xp_table int[] := ARRAY[
        0,    320,   1000,   2080,   3600,   5600,   8120,  11200,  14880,  19200,
    24200,  29920,  36400,  43680,  51800,  60800,  70720,  81600,  93480, 106400,
   120400, 135520, 151800, 169280, 188000, 208000, 229320, 252000, 276080, 301600,
   328600, 357120, 387200, 418880, 452200, 487200, 523920, 562400, 602680, 644800,
   688800, 734720, 782600, 832480, 884400, 938400, 994520,1052800,1113280,1176000,
  1241000,1308320,1378000,1450080,1524600,1601600,1681120,1763200,1847880,1935200
  ];
  v_xp int := GREATEST(0, COALESCE(p_total_xp, 0));
  i int;
BEGIN
  FOR i IN REVERSE array_length(xp_table, 1)..2 LOOP
    IF v_xp >= xp_table[i] THEN RETURN i; END IF;
  END LOOP;
  RETURN 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public._grant_inspiration_if_perfect_day(p_uid uuid, p_today date)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_days text[] := ARRAY['Dom','Seg','Ter','Qua','Qui','Sex','Sab'];
  v_today_short text := v_days[EXTRACT(DOW FROM p_today)::integer + 1];
  v_required integer := 0;
  v_done integer := 0;
  v_checklist_imperfect integer := 0;
  v_already boolean;
BEGIN
  WITH anchor_missions AS (
    SELECT
      m.id,
      CASE
        WHEN m.frequency_type = 'weekly' THEN true
        WHEN COALESCE(
          jsonb_array_length(COALESCE(m.days_of_week, '[]'::jsonb)),
          0
        ) > 0 THEN
          COALESCE(m.daily_status->>p_today::text, '') = 'completed'
        ELSE COALESCE(m.completed, false)
      END AS done
    FROM public.missions m
    LEFT JOIN public.mission_weekly_progress mwp
      ON mwp.mission_id = m.id
     AND mwp.week_start =
       p_today - (EXTRACT(isodow FROM p_today)::integer - 1)
    WHERE m.user_id = p_uid
      AND COALESCE(m.is_anchor, false)
      AND NOT COALESCE(m.is_failed, false)
      AND (
        (
          m.frequency_type = 'weekly'
          AND mwp.last_completed_date = p_today
          AND mwp.current_count <= m.target_count
        )
        OR
        (
          m.frequency_type = 'daily'
          AND COALESCE(
            jsonb_array_length(COALESCE(m.days_of_week, '[]'::jsonb)),
            0
          ) > 0
          AND m.days_of_week ? v_today_short
        )
        OR
        (
          m.frequency_type = 'daily'
          AND COALESCE(
            jsonb_array_length(COALESCE(m.days_of_week, '[]'::jsonb)),
            0
          ) = 0
          AND m.due_date = p_today
        )
      )
  )
  SELECT count(*), count(*) FILTER (WHERE done)
    INTO v_required, v_done
    FROM anchor_missions;

  IF v_required = 0 OR v_done < v_required THEN
    RETURN false;
  END IF;

  SELECT count(*)
    INTO v_checklist_imperfect
    FROM (
      SELECT ci.mission_id
        FROM public.checklist_items ci
        JOIN public.missions m ON m.id = ci.mission_id
        LEFT JOIN public.mission_weekly_progress mwp
          ON mwp.mission_id = m.id
         AND mwp.week_start =
           p_today - (EXTRACT(isodow FROM p_today)::integer - 1)
       WHERE m.user_id = p_uid
         AND COALESCE(m.is_anchor, false)
         AND NOT COALESCE(m.is_failed, false)
         AND (
           (
             m.frequency_type = 'weekly'
             AND mwp.last_completed_date = p_today
             AND mwp.current_count <= m.target_count
           )
           OR
           (
             m.frequency_type = 'daily'
             AND COALESCE(
               jsonb_array_length(COALESCE(m.days_of_week, '[]'::jsonb)),
               0
             ) > 0
             AND m.days_of_week ? v_today_short
           )
           OR
           (
             m.frequency_type = 'daily'
             AND COALESCE(
               jsonb_array_length(COALESCE(m.days_of_week, '[]'::jsonb)),
               0
             ) = 0
             AND m.due_date = p_today
           )
         )
       GROUP BY ci.mission_id
      HAVING count(*) <> count(*) FILTER (WHERE ci.completed)
    ) imperfect;

  IF v_checklist_imperfect > 0 THEN
    RETURN false;
  END IF;

  SELECT COALESCE(inspired_available, false)
    INTO v_already
    FROM public.profiles
   WHERE user_id = p_uid;

  IF v_already THEN
    RETURN false;
  END IF;

  UPDATE public.profiles
     SET inspired_available = true,
         inspired_earned_at = now()
   WHERE user_id = p_uid;

  INSERT INTO public.activity_log (
    user_id, action, description, xp_gained
  )
  VALUES (
    p_uid,
    'day_perfect_inspiration',
    'Dia Perfeito concluido! Voce ganhou Inspiracao para o proximo boss.',
    0
  );

  RETURN true;
END;
$function$;
