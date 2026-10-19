-- Aplique somente depois das migrations locais de D-1 e undo semanal.
-- O snapshot remoto de 19/10 ainda tem assinaturas anteriores; reconciliar
-- definicoes vivas antes de promover. Nenhum SQL desta migration foi remoto.

DO $preflight$
BEGIN
  IF to_regprocedure('public.complete_mission(uuid,date)') IS NULL
     OR to_regprocedure('public._complete_mission_with_weekly(uuid,date)') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'mission_daily_completions'
          AND column_name = 'weekly_week_start'
     )
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'mission_weekly_progress'
          AND column_name = 'milestone_xp'
     ) THEN
    RAISE EXCEPTION 'Progression migration requires reconciled D-1 and weekly-undo schema';
  END IF;
END;
$preflight$;

ALTER TABLE public.mission_daily_completions
  ADD COLUMN IF NOT EXISTS credited_total_verified boolean NOT NULL DEFAULT false;
ALTER TABLE public.mission_daily_completions
  ADD COLUMN IF NOT EXISTS completion_kind text;

-- O ledger semanal ja armazena a parcela de execucao exata desde
-- 20260821140000; o marco da meta fica em mission_weekly_progress.
UPDATE public.mission_daily_completions
   SET credited_total_verified = true, completion_kind = 'weekly'
 WHERE weekly_week_start IS NOT NULL;

COMMENT ON COLUMN public.mission_daily_completions.credited_total_verified IS
  'true se xp_earned/gold_earned registram os totais efetivamente pagos. Linhas diarias legadas sem comprovacao nao podem ser desfeitas por estimativa.';

-- O cliente so precisa consultar o ledger. Escritas diretas permitiriam
-- falsificar credited_total_verified e o valor retirado por undo_mission.
REVOKE INSERT, UPDATE, DELETE ON public.mission_daily_completions
  FROM PUBLIC, anon, authenticated;

-- A antiga RPC generica aceitava um p_xp arbitrario do navegador. Chamadas
-- internas SECURITY DEFINER continuam com a autoridade de seu proprio owner.
REVOKE EXECUTE ON FUNCTION public.add_xp_to_user(uuid, integer)
  FROM PUBLIC, anon, authenticated;

-- A meta de agua/refeicoes e um efeito de saude. Mantem a cura uma vez por
-- dia, mas nao concede XP sem complete_mission. O lock serializa duas abas.
CREATE OR REPLACE FUNCTION public.claim_health_challenge()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $health$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  PERFORM 1 FROM public.profiles WHERE user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Perfil não encontrado'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.activity_log
     WHERE user_id = v_uid AND action = 'health_challenge_complete'
       AND (created_at AT TIME ZONE 'America/Sao_Paulo')::date = v_today
  ) THEN
    RAISE EXCEPTION 'Você já recebeu a restauração de saúde hoje!';
  END IF;

  UPDATE public.user_health_stats
     SET current_hp = COALESCE(max_hp, 100), fatigue = 0
   WHERE user_id = v_uid;
  INSERT INTO public.activity_log (user_id, action, description, xp_gained)
  VALUES (v_uid, 'health_challenge_complete', 'Metas de saúde concluídas; HP restaurado.', 0);
  RETURN jsonb_build_object('success', true, 'xp', 0);
END;
$health$;

REVOKE EXECUTE ON FUNCTION public.claim_health_challenge()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_health_challenge()
  TO authenticated;

-- Dados vivos de 19/10: boss_kills, friends_total, journal_entries,
-- loadout_full e water_streak ainda tinham XP. Os tres tipos abaixo sao
-- derivados de rotinas cumpridas. O catalogo alimenta claim_achievement e UI.
UPDATE public.achievements
   SET xp_reward = 0
 WHERE COALESCE(condition_type, '') NOT IN
       ('missions_total', 'missions_streak', 'level_reached')
   AND xp_reward > 0;
DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.achievements'::regclass
       AND conname = 'achievements_xp_only_from_routines'
  ) THEN
    ALTER TABLE public.achievements
      ADD CONSTRAINT achievements_xp_only_from_routines
      CHECK (xp_reward <= 0 OR COALESCE(condition_type, '') IN
        ('missions_total', 'missions_streak', 'level_reached'));
  END IF;
END;
$guard$;

-- Legado sem caller ativo: trocar ouro por XP nao pode reabrir progressao.
REVOKE EXECUTE ON FUNCTION public.pay_mission_penalty(uuid)
  FROM PUBLIC, anon, authenticated;

-- Criar meta, registrar refeicao/agua e medir o corpo sao passos de setup,
-- nao conclusoes de rotina. claim_onboarding_mission le este catalogo vivo.
UPDATE public.onboarding_mission_catalog SET xp_reward = 0
 WHERE xp_reward > 0;
DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.onboarding_mission_catalog'::regclass
       AND conname = 'onboarding_setup_no_xp'
  ) THEN
    ALTER TABLE public.onboarding_mission_catalog
      ADD CONSTRAINT onboarding_setup_no_xp CHECK (xp_reward = 0);
  END IF;
END;
$guard$;

-- O wrapper trava a missao antes de chamar o dispatcher. A rotina diaria
-- anterior nao usava FOR UPDATE; duas chamadas simultaneas podiam ler o mesmo
-- estado e creditar duas vezes. O ledger e selado com a resposta transacional.
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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOT_AUTHENTICATED';
  END IF;
  IF v_target > v_server_today OR v_target < v_server_today - 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DATE_OUT_OF_WINDOW';
  END IF;

  SELECT * INTO v_m FROM public.missions
   WHERE id = p_mission_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MISSION_NOT_FOUND';
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

-- O restante desta migration redefine undo_mission preservando os ramos
-- semanal, marco e D-1 do snapshot local.

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
  v_attr_xp int; v_sec uuid;
  v_profile public.profiles%ROWTYPE;
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

  SELECT * INTO v_profile FROM public.profiles
   WHERE user_id = v_uid
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Perfil não encontrado'; END IF;

  IF v_m.attribute_id IS NOT NULL THEN
    SELECT xp INTO v_attr_xp FROM public.attributes WHERE id = v_m.attribute_id;
    IF FOUND THEN
      UPDATE public.attributes
         SET xp = GREATEST(0, v_attr_xp - v_xp),
             level = public.get_level_from_xp_v2(GREATEST(0, v_attr_xp - v_xp))
       WHERE id = v_m.attribute_id;
    END IF;
  END IF;

  IF v_m.secondary_attribute_ids IS NOT NULL THEN
    FOR v_sec IN SELECT (jsonb_array_elements_text(v_m.secondary_attribute_ids))::uuid LOOP
      UPDATE public.attributes
         SET xp = GREATEST(0, xp - 12),
             level = public.get_level_from_xp_v2(GREATEST(0, xp - 12))
       WHERE id = v_sec AND user_id = v_uid;
    END LOOP;
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
