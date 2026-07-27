-- Fecha missões por frequência somente depois do domingo, com graça,
-- protetor de streak e falha real sem penalidade de recursos.

ALTER TABLE public.mission_weekly_progress
  ADD COLUMN IF NOT EXISTS evaluation_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS evaluated_at timestamptz,
  ADD COLUMN IF NOT EXISTS target_snapshot integer,
  ADD COLUMN IF NOT EXISTS shortfall integer;

ALTER TABLE public.mission_weekly_progress
  DROP CONSTRAINT IF EXISTS mission_weekly_progress_evaluation_status_check,
  DROP CONSTRAINT IF EXISTS mission_weekly_progress_shortfall_check;

ALTER TABLE public.mission_weekly_progress
  ADD CONSTRAINT mission_weekly_progress_evaluation_status_check
    CHECK (evaluation_status IN (
      'pending', 'exempt', 'met', 'grace', 'protected',
      'failed', 'failed_accepted', 'recovered'
    )),
  ADD CONSTRAINT mission_weekly_progress_shortfall_check
    CHECK (shortfall IS NULL OR shortfall >= 0);

CREATE INDEX IF NOT EXISTS mission_weekly_progress_evaluation_idx
  ON public.mission_weekly_progress (user_id, evaluated_at, week_start);

CREATE OR REPLACE FUNCTION public._evaluate_weekly_missions(
  p_uid uuid,
  p_today date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_week date := p_today - (EXTRACT(isodow FROM p_today)::integer - 1);
  v_first_week date := v_current_week - 28;
  v_last_closed_week date := v_current_week - 7;
  v_week_start date;
  v_week_end date;
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
     AND mission.created_at::date <= weeks.week_start::date + 6
    ORDER BY weeks.week_start, mission.created_at, mission.id
  LOOP
    v_week_start := v_candidate.candidate_week_start;

    SELECT * INTO v_mission
    FROM public.missions mission
    WHERE mission.id = v_candidate.mission_id;

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

    IF v_mission.created_at::date > v_progress.week_start THEN
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
              daily_status = COALESCE(daily_status, '{}'::jsonb)
                || jsonb_build_object(v_week_end::text, 'failed_accepted')
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
      SET daily_status = COALESCE(daily_status, '{}'::jsonb)
        || jsonb_build_object(
          v_week_end::text,
          CASE WHEN v_status = 'failed_accepted'
            THEN 'failed_accepted'
            ELSE v_status
          END
        )
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

CREATE OR REPLACE FUNCTION public.check_weekly_mission_failures()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOT_AUTHENTICATED';
  END IF;

  RETURN public._evaluate_weekly_missions(v_uid, v_today);
END;
$$;

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
      daily_status = COALESCE(daily_status, '{}'::jsonb)
        || jsonb_build_object(
          v_week_end::text,
          CASE WHEN p_resolution = 'recovered'
            THEN 'completed'
            ELSE 'failed_accepted'
          END
        )
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

REVOKE ALL ON FUNCTION public._evaluate_weekly_missions(uuid, date)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.check_weekly_mission_failures()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_weekly_mission_failures()
  TO authenticated;

REVOKE ALL ON FUNCTION public.resolve_weekly_mission_failure(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_weekly_mission_failure(uuid, text)
  TO authenticated;

COMMENT ON COLUMN public.mission_weekly_progress.evaluation_status IS
  'Resultado do fechamento: pending, exempt, met, grace, protected, failed, failed_accepted ou recovered.';
