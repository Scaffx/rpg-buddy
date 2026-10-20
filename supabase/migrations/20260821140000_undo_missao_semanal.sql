-- Desfazer missão semanal flexível — o undo passa a reverter de verdade.
--
-- O problema: `undo_mission` foi escrita para o mundo diário e nunca foi
-- ensinada sobre `frequency_type = 'weekly'`. Dois defeitos, os dois antigos:
--
--   1. VALOR ERRADO. O undo lê o que foi creditado em
--      `mission_daily_completions`. Só que `_complete_mission_with_weekly`
--      nunca escreveu nessa tabela — ela mexia apenas em
--      `mission_weekly_progress` e em `missions.daily_status`. O SELECT não
--      achava linha, caía no fallback fixo `v_xp := 25; v_gold := 2` e
--      devolvia um número sem nenhuma relação com o que a pessoa recebeu, que
--      inclui prioridade, nível, streak, buffs e o bônus de meta de +50%.
--      Desfazer uma semanal de alta prioridade com streak longo devolvia 25 XP
--      de um crédito que pode ter sido várias vezes maior — sobrava XP no
--      perfil. Desfazer uma semanal de baixa prioridade cobrava 25 XP de quem
--      talvez tenha ganhado menos — faltava XP no perfil. Errado nas duas
--      direções.
--
--   2. CONTAGEM NÃO REVERTIA. O undo não tocava em `mission_weekly_progress`:
--      `current_count` não decrementava, `milestone_paid` não voltava e
--      `last_completed_date` continuava apontando para o dia desfeito. Numa
--      missão "4× por semana", desfazer consumia uma vaga da cota para sempre,
--      e `last_completed_date` ainda fazia a remarcação do MESMO dia falhar com
--      ALREADY_COMPLETED_TODAY. Ou seja: o caminho que a regra §1.3 manda usar
--      para trocar de dia — desfaz e marca de novo — deixava a pessoa sem o dia
--      antigo E sem o novo.
--
-- O que muda:
--
--   1. A execução semanal passa a deixar rastro em `mission_daily_completions`,
--      como a diária sempre deixou, e carimba nele a semana cuja cota consumiu.
--      O undo passa a ter o que ler — valor e vaga — em vez de deduzir.
--
--   2. O bônus de meta ganha casa própria: `mission_weekly_progress` recebe
--      `milestone_xp` e `milestone_gold`, ao lado do `milestone_paid` que já
--      existia. A divisão é a do domínio, não uma conveniência: a EXECUÇÃO é do
--      dia e mora na linha do dia; o MILESTONE é da semana e mora na linha da
--      semana. Cada valor tem um dono só, então o undo nunca soma duas vezes o
--      mesmo bônus nem precisa caçar em qual dia o milestone caiu. As colunas
--      nascem NULL de propósito: 0 é um valor pago (NPC fecha meta com 0 XP),
--      NULL é "não registrado".
--
--   3. `undo_mission` passa a reverter a semana: decrementa `current_count`,
--      recalcula `last_completed_date` a partir do `daily_status` já corrigido
--      (em vez de deixá-lo travado no dia que saiu) e devolve o milestone
--      quando — e só quando — a contagem cai abaixo de `target_count`.
--
--   4. Semana já fechada como `met` que deixa de bater a meta volta para
--      `pending`. `_evaluate_weekly_missions` pula quem tem `evaluated_at`, e
--      sem reabrir a semana o domingo desfeito na segunda tirava o XP mas
--      deixava a semana marcada como cumprida para sempre.
--
-- Por que o milestone só volta abaixo da meta: desfazer uma execução que estava
-- acima da meta deixa a meta batida do mesmo jeito, e cobrar o bônus de volta aí
-- seria punir a pessoa por ter feito de MAIS. Pela UI esse caso não aparece —
-- o cliente grava `max_count = target_count` e a contagem não passa da meta —,
-- mas linha legada com `max_count > target_count` existe. Quando o bônus é
-- devolvido, volta pelo valor exato que foi pago, lido da linha da semana, mesmo
-- que quem tenha fechado a meta seja outro dia que não o desfeito.
--
-- O que NÃO muda: XP/ouro de execução, regra da cota, overflow, streak. A
-- concessão paga exatamente o mesmo que pagava.
--
-- O que MUDA em número visível: como a execução semanal passa a escrever em
-- `mission_daily_completions`, ela entra na contagem de missões de hoje
-- (`useTodayMissionsCount`, src/hooks/useProfile.tsx) e nos KPIs do Diário
-- (`useMissionReports`, src/hooks/useMissionReports.ts) — as duas leem essa
-- tabela. Uma semanal concluída passa a contar onde antes não contava. O número
-- sobe porque faltava, não porque a regra afrouxou; execuções semanais
-- anteriores a esta migration continuam fora da conta, já que não têm linha.
--
-- LIMITE CONHECIDO (execuções semanais anteriores a esta migration): elas não
-- têm linha em `mission_daily_completions`, e o valor creditado dependia do
-- nível, streak e buffs do instante da concessão — não é reconstruível. Desfazer
-- com o fallback de 25/2 seria inventar um número, e desfazer com 0 abriria um
-- moinho de XP (completa, desfaz sem devolver, completa de novo). Então o undo
-- RECUSA essas, com mensagem explícita. Pelo mesmo motivo recusa desfazer uma
-- execução que derrubaria a meta de uma semana cujo bônus foi pago antes daqui
-- (`milestone_xp` NULL): devolver 0 e zerar `milestone_paid` deixaria o mesmo
-- bônus ser pago outra vez, e confiscar um valor desconhecido é pior ainda. É
-- uma janela que se fecha sozinha: a linha da semana morre no domingo e nenhuma
-- execução nova cai nesse caso.
--
-- Regra em docs/REGRAS_DE_NEGOCIO.md §1.3.


-- Onde o bônus de meta passa a morar. As colunas nascem NULL, não 0, porque
-- zero é um valor pago de verdade (missão de NPC fecha meta com 0 XP) e NULL é
-- ausência de registro. Uma semana que já estava com `milestone_paid = true`
-- antes desta migration cai em NULL, e o undo sabe ler isso como "não dá para
-- reverter" em vez de devolver zero, zerar a flag e liberar o mesmo bônus para
-- ser pago outra vez. IF NOT EXISTS porque esta migration pode correr depois de
-- um banco já parcialmente adiantado.
ALTER TABLE public.mission_weekly_progress
  ADD COLUMN IF NOT EXISTS milestone_xp integer,
  ADD COLUMN IF NOT EXISTS milestone_gold integer;

-- Desfaz o NOT NULL DEFAULT 0 de uma execução anterior desta mesma migration.
-- Os comandos são no-op quando a coluna já está do jeito certo.
ALTER TABLE public.mission_weekly_progress
  ALTER COLUMN milestone_xp DROP DEFAULT,
  ALTER COLUMN milestone_xp DROP NOT NULL,
  ALTER COLUMN milestone_gold DROP DEFAULT,
  ALTER COLUMN milestone_gold DROP NOT NULL;

-- Semana com bônus pago e valor 0/0 só existe se as colunas nasceram com
-- DEFAULT 0 numa execução anterior: pagamento real nunca dá 0 de ouro (o mínimo
-- é round(2 * 0.5) = 1). Volta para NULL para não mentir que foi pago nada.
UPDATE public.mission_weekly_progress
   SET milestone_xp = NULL,
       milestone_gold = NULL
 WHERE milestone_paid
   AND milestone_xp = 0
   AND milestone_gold = 0;

COMMENT ON COLUMN public.mission_weekly_progress.milestone_xp IS
  'XP pago pelo bonus de meta desta semana. NULL = nao pago, ou pago antes de 20260821140000 sem valor registrado; nesse caso undo_mission recusa reverter em vez de devolver zero. Lido por undo_mission para devolver o valor exato.';
COMMENT ON COLUMN public.mission_weekly_progress.milestone_gold IS
  'Ouro pago pelo bonus de meta desta semana. Mesmo contrato de milestone_xp.';


-- Carimbo de cota: qual semana ESTA execução consumiu. Quem sabe disso é a
-- concessão, no instante em que credita — o undo não tem como deduzir depois
-- sem errar (ver comentário em undo_mission). NULL = execução diária ou avulsa,
-- que não mexe em mission_weekly_progress. Linhas anteriores a esta migration
-- são todas diárias, porque a concessão semanal nunca escreveu aqui antes.
ALTER TABLE public.mission_daily_completions
  ADD COLUMN IF NOT EXISTS weekly_week_start date;

COMMENT ON COLUMN public.mission_daily_completions.weekly_week_start IS
  'Semana (segunda ISO) cuja cota esta execucao consumiu. NULL = execucao diaria ou avulsa, que nao consome cota semanal.';


CREATE OR REPLACE FUNCTION public._complete_mission_with_weekly(p_mission_id uuid, p_date date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_local_now timestamp := now() AT TIME ZONE 'America/Sao_Paulo';
  v_today date;
  v_server_today date;
  v_is_backfill boolean := false;
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
  v_priority_mult numeric;
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

  v_server_today := v_local_now::date;

  -- Janela de registro retroativo: hoje ou ontem, e nada mais. Esquecer de
  -- marcar e falhar o habito sao coisas diferentes; o app so distingue as duas
  -- se aceitar o registro tardio. Alem de um dia, a memoria ja nao e confiavel
  -- e a marcacao vira ficcao.
  v_today := COALESCE(p_date, v_server_today);
  IF v_today > v_server_today OR v_today < v_server_today - 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DATE_OUT_OF_WINDOW';
  END IF;
  v_is_backfill := v_today < v_server_today;

  -- Retroativo paga XP e ouro cheios, mas nao concede bonus preso ao relogio:
  -- madrugador exige conclusao antes das 8h. Sem isto, marcar no dia seguinte
  -- viraria uma forma de escolher o buff em vez de registrar o que aconteceu.
  v_hour := CASE
    WHEN v_is_backfill THEN 12
    ELSE EXTRACT(hour FROM v_local_now)::integer
  END;
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
  -- Prioridade multiplica o XP base ANTES de nível/buff/streak. Missão sem
  -- prioridade (legado, NPC, seed antigo) cai em 'media' e nada muda pra ela.
  v_priority_mult := CASE lower(COALESCE(v_m.priority, 'media'))
    WHEN 'alta'  THEN 1.5
    WHEN 'baixa' THEN 0.7
    ELSE 1.0
  END;
  v_xp_mult := v_level_mult * (1 + v_buff_bonus);
  v_base_xp := round(COALESCE(v_m.xp_reward, 0) * v_priority_mult * v_xp_mult);

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

  -- O bonus de meta pertence a SEMANA, nao ao dia que por acaso a fechou.
  -- Guardar o valor ao lado do proprio milestone_paid e o que permite ao undo
  -- devolver exatamente o que foi pago, em vez de estimar. Sem isto, desfazer
  -- uma execucao que derruba a contagem abaixo da meta teria de adivinhar.
  UPDATE public.mission_weekly_progress
     SET current_count = v_next_weekly_count,
         milestone_paid = milestone_paid OR v_milestone_reached,
         milestone_xp = CASE
           WHEN v_milestone_reached THEN v_milestone_xp ELSE milestone_xp
         END,
         milestone_gold = CASE
           WHEN v_milestone_reached THEN v_milestone_gold ELSE milestone_gold
         END,
         last_completed_date = GREATEST(
           COALESCE(last_completed_date, v_today), v_today
         ),
         updated_at = now()
   WHERE id = v_progress.id;

  UPDATE public.missions
     SET daily_status = COALESCE(daily_status, '{}'::jsonb)
       || jsonb_build_object(v_today::text, 'completed')
   WHERE id = v_m.id;

  -- A execucao semanal passa a deixar rastro, como a diaria sempre deixou.
  -- Guarda so a parcela de EXECUCAO: o milestone e da semana e mora na linha
  -- da semana. Assim cada valor tem um dono unico e o undo nunca soma duas
  -- vezes o mesmo bonus.
  -- O carimbo diz ao undo que esta conclusao consumiu vaga da cota, e de qual
  -- semana. Sem ele o undo teria de deduzir isso do estado atual da missao, e
  -- deduzir erra: a concessao credita a cota para qualquer conclusao enquanto a
  -- missao esta semanal, inclusive a retroativa de um dia anterior a conversao.
  INSERT INTO public.mission_daily_completions (
    mission_id, completion_date, xp_earned, gold_earned, user_id,
    weekly_week_start
  )
  VALUES (
    v_m.id, v_today, v_execution_xp, v_execution_gold, v_uid,
    v_week_start
  );

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
    'priority', COALESCE(v_m.priority, 'media'),
    'priority_mult', v_priority_mult,
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

REVOKE ALL ON FUNCTION public._complete_mission_with_weekly(uuid, date)
  FROM PUBLIC, anon, authenticated;


-- undo_mission: agora reverte a semana, não só o dia.
--
-- Ordem de lock aqui: missions, mission_weekly_progress, profiles, attributes
-- — a mesma da concessão. Completar e desfazer duas missões ao mesmo tempo não
-- vira deadlock por ordem invertida.
--
-- Inversão conhecida, anterior a este arquivo e não tratada por ele: o
-- fechamento semanal `_evaluate_weekly_missions` trava na ordem oposta —
-- profiles em 20260727200031_weekly_mission_started_at.sql:118, antes de
-- mission_weekly_progress na linha 188. Concessão ou undo rodando junto com o
-- fechamento podem, em tese, se cruzar em deadlock. Endireitar a ordem é mexer
-- no fechamento, que não é o assunto deste arquivo.
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
    p_today := v_server_date;
  END IF;

  SELECT * INTO v_m FROM public.missions
   WHERE id = p_mission_id AND user_id = v_uid
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Missão não encontrada'; END IF;

  IF COALESCE(v_m.daily_status->>p_today::text, '') <> 'completed' THEN
    RAISE EXCEPTION 'Esta missão não foi concluída nesse dia';
  END IF;

  -- Recorte da era semanal da missão. Serve só para separar "concessão semanal
  -- sem rastro" (pré-migration, irreversível) de "diária antiga sem rastro"
  -- (pré-RPC, fallback histórico): um dia anterior a weekly_started_at foi
  -- concluído quando a missão ainda era diária, e diária sempre deixou rastro.
  v_weekly_started_on := (
    COALESCE(v_m.weekly_started_at, v_m.created_at)
      AT TIME ZONE 'America/Sao_Paulo'
  )::date;

  SELECT COALESCE(xp_earned, 0), COALESCE(gold_earned, 0), weekly_week_start
    INTO v_xp, v_gold, v_completion_week
  FROM public.mission_daily_completions
  WHERE mission_id = p_mission_id AND completion_date = p_today
  ORDER BY created_at DESC LIMIT 1;
  v_row_found := FOUND;

  -- Concessão semanal sem rastro é anterior a esta migration. O valor pago não
  -- é reconstruível, e chutar corrompe o saldo numa das duas direções. Recusar
  -- é a única resposta honesta; o texto explica e diz quando destrava.
  IF v_m.frequency_type = 'weekly'
     AND p_today >= v_weekly_started_on
     AND NOT v_row_found THEN
    RAISE EXCEPTION 'Esta execução foi registrada antes da correção do desfazer semanal e não pode ser revertida sem inventar o valor devolvido. A vaga dela sai da cota quando a semana virar.';
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

  -- Missão diária antiga (pré-RPC) segue no fallback histórico. Mexer nisso
  -- aqui seria mudar o comportamento do diário sem pedido.
  IF NOT v_row_found THEN
    v_xp := 25; v_gold := 2;
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
  UPDATE public.missions SET daily_status = v_status WHERE id = p_mission_id;
  DELETE FROM public.mission_daily_completions
   WHERE mission_id = p_mission_id AND completion_date = p_today;

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

  IF v_m.attribute_id IS NOT NULL THEN
    SELECT xp INTO v_attr_xp FROM public.attributes WHERE id = v_m.attribute_id;
    IF FOUND THEN
      UPDATE public.attributes
         SET xp = GREATEST(0, v_attr_xp - v_xp),
             level = GREATEST(level, public.get_level_from_xp_v2(GREATEST(0, v_attr_xp - v_xp)))
       WHERE id = v_m.attribute_id;
    END IF;
  END IF;

  IF v_m.secondary_attribute_ids IS NOT NULL THEN
    FOR v_sec IN SELECT (jsonb_array_elements_text(v_m.secondary_attribute_ids))::uuid LOOP
      UPDATE public.attributes
         SET xp = GREATEST(0, xp - 12),
             level = GREATEST(level, public.get_level_from_xp_v2(GREATEST(0, xp - 12)))
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
         level = GREATEST(level, public.get_level_from_xp_v2(v_new_total)),
         boss_keys = GREATEST(0, COALESCE(boss_keys, 0) - GREATEST(0, v_keys_remove))
   WHERE user_id = v_uid;

  UPDATE public.user_balance
     SET gold = GREATEST(0, COALESCE(gold, 0) - v_gold), updated_at = now()
   WHERE user_id = v_uid;

  INSERT INTO public.activity_log (user_id, action, description, xp_gained)
  VALUES (v_uid, 'mission_undo', 'Missao desfeita! -' || v_xp || ' XP -' || v_gold || ' Ouro', -v_xp);

  RETURN jsonb_build_object(
    'success', true,
    'xpEarned', v_xp,
    'goldEarned', v_gold,
    'frequency_type', COALESCE(v_m.frequency_type, 'daily'),
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
