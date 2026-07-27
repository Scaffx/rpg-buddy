-- A weekly mission starts being evaluated when it adopts the weekly format,
-- not when the underlying mission row was originally created.
ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS weekly_started_at timestamptz;

CREATE OR REPLACE FUNCTION public._set_mission_weekly_started_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.frequency_type = 'weekly' THEN
    IF TG_OP = 'INSERT' THEN
      -- Server-authoritative: clients cannot backdate a new weekly mission.
      NEW.weekly_started_at := statement_timestamp();
    ELSIF OLD.frequency_type IS DISTINCT FROM 'weekly' THEN
      -- A daily -> weekly conversion renegotiates the same habit. Preserve
      -- daily_status/streak, but start weekly evaluation at the conversion.
      NEW.weekly_started_at := statement_timestamp();
    ELSE
      -- Once weekly, clients cannot move the evaluation boundary backwards.
      NEW.weekly_started_at := COALESCE(
        OLD.weekly_started_at,
        NEW.weekly_started_at,
        NEW.created_at,
        now()
      );
    END IF;
  ELSE
    -- Converting back to daily clears the weekly boundary. A later conversion
    -- to weekly receives a fresh start timestamp.
    NEW.weekly_started_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public._set_mission_weekly_started_at()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS set_mission_weekly_started_at
  ON public.missions;

CREATE TRIGGER set_mission_weekly_started_at
BEFORE INSERT OR UPDATE OF frequency_type, weekly_started_at
ON public.missions
FOR EACH ROW
EXECUTE FUNCTION public._set_mission_weekly_started_at();

-- Existing weekly rows fall back to their original creation time. This is
-- deterministic and preserves the behavior for missions born weekly.
UPDATE public.missions
SET weekly_started_at = created_at
WHERE frequency_type = 'weekly'
  AND weekly_started_at IS NULL;

ALTER TABLE public.missions
  DROP CONSTRAINT IF EXISTS missions_weekly_started_at_coherence;

ALTER TABLE public.missions
  ADD CONSTRAINT missions_weekly_started_at_coherence CHECK (
    (frequency_type = 'weekly' AND weekly_started_at IS NOT NULL)
    OR
    (frequency_type = 'daily' AND weekly_started_at IS NULL)
  );

COMMENT ON COLUMN public.missions.weekly_started_at IS
  'When weekly evaluation begins. Set at weekly creation or daily-to-weekly conversion; daily history and streak are preserved.';

-- Only weeks on or after weekly_started_at are candidates. The first partial
-- week remains visible in history as exempt and never consumes grace/protectors.
CREATE OR REPLACE FUNCTION public._evaluate_weekly_missions(
  p_uid uuid,
  p_today date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
SET TimeZone TO 'America/Sao_Paulo'
AS $$
DECLARE
  v_current_week date := p_today - (EXTRACT(isodow FROM p_today)::integer - 1);
  v_first_week date := v_current_week - 28;
  v_last_closed_week date := v_current_week - 7;
  v_week_start date;
  v_week_end date;
  v_weekly_started_on date;
  v_candidate record;
  v_mission public.missions%ROWTYPE;
  v_progress public.mission_weekly_progress%ROWTYPE;
  v_previous_status text;
  v_status text;
  v_shortfall integer;
  v_max_slots integer;
  v_available_protectors integer;
  v_protector_week text;
  v_evaluated integer := 0;
  v_met integer := 0;
  v_exempt integer := 0;
  v_grace integer := 0;
  v_protected integer := 0;
  v_failed integer := 0;
BEGIN
  IF p_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOT_AUTHENTICATED';
  END IF;

  SELECT
    LEAST(3, GREATEST(1, COALESCE(profile.streak_protector_max, 3))),
    COALESCE(profile.streak_protector_charges, 2),
    profile.streak_protector_week
  INTO v_max_slots, v_available_protectors, v_protector_week
  FROM public.profiles profile
  WHERE profile.user_id = p_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PROFILE_NOT_FOUND';
  END IF;

  IF v_protector_week IS DISTINCT FROM v_current_week::text THEN
    v_available_protectors := LEAST(2, v_max_slots);
  ELSE
    v_available_protectors := LEAST(
      v_max_slots,
      GREATEST(0, v_available_protectors)
    );
  END IF;

  UPDATE public.profiles
  SET streak_protector_week = v_current_week::text,
      streak_protector_max = v_max_slots,
      streak_protector_charges = v_available_protectors
  WHERE user_id = p_uid;

  FOR v_candidate IN
    SELECT
      weeks.week_start::date AS candidate_week_start,
      mission.id AS mission_id
    FROM generate_series(
      v_first_week::timestamp,
      v_last_closed_week::timestamp,
      interval '7 days'
    ) AS weeks(week_start)
    JOIN public.missions mission
      ON mission.user_id = p_uid
     AND mission.frequency_type = 'weekly'
     AND NOT COALESCE(mission.completed, false)
     AND COALESCE(mission.status, '') <> 'arquivada'
     AND (
       COALESCE(mission.weekly_started_at, mission.created_at)
         AT TIME ZONE 'America/Sao_Paulo'
     )::date <= weeks.week_start::date + 6
    ORDER BY
      weeks.week_start,
      COALESCE(mission.weekly_started_at, mission.created_at),
      mission.id
  LOOP
    v_week_start := v_candidate.candidate_week_start;

    SELECT * INTO v_mission
    FROM public.missions mission
    WHERE mission.id = v_candidate.mission_id;

    v_weekly_started_on := (
      COALESCE(v_mission.weekly_started_at, v_mission.created_at)
        AT TIME ZONE 'America/Sao_Paulo'
    )::date;

    INSERT INTO public.mission_weekly_progress (
      mission_id,
      user_id,
      week_start
    ) VALUES (
      v_mission.id,
      p_uid,
      v_week_start
    )
    ON CONFLICT (mission_id, week_start) DO NOTHING;

    SELECT * INTO v_progress
    FROM public.mission_weekly_progress progress
    WHERE progress.mission_id = v_mission.id
      AND progress.week_start = v_week_start
    FOR UPDATE;

    IF v_progress.evaluated_at IS NOT NULL THEN
      CONTINUE;
    END IF;

    v_week_end := v_progress.week_start + 6;
    v_shortfall := GREATEST(
      0,
      COALESCE(v_mission.target_count, 1) - v_progress.current_count
    );

    IF v_weekly_started_on > v_progress.week_start THEN
      v_status := 'exempt';
      v_exempt := v_exempt + 1;
    ELSIF v_shortfall = 0 THEN
      v_status := 'met';
      v_met := v_met + 1;
    ELSE
      SELECT previous.evaluation_status
      INTO v_previous_status
      FROM public.mission_weekly_progress previous
      WHERE previous.mission_id = v_mission.id
        AND previous.week_start = v_progress.week_start - 7
        AND previous.evaluated_at IS NOT NULL;

      IF v_previous_status IS NULL
         OR v_previous_status IN ('exempt', 'met', 'recovered') THEN
        v_status := 'grace';
        v_grace := v_grace + 1;
      ELSIF v_available_protectors > 0 THEN
        v_status := 'protected';
        v_available_protectors := v_available_protectors - 1;
        v_protected := v_protected + 1;

        UPDATE public.profiles
        SET streak_protector_charges = v_available_protectors,
            streak_protector_week = v_current_week::text
        WHERE user_id = p_uid;
      ELSE
        v_status := CASE
          WHEN v_progress.week_start = v_last_closed_week THEN 'failed'
          ELSE 'failed_accepted'
        END;
        v_failed := v_failed + 1;

        UPDATE public.profiles
        SET streak_current_days = 0
        WHERE user_id = p_uid;

        IF v_status = 'failed' THEN
          UPDATE public.missions
          SET is_failed = true,
              failed_date = v_week_end,
              daily_status = CASE
                WHEN COALESCE(daily_status->>v_week_end::text, '') = 'completed'
                  THEN daily_status
                ELSE COALESCE(daily_status, '{}'::jsonb)
                  || jsonb_build_object(v_week_end::text, 'failed_accepted')
              END
          WHERE id = v_mission.id;
        END IF;
      END IF;
    END IF;

    UPDATE public.mission_weekly_progress
    SET evaluation_status = v_status,
        evaluated_at = now(),
        target_snapshot = COALESCE(v_mission.target_count, 1),
        shortfall = v_shortfall,
        updated_at = now()
    WHERE id = v_progress.id;

    IF v_status IN ('grace', 'protected', 'failed_accepted') THEN
      UPDATE public.missions
      SET daily_status = CASE
        WHEN COALESCE(daily_status->>v_week_end::text, '') = 'completed'
          THEN daily_status
        ELSE COALESCE(daily_status, '{}'::jsonb)
          || jsonb_build_object(
            v_week_end::text,
            CASE WHEN v_status = 'failed_accepted'
              THEN 'failed_accepted'
              ELSE v_status
            END
          )
      END
      WHERE id = v_mission.id;
    END IF;

    IF v_status <> 'exempt' THEN
      INSERT INTO public.activity_log (
        user_id,
        action,
        description,
        xp_gained
      ) VALUES (
        p_uid,
        CASE v_status
          WHEN 'met' THEN 'weekly_target_met'
          WHEN 'grace' THEN 'weekly_mission_grace'
          WHEN 'protected' THEN 'weekly_streak_protected'
          ELSE 'weekly_mission_failed'
        END,
        CASE v_status
          WHEN 'met' THEN 'Meta semanal concluída: ' || v_mission.title
          WHEN 'grace' THEN 'Primeira semana abaixo da meta em "' || v_mission.title || '" — graça aplicada.'
          WHEN 'protected' THEN 'Protetor de streak usado na meta semanal "' || v_mission.title || '". Cargas restantes: ' || v_available_protectors || '/' || v_max_slots
          ELSE 'Meta semanal não concluída: ' || v_mission.title || ' — sequência reiniciada.'
        END,
        0
      );
    END IF;

    v_evaluated := v_evaluated + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'evaluated', v_evaluated,
    'met', v_met,
    'exempt', v_exempt,
    'grace', v_grace,
    'protected', v_protected,
    'failed', v_failed,
    'protector_charges', v_available_protectors,
    'week_start', v_current_week
  );
END;
$$;

REVOKE ALL ON FUNCTION public._evaluate_weekly_missions(uuid, date)
  FROM PUBLIC, anon, authenticated;


-- Replaces the weekly dispatcher preserved by the weekend-bonus migration.
CREATE OR REPLACE FUNCTION public._complete_mission_with_weekly(p_mission_id uuid)
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
  v_weekly_started_on date;
  v_conversion_bridge_used boolean := false;
  v_prev date;
  v_d date;
  v_prior_streak integer := 0;
  v_new_streak integer := 0;
  v_streak_mult numeric := 1.0;
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

  v_weekly_started_on := (
    COALESCE(v_m.weekly_started_at, v_m.created_at)
      AT TIME ZONE 'America/Sao_Paulo'
  )::date;

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

  IF v_progress.last_completed_date = v_today
     OR COALESCE(v_m.daily_status->>v_today::text, '') = 'completed' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ALREADY_COMPLETED_TODAY';
  END IF;

  IF v_progress.current_count >= v_m.max_count THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'WEEKLY_CAP_REACHED';
  END IF;

  -- Preserve the emotional asset of the daily habit when its format changes.
  -- Weekly executions keep growing the same mission streak from daily_status.
  v_prev := NULL;
  FOR v_d IN
    SELECT (entry.key)::date AS completion_date
    FROM jsonb_each_text(COALESCE(v_m.daily_status, '{}'::jsonb)) entry
    WHERE entry.value = 'completed'
    ORDER BY (entry.key)::date DESC
  LOOP
    IF v_prev IS NULL THEN
      v_prior_streak := 1;
    ELSIF (v_prev - v_d) <= 2 THEN
      v_prior_streak := v_prior_streak + 1;
    ELSIF NOT v_conversion_bridge_used
       AND v_prev >= v_weekly_started_on
       AND v_d <= v_weekly_started_on THEN
      -- One format-change gap is bridged permanently by daily_status. This
      -- preserves the transferred streak without relaxing later weekly gaps.
      v_prior_streak := v_prior_streak + 1;
      v_conversion_bridge_used := true;
    ELSE
      EXIT;
    END IF;
    v_prev := v_d;
  END LOOP;
  v_new_streak := v_prior_streak + 1;

  v_streak_mult := CASE
    WHEN v_new_streak >= 21 THEN 1.75
    WHEN v_new_streak >= 14 THEN 1.5
    WHEN v_new_streak >= 7 THEN 1.3
    WHEN v_new_streak >= 3 THEN 1.1
    ELSE 1.0
  END;

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
      END)
    + (v_streak_mult - 1);
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

  UPDATE public.missions
     SET daily_status = COALESCE(daily_status, '{}'::jsonb)
       || jsonb_build_object(v_today::text, 'completed')
   WHERE id = v_m.id;

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
    'streak_days', v_new_streak,
    'streak_multiplier', v_streak_mult,
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

REVOKE ALL ON FUNCTION public._complete_mission_with_weekly(uuid)
  FROM PUBLIC, anon, authenticated;


-- Weekly resolution status lives in mission_weekly_progress. Never overwrite a
-- real Sunday execution kept in daily_status, even when failure is dismissed.
CREATE OR REPLACE FUNCTION public.resolve_weekly_mission_failure(
  p_mission_id uuid,
  p_resolution text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_mission public.missions%ROWTYPE;
  v_progress public.mission_weekly_progress%ROWTYPE;
  v_week_end date;
  v_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOT_AUTHENTICATED';
  END IF;

  IF p_resolution NOT IN ('recovered', 'dismissed') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_WEEKLY_RESOLUTION';
  END IF;

  SELECT * INTO v_mission
  FROM public.missions mission
  WHERE mission.id = p_mission_id
    AND mission.user_id = v_uid
    AND mission.frequency_type = 'weekly'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'WEEKLY_MISSION_NOT_FOUND';
  END IF;

  SELECT * INTO v_progress
  FROM public.mission_weekly_progress progress
  WHERE progress.mission_id = p_mission_id
    AND progress.evaluation_status = 'failed'
  ORDER BY progress.week_start DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'WEEKLY_FAILURE_NOT_FOUND';
  END IF;

  v_week_end := v_progress.week_start + 6;
  v_status := CASE
    WHEN p_resolution = 'recovered' THEN 'recovered'
    ELSE 'failed_accepted'
  END;

  UPDATE public.mission_weekly_progress
  SET evaluation_status = v_status,
      updated_at = now()
  WHERE id = v_progress.id;

  UPDATE public.missions
  SET is_failed = false,
      failed_date = NULL,
      daily_status = CASE
        WHEN COALESCE(daily_status->>v_week_end::text, '') = 'completed'
          THEN daily_status
        ELSE COALESCE(daily_status, '{}'::jsonb)
          || jsonb_build_object(
            v_week_end::text,
            CASE WHEN p_resolution = 'recovered'
              THEN 'completed'
              ELSE 'failed_accepted'
            END
          )
      END
  WHERE id = p_mission_id;

  INSERT INTO public.activity_log (
    user_id,
    action,
    description,
    xp_gained
  ) VALUES (
    v_uid,
    CASE WHEN p_resolution = 'recovered'
      THEN 'mission_failed_recovered'
      ELSE 'mission_dismissed'
    END,
    CASE WHEN p_resolution = 'recovered'
      THEN 'Recuperou meta semanal: ' || v_mission.title
      ELSE 'Dispensou meta semanal não concluída: ' || v_mission.title
    END,
    0
  );

  RETURN jsonb_build_object(
    'mission_id', p_mission_id,
    'week_start', v_progress.week_start,
    'resolution', p_resolution,
    'status', v_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_weekly_mission_failure(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_weekly_mission_failure(uuid, text)
  TO authenticated;
