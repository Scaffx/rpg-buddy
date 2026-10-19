-- Fechamento semanal so alcanca semana ja fora da janela D-1.
--
-- Sintoma: meta 4x/semana, a pessoa fez as 4 mas nao registrou o domingo. Na
-- segunda o fechamento roda, grava evaluation_status = grace/protected e
-- shortfall = 1. Ela entao registra o domingo pela janela D-1: current_count
-- chega a 4/4, mas evaluated_at ja esta setado e ninguem reavalia -- o veredito
-- de falta fica gravado e, na semana seguinte, escala a proxima falha de
-- "graca" para "protetor/falha". Uma falha de registro virou falha de habito,
-- que e exatamente o que a janela existe para impedir.
--
-- Correcao: na segunda-feira o fechamento para na penultima semana. A semana
-- que acabou de terminar fecha na terca, quando seu ultimo dia (domingo) ja
-- saiu da janela de registro. Nada mais muda -- inclusive a idempotencia por
-- evaluated_at, que continua sendo o que impede reavaliacao.
--
-- Espelha, no servidor, a mesma regra que o checker diario segue no cliente
-- (src/hooks/useFailedMissions.tsx: PRIMEIRO_DIA_ADJUDICAVEL).

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
  -- A janela D-1 (REGRAS_DE_NEGOCIO §1.3) mantem o domingo registravel durante
  -- toda a segunda-feira. Fechar a semana nesse dia grava um veredito de falta
  -- que o registro retroativo nao desfaz -- e o veredito ainda escala a falha
  -- da semana seguinte, porque `previous.evaluation_status` le exatamente ele.
  -- Por isso a semana so fecha quando o ultimo dia dela sai da janela.
  v_last_closed_week date := CASE
    WHEN EXTRACT(isodow FROM p_today)::integer = 1 THEN v_current_week - 14
    ELSE v_current_week - 7
  END;
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
