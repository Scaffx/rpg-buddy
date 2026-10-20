-- Attribute award receipts on top of A4. Existing completion math stays in the
-- 193625 helpers; the RPC validates mission metadata before dispatch and seals
-- the actual attribute deltas after dispatch, under the per-user advisory lock.
-- Historical completions have no attribute receipt and cannot be undone safely.

DO $source_guard$
BEGIN
  IF to_regprocedure('public.complete_mission(uuid,date)') IS NULL
     OR to_regprocedure('public.undo_mission(uuid,date)') IS NULL
     OR md5(convert_to(replace(pg_get_functiondef(
       'public.complete_mission(uuid,date)'::regprocedure), chr(13), ''), 'UTF8'))
       <> '77420cd8f9a8fc2810208d7fac4596fe'
     OR md5(convert_to(replace(pg_get_functiondef(
       'public.undo_mission(uuid,date)'::regprocedure), chr(13), ''), 'UTF8'))
       <> 'fe64e4bc1475be4ffef8c09bc37e8ef3'
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'ATTRIBUTE_RECEIPT_SOURCE_DRIFT: reconcile completion and undo before applying';
  END IF;
END;
$source_guard$;

CREATE TABLE private.mission_attribute_receipts (
  mission_id uuid NOT NULL,
  completion_date date NOT NULL,
  user_id uuid NOT NULL,
  award_count smallint NOT NULL CHECK (award_count BETWEEN 0 AND 3),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mission_id, completion_date)
);
CREATE TABLE private.mission_attribute_awards (
  mission_id uuid NOT NULL,
  completion_date date NOT NULL,
  attribute_id uuid NOT NULL,
  user_id uuid NOT NULL,
  xp_delta integer NOT NULL CHECK (xp_delta >= 0),
  PRIMARY KEY (mission_id, completion_date, attribute_id),
  FOREIGN KEY (mission_id, completion_date)
    REFERENCES private.mission_attribute_receipts(mission_id, completion_date)
    ON DELETE CASCADE
);
-- The weekly milestone can outlive the particular execution that earned it:
-- an overflow undo removes execution XP but keeps the paid milestone.
CREATE TABLE private.mission_attribute_milestones (
  mission_id uuid NOT NULL,
  week_start date NOT NULL,
  user_id uuid NOT NULL,
  awarded_on date NOT NULL,
  attribute_id uuid,
  xp_delta integer NOT NULL CHECK (xp_delta >= 0),
  PRIMARY KEY (mission_id, week_start),
  CHECK ((attribute_id IS NULL AND xp_delta = 0) OR attribute_id IS NOT NULL)
);
ALTER TABLE private.mission_attribute_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.mission_attribute_awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.mission_attribute_milestones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.mission_attribute_receipts,
  private.mission_attribute_awards,
  private.mission_attribute_milestones FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.undo_mission_attribute_awards(
  p_mission_id uuid, p_date date, p_uid uuid,
  p_revoke_milestone boolean, p_week_start date
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $attribute_undo$
DECLARE
  v_count integer;
  v_expected integer;
  v_milestone_count integer;
  v_debit record;
  v_current_xp integer;
BEGIN
  SELECT award_count INTO v_expected
    FROM private.mission_attribute_receipts
   WHERE mission_id = p_mission_id AND completion_date = p_date
     AND user_id = p_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'ATTRIBUTE_AWARD_RECEIPT_MISSING: conclusao antiga requer conciliacao antes do desfazer';
  END IF;
  SELECT count(*) INTO v_count FROM private.mission_attribute_awards
   WHERE mission_id = p_mission_id AND completion_date = p_date
     AND user_id = p_uid;
  IF v_count <> v_expected THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTRIBUTE_AWARD_RECEIPT_INCOMPLETE';
  END IF;
  IF p_revoke_milestone THEN
    SELECT count(*) INTO v_milestone_count
      FROM private.mission_attribute_milestones
     WHERE mission_id = p_mission_id AND week_start = p_week_start
       AND user_id = p_uid;
    IF v_milestone_count <> 1 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTRIBUTE_MILESTONE_RECEIPT_MISSING';
    END IF;
  END IF;

  FOR v_debit IN
    SELECT award.attribute_id, sum(award.xp_delta)::integer AS amount
      FROM (
        SELECT attribute_id, xp_delta
          FROM private.mission_attribute_awards
         WHERE mission_id = p_mission_id AND completion_date = p_date
           AND user_id = p_uid
        UNION ALL
        SELECT attribute_id, xp_delta
          FROM private.mission_attribute_milestones
         WHERE p_revoke_milestone AND mission_id = p_mission_id
           AND week_start = p_week_start AND user_id = p_uid
           AND attribute_id IS NOT NULL
      ) award
     GROUP BY award.attribute_id ORDER BY award.attribute_id
  LOOP
    SELECT xp INTO v_current_xp FROM public.attributes
     WHERE id = v_debit.attribute_id AND user_id = p_uid FOR UPDATE;
    IF NOT FOUND OR v_current_xp < v_debit.amount THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTRIBUTE_AWARD_BALANCE_INSUFFICIENT';
    END IF;
    UPDATE public.attributes
       SET xp = v_current_xp - v_debit.amount,
           level = public.get_level_from_xp_v2(v_current_xp - v_debit.amount)
     WHERE id = v_debit.attribute_id AND user_id = p_uid;
  END LOOP;
  DELETE FROM private.mission_attribute_receipts
   WHERE mission_id = p_mission_id AND completion_date = p_date
     AND user_id = p_uid;
  IF p_revoke_milestone THEN
    DELETE FROM private.mission_attribute_milestones
     WHERE mission_id = p_mission_id AND week_start = p_week_start
       AND user_id = p_uid;
  END IF;
END;
$attribute_undo$;
REVOKE ALL ON FUNCTION private.undo_mission_attribute_awards(uuid,date,uuid,boolean,date)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.complete_mission(
  p_mission_id uuid, p_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $completion$
DECLARE
  v_uid uuid := auth.uid();
  v_server_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_target date := COALESCE(p_date, v_server_today);
  v_m public.missions%ROWTYPE;
  v_result jsonb;
  v_rows integer;
  v_unique boolean;
  v_attribute_ids uuid[] := '{}'::uuid[];
  v_element jsonb;
  v_attribute_id uuid;
  v_attribute record;
  v_before jsonb := '{}'::jsonb;
  v_actual integer;
  v_expected integer;
  v_execution_xp integer;
  v_milestone_xp integer := 0;
  v_week_start date;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOT_AUTHENTICATED';
  END IF;
  IF v_target > v_server_today OR v_target < v_server_today - 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DATE_OUT_OF_WINDOW';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(v_uid::text), 20261019
  );

  SELECT * INTO v_m FROM public.missions
   WHERE id = p_mission_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MISSION_NOT_FOUND';
  END IF;
  IF COALESCE(v_m.status, '') NOT IN ('pendente', 'em_progresso', 'em_andamento')
     OR v_m.completed IS DISTINCT FROM false
     OR COALESCE(v_m.is_failed, false) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MISSION_NOT_ACTIVE';
  END IF;
  IF private.mission_priority_occurs_on(v_m, v_target) IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MISSION_NOT_SCHEDULED';
  END IF;

  IF v_m.attribute_id IS NOT NULL THEN
    v_attribute_ids := array_append(v_attribute_ids, v_m.attribute_id);
  END IF;
  IF v_m.secondary_attribute_ids IS NOT NULL THEN
    IF jsonb_typeof(v_m.secondary_attribute_ids) <> 'array'
       OR jsonb_array_length(v_m.secondary_attribute_ids) > 2 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_SECONDARY_ATTRIBUTES: expected at most two IDs';
    END IF;
    FOR v_element IN SELECT value FROM jsonb_array_elements(v_m.secondary_attribute_ids)
    LOOP
      IF jsonb_typeof(v_element) <> 'string' THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_SECONDARY_ATTRIBUTES: expected UUID strings';
      END IF;
      BEGIN
        v_attribute_id := (v_element #>> '{}')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_SECONDARY_ATTRIBUTES: invalid UUID';
      END;
      IF v_attribute_id = ANY(v_attribute_ids) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_SECONDARY_ATTRIBUTES: duplicate or primary ID';
      END IF;
      v_attribute_ids := array_append(v_attribute_ids, v_attribute_id);
    END LOOP;
  END IF;
  -- Lock every intended attribute before the existing helper changes XP.
  FOR v_attribute IN
    SELECT id, xp FROM public.attributes
     WHERE user_id = v_uid AND id = ANY(v_attribute_ids)
     ORDER BY id FOR UPDATE
  LOOP
    v_before := v_before || jsonb_build_object(v_attribute.id::text, v_attribute.xp);
  END LOOP;
  IF (SELECT count(*) FROM jsonb_object_keys(v_before)) <> cardinality(v_attribute_ids) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTRIBUTE_NOT_OWNED_OR_MISSING';
  END IF;

  v_unique := COALESCE(v_m.frequency_type, 'daily') <> 'weekly'
    AND jsonb_array_length(COALESCE(v_m.days_of_week, '[]'::jsonb)) = 0;

  v_result := public._complete_mission_with_weekly(p_mission_id, v_target);

  IF COALESCE(v_m.frequency_type, 'daily') = 'weekly' THEN
    UPDATE public.mission_daily_completions
       SET credited_total_verified = true, completion_kind = 'weekly'
     WHERE mission_id = p_mission_id AND completion_date = v_target
       AND user_id = v_uid AND weekly_week_start IS NOT NULL
       AND xp_earned = (v_result->>'execution_xp')::integer
       AND gold_earned = (v_result->>'execution_gold')::integer;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'Weekly completion ledger missing or duplicated';
    END IF;
  ELSE
    IF v_unique THEN
      INSERT INTO public.mission_daily_completions (
        mission_id, completion_date, xp_earned, gold_earned, user_id,
        credited_total_verified, completion_kind
      ) VALUES (
        p_mission_id, v_target, (v_result->>'xp_gained')::integer,
        (v_result->>'gold_gained')::integer, v_uid, true, 'unique'
      );
    ELSE
      UPDATE public.mission_daily_completions
         SET xp_earned = (v_result->>'xp_gained')::integer,
             gold_earned = (v_result->>'gold_gained')::integer,
             credited_total_verified = true,
             completion_kind = 'daily'
       WHERE mission_id = p_mission_id AND completion_date = v_target
         AND user_id = v_uid;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows <> 1 THEN
        RAISE EXCEPTION 'Completion ledger missing or duplicated';
      END IF;
    END IF;
  END IF;

  v_milestone_xp := CASE WHEN COALESCE(v_m.frequency_type, 'daily') = 'weekly'
    THEN COALESCE((v_result->>'milestone_xp')::integer, 0) ELSE 0 END;
  v_execution_xp := CASE WHEN COALESCE(v_m.frequency_type, 'daily') = 'weekly'
    THEN (v_result->>'execution_xp')::integer
    ELSE (v_result->>'xp_gained')::integer END;
  IF v_execution_xp IS NULL OR v_execution_xp < 0 OR v_milestone_xp < 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTRIBUTE_AWARD_RESULT_INVALID';
  END IF;
  v_week_start := v_target - (EXTRACT(isodow FROM v_target)::integer - 1);
  INSERT INTO private.mission_attribute_receipts
    (mission_id, completion_date, user_id, award_count)
  VALUES (p_mission_id, v_target, v_uid, cardinality(v_attribute_ids));
  FOR v_attribute IN
    SELECT id, xp FROM public.attributes
     WHERE user_id = v_uid AND id = ANY(v_attribute_ids) ORDER BY id
  LOOP
    v_actual := v_attribute.xp - (v_before->>v_attribute.id::text)::integer;
    v_expected := CASE WHEN v_attribute.id = v_m.attribute_id
      THEN v_execution_xp + v_milestone_xp ELSE 12 END;
    IF v_actual <> v_expected THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTRIBUTE_AWARD_DELTA_MISMATCH';
    END IF;
    INSERT INTO private.mission_attribute_awards
      (mission_id, completion_date, attribute_id, user_id, xp_delta)
    VALUES (p_mission_id, v_target, v_attribute.id, v_uid,
      CASE WHEN v_attribute.id = v_m.attribute_id THEN v_execution_xp ELSE 12 END);
  END LOOP;
  IF COALESCE(v_m.frequency_type, 'daily') = 'weekly'
     AND COALESCE((v_result->>'milestone_reached')::boolean, false) THEN
    INSERT INTO private.mission_attribute_milestones
      (mission_id, week_start, user_id, awarded_on, attribute_id, xp_delta)
    VALUES (p_mission_id, v_week_start, v_uid, v_target, v_m.attribute_id,
      CASE WHEN v_m.attribute_id IS NULL THEN 0 ELSE v_milestone_xp END);
  END IF;

  RETURN v_result || jsonb_build_object(
    'frequency_type', CASE WHEN v_unique THEN 'unique'
      ELSE COALESCE(v_result->>'frequency_type', 'daily') END,
    'weekend_bonus', COALESCE((v_result->>'weekend_bonus')::boolean, false),
    'completed_date', v_target,
    'is_backfill', v_target < v_server_today
  );
END;
$completion$;

REVOKE ALL ON FUNCTION public.complete_mission(uuid, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_mission(uuid, date)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.undo_mission(p_mission_id uuid, p_today date)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $undo$
DECLARE
  v_uid uuid := auth.uid();
  v_server_date date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_m public.missions%ROWTYPE;
  v_xp int; v_gold int;
  v_row_found boolean := false;
  v_ledger_verified boolean := false;
  v_completion_kind text;
  v_ledger_rows integer;
  v_is_unique boolean := false;
  v_profile public.profiles%ROWTYPE;
  v_balance_gold integer;
  v_new_total int; v_new_count int; v_keys_remove int;
  v_status jsonb;
  v_is_weekly boolean := false;
  v_has_progress boolean := false;
  v_weekly_started_on date;
  v_week_start date;
  v_completion_week date;
  v_progress public.mission_weekly_progress%ROWTYPE;
  v_weekly_count int := 0;
  v_revoke_milestone boolean := false;
  v_reopen_evaluation boolean := false;
  v_milestone_xp int := 0;
  v_milestone_gold int := 0;
  v_last_date date;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF p_today IS NULL OR p_today < v_server_date - 1 OR p_today > v_server_date THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DATE_OUT_OF_WINDOW';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(v_uid::text), 20261019
  );

  SELECT * INTO v_m FROM public.missions
   WHERE id = p_mission_id AND user_id = v_uid
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Missão não encontrada'; END IF;

  -- Recorte da era semanal da missão. Serve só para separar "concessão semanal
  -- sem rastro" (pré-migration, irreversível) de "diária antiga sem rastro"
  -- (pré-RPC, fallback histórico): um dia anterior a weekly_started_at foi
  -- concluído quando a missão ainda era diária, e diária sempre deixou rastro.
  v_weekly_started_on := (
    COALESCE(v_m.weekly_started_at, v_m.created_at)
      AT TIME ZONE 'America/Sao_Paulo'
  )::date;

  SELECT count(*) INTO v_ledger_rows
    FROM public.mission_daily_completions
   WHERE mission_id = p_mission_id AND completion_date = p_today
     AND user_id = v_uid;
  IF v_ledger_rows > 1 THEN
    RAISE EXCEPTION 'Múltiplos registros de conclusão para o mesmo dia; desfazer requer conciliação.';
  END IF;
  SELECT COALESCE(xp_earned, 0), COALESCE(gold_earned, 0),
         weekly_week_start, credited_total_verified, completion_kind
    INTO v_xp, v_gold, v_completion_week, v_ledger_verified,
         v_completion_kind
    FROM public.mission_daily_completions
   WHERE mission_id = p_mission_id AND completion_date = p_today
     AND user_id = v_uid;
  v_row_found := FOUND;

  IF NOT v_row_found AND NOT COALESCE(v_m.completed, false)
     AND COALESCE(v_m.daily_status->>p_today::text, '') <> 'completed' THEN
    RAISE EXCEPTION 'Esta missão não foi concluída nesse dia';
  END IF;

  -- Concessão semanal sem rastro é anterior a esta migration. O valor pago não
  -- é reconstruível, e chutar corrompe o saldo numa das duas direções. Recusar
  -- é a única resposta honesta; o texto explica e diz quando destrava.
  IF v_m.frequency_type = 'weekly'
     AND p_today >= v_weekly_started_on
     AND NOT v_row_found THEN
    RAISE EXCEPTION 'Esta execução foi registrada antes da correção do desfazer semanal e não pode ser revertida sem inventar o valor devolvido. A vaga dela sai da cota quando a semana virar.';
  END IF;
  IF NOT v_row_found OR NOT COALESCE(v_ledger_verified, false) THEN
    RAISE EXCEPTION 'O total creditado desta conclusão antiga não está comprovado; desfazer requer conciliação.';
  END IF;

  IF v_xp < 0 OR v_gold < 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'REVERSAL_LEDGER_INVALID';
  END IF;

  v_is_unique := v_completion_kind = 'unique';
  IF v_is_unique THEN
    IF NOT COALESCE(v_m.completed, false) THEN
      RAISE EXCEPTION 'Esta missão não foi concluída';
    END IF;
  ELSIF COALESCE(v_m.daily_status->>p_today::text, '') <> 'completed' THEN
    RAISE EXCEPTION 'Esta missão não foi concluída nesse dia';
  END IF;

  -- Quem diz se esta conclusão consumiu vaga da cota é o carimbo que a própria
  -- concessão deixou, não o estado atual da missão. É o mesmo critério dos dois
  -- lados, e tem de ser: a concessão credita a cota para QUALQUER conclusão
  -- enquanto frequency_type = 'weekly', inclusive a marcação retroativa de um
  -- dia anterior ao weekly_started_at. Um undo que perguntasse
  -- "p_today >= weekly_started_at" usaria um critério mais estreito que o da
  -- concessão, e essa vaga entraria na cota sem nunca sair — com
  -- last_completed_date travado, impedindo remarcar o mesmo dia.
  -- A semana revertida é a carimbada, que é a do dia concluído: desfazer
  -- domingo na segunda devolve a vaga na semana que fechou.
  -- Residual conhecido: execução semanal anterior a esta migration não tem
  -- carimbo nenhum — e é justamente a que o RAISE acima recusa.
  v_is_weekly := v_completion_week IS NOT NULL;
  v_week_start := v_completion_week;

  IF v_is_weekly THEN
    SELECT * INTO v_progress
      FROM public.mission_weekly_progress
     WHERE mission_id = v_m.id
       AND week_start = v_week_start
     FOR UPDATE;
    v_has_progress := FOUND;
  END IF;

  IF v_is_weekly AND NOT v_has_progress THEN
    RAISE EXCEPTION 'O progresso semanal não foi encontrado; desfazer requer conciliação.';
  END IF;

  IF v_is_weekly AND v_has_progress THEN
    v_weekly_count := GREATEST(0, COALESCE(v_progress.current_count, 0) - 1);

    -- O bônus de meta só é devolvido quando a semana deixa de bater a meta.
    -- Desfazer uma execução acima da meta mantém a meta batida e portanto
    -- mantém o bônus: quem fez a mais não pode ser cobrado por isso. Pela UI
    -- isso não acontece (max_count = target_count), mas linha legada com
    -- max_count > target_count existe e é ela que este ramo protege.
    v_revoke_milestone := COALESCE(v_progress.milestone_paid, false)
                          AND v_weekly_count < COALESCE(v_m.target_count, 0);

    IF v_revoke_milestone THEN
      -- Bônus pago antes desta migration não tem valor registrado — milestone_xp
      -- é NULL, que não é zero. Revogar aqui devolveria nada e ainda zeraria
      -- milestone_paid, deixando a próxima execução que fechasse a meta pagar o
      -- MESMO bônus outra vez. Confiscar também não serve. Recusa, pelo mesmo
      -- motivo da execução sem rastro logo acima.
      IF v_progress.milestone_xp IS NULL OR v_progress.milestone_gold IS NULL THEN
        RAISE EXCEPTION 'O bônus de meta desta semana foi pago antes da correção do desfazer semanal e o valor creditado não ficou registrado. Devolver esta execução exigiria inventar quanto cobrar do bônus. A semana destrava quando virar.';
      END IF;

      v_milestone_xp := GREATEST(0, v_progress.milestone_xp);
      v_milestone_gold := GREATEST(0, v_progress.milestone_gold);
      v_xp := v_xp + v_milestone_xp;
      v_gold := v_gold + v_milestone_gold;
    END IF;

    -- Semana já fechada que deixa de bater a meta volta para 'pending'.
    -- _evaluate_weekly_missions pula quem tem evaluated_at, então sem isto
    -- desfazer o domingo na segunda tirava o XP e o bônus mas deixava a semana
    -- registrada como cumprida para sempre, com shortfall 0.
    -- Só 'met' reabre: desfazer só faz a contagem cair, e uma semana que já
    -- fechou em grace/protected/failed não muda de veredito por cair mais —
    -- reavaliá-la gastaria carga de protetor duas vezes pelo mesmo fracasso.
    -- O activity_log da avaliação anterior fica onde está: histórico registra o
    -- que aconteceu, não o estado atual.
    v_reopen_evaluation := v_progress.evaluated_at IS NOT NULL
                           AND v_progress.evaluation_status = 'met'
                           AND v_weekly_count < COALESCE(
                             v_progress.target_snapshot, v_m.target_count, 1
                           );
  END IF;

  -- Saldo e dono sao conferidos sob trava antes da primeira mutacao.
  SELECT * INTO v_profile FROM public.profiles
   WHERE user_id = v_uid FOR UPDATE;
  IF NOT FOUND OR v_profile.total_xp < v_xp
     OR v_profile.missions_completed < 1 THEN
    RAISE EXCEPTION 'Saldo de progressao insuficiente para desfazer';
  END IF;
  SELECT gold INTO v_balance_gold FROM public.user_balance
   WHERE user_id = v_uid FOR UPDATE;
  IF NOT FOUND OR v_balance_gold < v_gold THEN
    RAISE EXCEPTION 'Saldo de ouro insuficiente para desfazer';
  END IF;
  -- No editable mission attribute or priority field is evidence of a prior
  -- award. The private receipt names the rows and amounts actually credited.
  PERFORM private.undo_mission_attribute_awards(
    p_mission_id, p_today, v_uid, v_revoke_milestone, v_week_start
  );

  v_status := (v_m.daily_status - p_today::text);
  IF v_is_unique THEN
    UPDATE public.missions
       SET completed = false, completed_at = NULL
     WHERE id = p_mission_id;
  ELSE
    UPDATE public.missions SET daily_status = v_status WHERE id = p_mission_id;
  END IF;
  DELETE FROM public.mission_daily_completions
   WHERE mission_id = p_mission_id AND completion_date = p_today
     AND user_id = v_uid;

  -- O undo publicado tambem revertia os planos vinculados.
  UPDATE public.plans pl
     SET current_value = GREATEST(0, COALESCE(pl.current_value, 0) - 1),
         updated_at = now()
   WHERE pl.user_id = v_uid
     AND EXISTS (SELECT 1 FROM public.plan_missions pm
                  WHERE pm.plan_id = pl.id AND pm.mission_id = p_mission_id);

  IF v_is_weekly AND v_has_progress THEN
    -- last_completed_date sai do daily_status JÁ sem o dia desfeito. Recalcular
    -- em vez de deixá-lo travado é o que devolve a possibilidade de marcar o
    -- mesmo dia outra vez — o guard ALREADY_COMPLETED_TODAY compara com ele.
    SELECT max((entry.key)::date)
      INTO v_last_date
      FROM jsonb_each_text(COALESCE(v_status, '{}'::jsonb)) entry
     WHERE entry.value = 'completed'
       AND (entry.key)::date BETWEEN v_week_start AND v_week_start + 6;

    UPDATE public.mission_weekly_progress
       SET current_count = v_weekly_count,
           milestone_paid = CASE
             WHEN v_revoke_milestone THEN false ELSE milestone_paid
           END,
           milestone_xp = CASE
             WHEN v_revoke_milestone THEN NULL ELSE milestone_xp
           END,
           milestone_gold = CASE
             WHEN v_revoke_milestone THEN NULL ELSE milestone_gold
           END,
           evaluation_status = CASE
             WHEN v_reopen_evaluation THEN 'pending' ELSE evaluation_status
           END,
           evaluated_at = CASE
             WHEN v_reopen_evaluation THEN NULL ELSE evaluated_at
           END,
           shortfall = CASE
             WHEN v_reopen_evaluation THEN NULL ELSE shortfall
           END,
           target_snapshot = CASE
             WHEN v_reopen_evaluation THEN NULL ELSE target_snapshot
           END,
           last_completed_date = v_last_date,
           updated_at = now()
     WHERE id = v_progress.id;
  END IF;

  v_new_total := GREATEST(0, COALESCE(v_profile.total_xp, 0) - v_xp);
  v_new_count := GREATEST(0, COALESCE(v_profile.missions_completed, 0) - 1);
  v_keys_remove := (COALESCE(v_profile.missions_completed, 0) / 5) - (v_new_count / 5);

  UPDATE public.profiles
     SET total_xp = v_new_total,
         xp_today = GREATEST(0, COALESCE(xp_today, 0) - v_xp),
         missions_completed = v_new_count,
         level = public.get_level_from_xp_v2(v_new_total),
         boss_keys = GREATEST(0, COALESCE(boss_keys, 0) - GREATEST(0, v_keys_remove))
   WHERE user_id = v_uid;

  UPDATE public.user_balance
     SET gold = GREATEST(0, COALESCE(gold, 0) - v_gold), updated_at = now()
   WHERE user_id = v_uid;

  INSERT INTO public.activity_log (user_id, action, description, xp_gained)
  VALUES (v_uid, 'mission_undo', 'Missao desfeita! -' || v_xp || ' XP -' || v_gold || ' Ouro', -v_xp);
  -- Usa a data de lancamento, como a concessao. Em D-1 ambas as entradas
  -- caem no dia em que foram registradas, mantendo o historico liquido.
  INSERT INTO public.xp_history (user_id, xp_gained, type)
  VALUES (v_uid, -v_xp, 'mission_undo');
  INSERT INTO public.gold_history (user_id, type, amount, reason)
  VALUES (v_uid, 'mission_undo', -v_gold, 'Missão desfeita: ' || COALESCE(v_m.title, 'Missao'));

  RETURN jsonb_build_object(
    'success', true,
    'xpEarned', v_xp,
    'goldEarned', v_gold,
    'frequency_type', CASE WHEN v_is_unique THEN 'unique' ELSE COALESCE(v_m.frequency_type, 'daily') END,
    'weekly_count', CASE WHEN v_is_weekly AND v_has_progress THEN v_weekly_count END,
    'weekly_target', CASE WHEN v_is_weekly AND v_has_progress THEN v_m.target_count END,
    'milestone_revoked', v_revoke_milestone,
    'evaluation_reopened', v_reopen_evaluation,
    'week_start', CASE WHEN v_is_weekly AND v_has_progress THEN v_week_start END
  );
END;
$undo$;

REVOKE ALL ON FUNCTION public.undo_mission(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_mission(uuid, date) TO authenticated;
