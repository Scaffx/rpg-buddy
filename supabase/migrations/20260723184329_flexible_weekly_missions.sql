-- Flexible weekly missions with server-authoritative rewards.
-- The public RPC accepts only mission_id. Date, hour, counters and multipliers
-- are always resolved by Postgres in America/Sao_Paulo.

CREATE TABLE IF NOT EXISTS public.missions_backup_flexspec
AS TABLE public.missions WITH DATA;

ALTER TABLE public.missions_backup_flexspec ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.missions_backup_flexspec FROM PUBLIC, anon, authenticated;

ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS anchor text,
  ADD COLUMN IF NOT EXISTS is_anchor boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS frequency_type text NOT NULL DEFAULT 'daily',
  ADD COLUMN IF NOT EXISTS target_count integer,
  ADD COLUMN IF NOT EXISTS max_count integer;

ALTER TABLE public.missions
  DROP CONSTRAINT IF EXISTS missions_frequency_type_check,
  DROP CONSTRAINT IF EXISTS missions_target_count_check,
  DROP CONSTRAINT IF EXISTS missions_max_count_check,
  DROP CONSTRAINT IF EXISTS weekly_counts_coherence;

ALTER TABLE public.missions
  ADD CONSTRAINT missions_frequency_type_check
    CHECK (frequency_type IN ('daily', 'weekly')),
  ADD CONSTRAINT missions_target_count_check
    CHECK (target_count BETWEEN 1 AND 6),
  ADD CONSTRAINT missions_max_count_check
    CHECK (max_count BETWEEN 1 AND 7),
  ADD CONSTRAINT weekly_counts_coherence CHECK (
    (frequency_type = 'daily' AND target_count IS NULL AND max_count IS NULL)
    OR
    (frequency_type = 'weekly'
      AND target_count IS NOT NULL
      AND max_count IS NOT NULL
      AND target_count <= max_count)
  );

CREATE TABLE public.mission_weekly_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  current_count integer NOT NULL DEFAULT 0 CHECK (current_count BETWEEN 0 AND 7),
  milestone_paid boolean NOT NULL DEFAULT false,
  last_completed_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mission_id, week_start)
);

CREATE INDEX mission_weekly_progress_user_week_idx
  ON public.mission_weekly_progress (user_id, week_start);

ALTER TABLE public.mission_weekly_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own weekly mission progress"
  ON public.mission_weekly_progress
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.mission_weekly_progress FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.mission_weekly_progress FROM authenticated;
GRANT SELECT ON TABLE public.mission_weekly_progress TO authenticated;

-- Preserve the locked daily implementation without exposing the old
-- client-authoritative date/hour signature.
ALTER FUNCTION public.complete_mission(uuid, date, integer)
  RENAME TO _complete_mission_daily;

REVOKE EXECUTE ON FUNCTION public._complete_mission_daily(uuid, date, integer)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.complete_mission(p_mission_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_local_now timestamp := now() AT TIME ZONE 'America/Sao_Paulo';
  v_today date;
  v_hour integer;
  v_week_start date;
  v_m public.missions%ROWTYPE;
  v_progress public.mission_weekly_progress%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_primary_name text;
  v_effects text[];
  v_talents text[];
  v_category text;
  v_level integer;
  v_level_mult numeric;
  v_buff_bonus numeric := 0;
  v_xp_mult numeric;
  v_base_xp integer;
  v_checklist_done integer := 0;
  v_checklist_xp integer := 0;
  v_execution_xp integer;
  v_milestone_xp integer := 0;
  v_total_xp_reward integer;
  v_gold integer := 2;
  v_execution_gold integer;
  v_milestone_gold integer := 0;
  v_total_gold integer;
  v_gold_mult numeric := 1.0;
  v_doubled_caos boolean := false;
  v_recover_hp_pct numeric := 0;
  v_add_hp integer := 0;
  v_add_mp integer := 0;
  v_grant_flow boolean := false;
  v_grant_inspired boolean := false;
  v_current_count integer;
  v_next_weekly_count integer;
  v_is_overflow boolean;
  v_milestone_reached boolean;
  v_origin text;
  v_prev_count integer;
  v_next_count integer;
  v_gained_keys integer;
  v_attr_xp integer;
  v_sec uuid;
  v_new_total_xp integer;
  v_new_level integer;
  v_inspired_granted boolean := false;
  v_rng numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOT_AUTHENTICATED';
  END IF;

  v_today := v_local_now::date;
  v_hour := EXTRACT(hour FROM v_local_now)::integer;
  v_week_start := v_today - (EXTRACT(isodow FROM v_today)::integer - 1);

  SELECT *
    INTO v_m
    FROM public.missions
   WHERE id = p_mission_id
     AND user_id = v_uid
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MISSION_NOT_FOUND';
  END IF;

  IF v_m.frequency_type <> 'weekly' THEN
    RETURN public._complete_mission_daily(p_mission_id, v_today, v_hour);
  END IF;

  IF v_m.target_count IS NULL
     OR v_m.max_count IS NULL
     OR v_m.target_count < 1
     OR v_m.target_count > 6
     OR v_m.max_count < v_m.target_count
     OR v_m.max_count > 7 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_WEEKLY_CONFIGURATION';
  END IF;

  -- One row per week preserves history. Creating the current week's row is
  -- the lazy reset: no cron and no quota carry-over are required.
  INSERT INTO public.mission_weekly_progress (
    mission_id, user_id, week_start
  )
  VALUES (
    v_m.id, v_uid, v_week_start
  )
  ON CONFLICT (mission_id, week_start) DO NOTHING;

  SELECT *
    INTO v_progress
    FROM public.mission_weekly_progress
   WHERE mission_id = v_m.id
     AND week_start = v_week_start
   FOR UPDATE;

  IF v_progress.last_completed_date = v_today THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ALREADY_COMPLETED_TODAY';
  END IF;

  IF v_progress.current_count >= v_m.max_count THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'WEEKLY_CAP_REACHED';
  END IF;

  v_current_count := v_progress.current_count;
  v_next_weekly_count := v_current_count + 1;
  v_is_overflow := v_next_weekly_count > v_m.target_count;
  v_milestone_reached :=
    v_next_weekly_count = v_m.target_count
    AND NOT v_progress.milestone_paid;
  v_origin := CASE
    WHEN v_is_overflow THEN 'weekly_overflow'
    ELSE 'weekly_regular'
  END;

  -- Lock the profile too: simultaneous completions of different missions must
  -- not race missions_completed, boss keys or the user's total XP.
  SELECT *
    INTO v_profile
    FROM public.profiles
   WHERE user_id = v_uid
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PROFILE_NOT_FOUND';
  END IF;

  v_level := GREATEST(1, COALESCE(v_profile.level, 1));
  SELECT name INTO v_primary_name
    FROM public.attributes
   WHERE id = v_m.attribute_id;

  SELECT COALESCE(array_agg(si.effect), '{}')
    INTO v_effects
    FROM public.user_buffs ub
    JOIN public.shop_items si ON si.id = ub.item_id
   WHERE ub.user_id = v_uid
     AND ub.active = true
     AND (ub.expires_at IS NULL OR ub.expires_at > now());

  SELECT COALESCE(array_agg(td.efeito), '{}')
    INTO v_talents
    FROM public.talentos_jogador tj
    JOIN public.talentos_disponiveis td ON td.id = tj.talento_id
   WHERE tj.personagem_id = v_uid;

  v_category := public._derive_mission_category(
    v_m.mission_category,
    v_primary_name,
    v_m.title,
    v_m.description
  );

  v_level_mult := LEAST(3.5, 1 + floor((v_level - 1) / 5.0) * 0.5);
  v_buff_bonus :=
      (CASE
        WHEN 'xp_boost' = ANY(v_effects)
          OR 'foco_profundo' = ANY(v_effects)
        THEN 0.5 ELSE 0
      END)
    + (CASE WHEN 'estado_fluxo_xp' = ANY(v_effects) THEN 0.2 ELSE 0 END)
    + (CASE
        WHEN 'madrugador' = ANY(v_talents) AND v_hour < 8
        THEN 0.15 ELSE 0
      END);
  v_xp_mult := v_level_mult * (1 + v_buff_bonus);
  v_base_xp := round(COALESCE(v_m.xp_reward, 0) * v_xp_mult);

  v_rng := random();
  IF v_category = 'fisico' AND 'pulmoes_de_aco' = ANY(v_talents) THEN
    v_recover_hp_pct := 0.1;
  END IF;
  IF v_category = 'casa'
     AND 'ordem_no_caos' = ANY(v_talents)
     AND v_rng < 0.2 THEN
    v_gold_mult := v_gold_mult * 2;
    v_doubled_caos := true;
  END IF;
  IF v_category = 'criativo' AND 'estado_de_fluxo' = ANY(v_talents) THEN
    v_grant_flow := true;
  END IF;
  IF v_category = 'social' AND 'presenca_inspiradora' = ANY(v_talents) THEN
    v_grant_inspired := true;
  END IF;
  IF v_category = 'ar_livre' AND 'fotossintese' = ANY(v_talents) THEN
    v_gold_mult := v_gold_mult * 2;
  END IF;
  IF v_category = 'estudo' AND 'rato_biblioteca' = ANY(v_talents) THEN
    v_add_mp := 1;
  END IF;
  IF v_category = 'fisico' AND 'corpo_de_ferro' = ANY(v_talents) THEN
    v_add_hp := 2;
  END IF;

  SELECT
    count(*) FILTER (WHERE completed),
    COALESCE(sum(COALESCE(xp_bonus, 2)) FILTER (WHERE completed), 0)
    INTO v_checklist_done, v_checklist_xp
    FROM public.checklist_items
   WHERE mission_id = p_mission_id;

  v_gold := GREATEST(
    0,
    round(
      (v_gold + LEAST(3, floor(v_checklist_done / 3.0)::integer))
      * v_gold_mult
    )::integer
  );

  v_execution_xp := CASE
    WHEN v_m.npc_id IS NOT NULL THEN 0
    WHEN v_is_overflow THEN round((v_base_xp + v_checklist_xp) * 0.5)
    ELSE v_base_xp + v_checklist_xp
  END;
  v_milestone_xp := CASE
    WHEN v_m.npc_id IS NOT NULL THEN 0
    WHEN v_milestone_reached THEN round((v_base_xp + v_checklist_xp) * 0.5)
    ELSE 0
  END;
  v_total_xp_reward := v_execution_xp + v_milestone_xp;

  -- Overflow keeps full gold. The milestone adds 50% of one regular reward.
  v_execution_gold := v_gold;
  v_milestone_gold := CASE
    WHEN v_milestone_reached THEN round(v_gold * 0.5)
    ELSE 0
  END;
  v_total_gold := v_execution_gold + v_milestone_gold;

  UPDATE public.mission_weekly_progress
     SET current_count = v_next_weekly_count,
         milestone_paid = milestone_paid OR v_milestone_reached,
         last_completed_date = v_today,
         updated_at = now()
   WHERE id = v_progress.id;

  v_prev_count := COALESCE(v_profile.missions_completed, 0);
  v_next_count := v_prev_count + 1;
  v_gained_keys := GREATEST(
    0,
    (v_next_count / 5) - (v_prev_count / 5)
  );

  IF v_m.attribute_id IS NOT NULL THEN
    SELECT xp INTO v_attr_xp
      FROM public.attributes
     WHERE id = v_m.attribute_id
       AND user_id = v_uid
     FOR UPDATE;

    IF FOUND THEN
      UPDATE public.attributes
         SET xp = v_attr_xp + v_total_xp_reward,
             level = public.get_level_from_xp_v2(
               v_attr_xp + v_total_xp_reward
             )
       WHERE id = v_m.attribute_id
         AND user_id = v_uid;
    END IF;
  END IF;

  IF v_m.secondary_attribute_ids IS NOT NULL THEN
    FOR v_sec IN
      SELECT (jsonb_array_elements_text(v_m.secondary_attribute_ids))::uuid
    LOOP
      UPDATE public.attributes
         SET xp = xp + 12,
             level = public.get_level_from_xp_v2(xp + 12)
       WHERE id = v_sec
         AND user_id = v_uid;
    END LOOP;
  END IF;

  v_new_total_xp := COALESCE(v_profile.total_xp, 0) + v_total_xp_reward;
  v_new_level := GREATEST(
    public.get_level_from_xp_v2(v_new_total_xp),
    COALESCE(v_profile.level, 1)
  );

  UPDATE public.profiles
     SET total_xp = v_new_total_xp,
         xp_today = COALESCE(xp_today, 0) + v_total_xp_reward,
         missions_completed = v_next_count,
         level = v_new_level,
         boss_keys = COALESCE(boss_keys, 0) + v_gained_keys
   WHERE user_id = v_uid;

  IF v_gained_keys > 0 THEN
    INSERT INTO public.activity_log (
      user_id, action, description, xp_gained
    )
    VALUES (
      v_uid,
      'boss_key_earned',
      'Voce ganhou ' || v_gained_keys
        || ' chave(s) de boss por completar 5 missoes.',
      0
    );
  END IF;

  INSERT INTO public.activity_log (
    user_id, action, description, xp_gained
  )
  VALUES (
    v_uid,
    v_origin,
    'Missao semanal concluida! +'
      || v_execution_xp || ' XP +'
      || v_execution_gold || ' Ouro',
    v_execution_xp
  );

  INSERT INTO public.xp_history (user_id, xp_gained, type)
  VALUES (v_uid, v_execution_xp, v_origin);

  IF v_milestone_reached THEN
    INSERT INTO public.activity_log (
      user_id, action, description, xp_gained
    )
    VALUES (
      v_uid,
      'weekly_milestone',
      'Meta semanal atingida! +'
        || v_milestone_xp || ' XP +'
        || v_milestone_gold || ' Ouro',
      v_milestone_xp
    );

    INSERT INTO public.xp_history (user_id, xp_gained, type)
    VALUES (v_uid, v_milestone_xp, 'weekly_milestone');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_balance WHERE user_id = v_uid
  ) THEN
    UPDATE public.user_balance
       SET gold = COALESCE(gold, 0) + v_total_gold,
           updated_at = now()
     WHERE user_id = v_uid;
  ELSE
    INSERT INTO public.user_balance (user_id, balance_percent, gold)
    VALUES (v_uid, 100, 100 + v_total_gold);
  END IF;

  INSERT INTO public.gold_history (user_id, type, amount, reason)
  VALUES (
    v_uid,
    v_origin,
    v_execution_gold,
    'Recompensa semanal: ' || COALESCE(v_m.title, 'Missao')
  );

  IF v_milestone_reached THEN
    INSERT INTO public.gold_history (user_id, type, amount, reason)
    VALUES (
      v_uid,
      'weekly_milestone',
      v_milestone_gold,
      'Bonus da meta semanal: ' || COALESCE(v_m.title, 'Missao')
    );
  END IF;

  IF v_recover_hp_pct > 0 OR v_add_hp > 0 OR v_add_mp > 0 THEN
    PERFORM public._apply_mission_health_effects(
      v_uid, v_recover_hp_pct, v_add_hp, v_add_mp
    );
  END IF;

  IF v_grant_inspired THEN
    UPDATE public.profiles
       SET inspired_available = true,
           inspired_earned_at = now()
     WHERE user_id = v_uid;
  END IF;

  IF v_grant_flow THEN
    PERFORM public._grant_flow_xp_buff(v_uid);
  END IF;

  IF 'estado_fluxo_xp' = ANY(v_effects) THEN
    UPDATE public.user_buffs ub
       SET active = false
     WHERE ub.id = (
       SELECT ub2.id
         FROM public.user_buffs ub2
         JOIN public.shop_items si2 ON si2.id = ub2.item_id
        WHERE ub2.user_id = v_uid
          AND ub2.active = true
          AND (ub2.expires_at IS NULL OR ub2.expires_at > now())
          AND si2.effect = 'estado_fluxo_xp'
        ORDER BY ub2.purchased_at ASC
        LIMIT 1
     );
  END IF;

  v_inspired_granted :=
    public._grant_inspiration_if_perfect_day(v_uid, v_today);

  RETURN jsonb_build_object(
    'success', true,
    'frequency_type', 'weekly',
    'xp_gained', v_total_xp_reward,
    'execution_xp', v_execution_xp,
    'milestone_xp', v_milestone_xp,
    'gold_gained', v_total_gold,
    'execution_gold', v_execution_gold,
    'milestone_gold', v_milestone_gold,
    'gained_keys', v_gained_keys,
    'streak_days', 0,
    'streak_multiplier', 1.0,
    'inspired_granted', v_inspired_granted,
    'doubled_by_order_no_caos', v_doubled_caos,
    'weekly_count', v_next_weekly_count,
    'weekly_target', v_m.target_count,
    'weekly_max', v_m.max_count,
    'is_overflow', v_is_overflow,
    'milestone_reached', v_milestone_reached,
    'week_start', v_week_start
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.complete_mission(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_mission(uuid) TO authenticated;

-- Weekly anchors are optional on a given day. A regular weekly execution is
-- eligible on the day it occurs; overflow never enters the anchor set.
CREATE OR REPLACE FUNCTION public._grant_inspiration_if_perfect_day(
  p_uid uuid,
  p_today date
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

REVOKE EXECUTE ON FUNCTION public._grant_inspiration_if_perfect_day(uuid, date)
  FROM PUBLIC, anon, authenticated;

COMMENT ON COLUMN public.missions.frequency_type IS
  'daily keeps the existing recurring/one-shot behavior; weekly uses target_count/max_count.';
COMMENT ON TABLE public.mission_weekly_progress IS
  'Server-written weekly mission progress. One historical row per mission and São Paulo week.';
