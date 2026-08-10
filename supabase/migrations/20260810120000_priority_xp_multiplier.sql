-- Torneira única 10.0 — prioridade passa a valer XP.
--
-- Antes: toda missão valia xp_reward = 25 (DEFAULT da coluna, nunca preenchido
-- pelo app). `priority` só pintava a borda do card e ordenava a lista — estudar
-- italiano pagava igual a fechar contrato. Prioridade era decorativa.
--
-- Agora: a prioridade multiplica o XP base da missão, ANTES dos multiplicadores
-- de nível/buff/streak (que continuam intactos):
--
--   baixa 0.7×  →  18 XP base
--   media 1.0×  →  25 XP base
--   alta  1.5×  →  38 XP base
--
-- (partindo do xp_reward padrão de 25; uma alta paga ~2.1× uma baixa)
--
-- Não é torneira nova: é a mesma torneira da rotina mudando de formato. Nenhuma
-- outra fonte de XP foi tocada. Ouro segue plano de propósito — o balanceamento
-- 1.0 da economia não é reaberto aqui.
--
-- O teto de 4 missões "alta" por dia é validado no formulário (client), não aqui:
-- missões legadas acima do teto continuam válidas e não quebram.
--
-- undo_mission não precisa de mudança: ele reverte lendo xp_earned do log da
-- conclusão, então devolve exatamente o que foi concedido.

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


REVOKE ALL ON FUNCTION public._complete_mission_with_weekly(uuid)
  FROM PUBLIC, anon, authenticated;


-- Missões DIÁRIAS — o grosso da rotina — passam por _complete_mission_daily,
-- desviadas antes do cálculo acima. Mesmo multiplicador de prioridade aqui.
CREATE OR REPLACE FUNCTION public._complete_mission_daily(p_mission_id uuid, p_today date, p_hour integer DEFAULT 12)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_server_date date := (now())::date;
  v_m public.missions%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_primary_name text;
  v_is_npc boolean;
  v_is_daily boolean;
  v_weekend_bonus boolean := false;
  v_weekend_buff_bonus numeric := 0;
  v_effects text[];
  v_talents text[];
  v_category text;
  v_prev date; v_d date;
  v_prior_streak int := 0; v_new_streak int := 0;
  v_streak_mult numeric := 1.0;
  v_level int; v_level_mult numeric; v_buff_bonus numeric := 0; v_xp_mult numeric; v_scaled_xp int;
  v_priority_mult numeric;
  v_gold int := 2; v_gold_streak int := 1; v_gold_prev date; v_gold_maxgap int;
  v_checklist_done int := 0; v_checklist_xp int := 0;
  v_gold_mult numeric := 1.0; v_doubled_caos boolean := false;
  v_recover_hp_pct numeric := 0; v_add_hp int := 0; v_add_mp int := 0;
  v_grant_flow boolean := false; v_grant_inspired boolean := false;
  v_prev_count int; v_next_count int; v_gained_keys int;
  v_total_xp_reward int; v_attr_xp int; v_sec uuid;
  v_new_total_xp int; v_new_level int; v_inspired_granted boolean := false; v_rng numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  IF p_today IS NULL OR p_today < v_server_date - 1 OR p_today > v_server_date + 1 THEN
    p_today := v_server_date;
  END IF;
  IF p_hour IS NULL OR p_hour < 0 OR p_hour > 23 THEN p_hour := 12; END IF;

  SELECT * INTO v_m FROM public.missions WHERE id = p_mission_id AND user_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Missão não encontrada'; END IF;

  v_is_npc := v_m.npc_id IS NOT NULL;
  v_is_daily := COALESCE(jsonb_array_length(COALESCE(v_m.days_of_week, '[]'::jsonb)), 0) > 0;
  v_weekend_buff_bonus := public._weekend_xp_bonus(
    v_m.frequency_type,
    v_m.days_of_week,
    p_today
  );
  v_weekend_bonus := v_is_daily AND v_weekend_buff_bonus > 0;

  IF v_is_daily THEN
    IF COALESCE(v_m.daily_status->>p_today::text, '') = 'completed' THEN
      RAISE EXCEPTION 'Missão já concluída hoje';
    END IF;
  ELSE
    IF COALESCE(v_m.completed, false) THEN RAISE EXCEPTION 'Missão já concluída'; END IF;
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE user_id = v_uid;
  v_level := GREATEST(1, COALESCE(v_profile.level, 1));
  SELECT name INTO v_primary_name FROM public.attributes WHERE id = v_m.attribute_id;

  SELECT COALESCE(array_agg(si.effect), '{}') INTO v_effects
  FROM public.user_buffs ub JOIN public.shop_items si ON si.id = ub.item_id
  WHERE ub.user_id = v_uid AND ub.active = true AND (ub.expires_at IS NULL OR ub.expires_at > now());

  SELECT COALESCE(array_agg(td.efeito), '{}') INTO v_talents
  FROM public.talentos_jogador tj JOIN public.talentos_disponiveis td ON td.id = tj.talento_id
  WHERE tj.personagem_id = v_uid;

  v_category := public._derive_mission_category(v_m.mission_category, v_primary_name, v_m.title, v_m.description);

  IF v_is_daily THEN
    v_prev := NULL;
    FOR v_d IN
      SELECT (kv.key)::date AS d FROM jsonb_each_text(COALESCE(v_m.daily_status, '{}'::jsonb)) kv
      WHERE kv.value = 'completed' ORDER BY (kv.key)::date DESC
    LOOP
      IF v_prev IS NULL THEN v_prior_streak := 1;
      ELSIF (v_prev - v_d) <= 2 THEN v_prior_streak := v_prior_streak + 1;
      ELSE EXIT; END IF;
      v_prev := v_d;
    END LOOP;
    v_new_streak := v_prior_streak + 1;
  END IF;

  -- XP de hábito: teto em 21 dias (janela de formação de hábito), pico +75%.
  v_streak_mult := CASE
    WHEN v_new_streak >= 21 THEN 1.75 WHEN v_new_streak >= 14 THEN 1.5
    WHEN v_new_streak >= 7 THEN 1.3 WHEN v_new_streak >= 3 THEN 1.1 ELSE 1.0 END;

  v_level_mult := LEAST(3.5, 1 + floor((v_level - 1) / 5.0) * 0.5);
  v_buff_bonus :=
      (CASE WHEN ('xp_boost' = ANY(v_effects) OR 'foco_profundo' = ANY(v_effects)) THEN 0.5 ELSE 0 END)
    + (CASE WHEN 'estado_fluxo_xp' = ANY(v_effects) THEN 0.2 ELSE 0 END)
    + (CASE WHEN ('madrugador' = ANY(v_talents) AND p_hour < 8) THEN 0.15 ELSE 0 END)
    + v_weekend_buff_bonus
    + (v_streak_mult - 1);
  -- Prioridade multiplica o XP base ANTES de nível/buff/streak/fim de semana.
  v_priority_mult := CASE lower(COALESCE(v_m.priority, 'media'))
    WHEN 'alta'  THEN 1.5
    WHEN 'baixa' THEN 0.7
    ELSE 1.0
  END;
  v_xp_mult := v_level_mult * (1 + v_buff_bonus);
  v_scaled_xp := round(COALESCE(v_m.xp_reward, 0) * v_priority_mult * v_xp_mult);

  v_rng := random();
  IF v_category = 'fisico' AND 'pulmoes_de_aco' = ANY(v_talents) THEN v_recover_hp_pct := 0.1; END IF;
  IF v_category = 'casa' AND 'ordem_no_caos' = ANY(v_talents) AND v_rng < 0.2 THEN
    v_gold_mult := v_gold_mult * 2; v_doubled_caos := true; END IF;
  IF v_category = 'criativo' AND 'estado_de_fluxo' = ANY(v_talents) THEN v_grant_flow := true; END IF;
  IF v_category = 'social' AND 'presenca_inspiradora' = ANY(v_talents) THEN v_grant_inspired := true; END IF;
  IF v_category = 'ar_livre' AND 'fotossintese' = ANY(v_talents) THEN v_gold_mult := v_gold_mult * 2; END IF;
  IF v_category = 'estudo' AND 'rato_biblioteca' = ANY(v_talents) THEN v_add_mp := 1; END IF;
  IF v_category = 'fisico' AND 'corpo_de_ferro' = ANY(v_talents) THEN v_add_hp := 2; END IF;

  IF v_is_daily THEN
    v_gold_maxgap := CASE WHEN 'foco_inabalavel' = ANY(v_talents) THEN 2 ELSE 1 END;
    v_gold_streak := 1; v_gold_prev := p_today;
    FOR v_d IN
      SELECT DISTINCT completion_date FROM public.mission_daily_completions
      WHERE mission_id = p_mission_id ORDER BY completion_date DESC LIMIT 60
    LOOP
      IF (v_gold_prev - v_d) <= 0 THEN CONTINUE;
      ELSIF (v_gold_prev - v_d) <= v_gold_maxgap THEN v_gold_streak := v_gold_streak + 1; v_gold_prev := v_d;
      ELSE EXIT; END IF;
    END LOOP;
    v_gold := 2 + LEAST(2, floor(v_gold_streak / 3.0))::int;

    UPDATE public.missions
       SET daily_status = COALESCE(daily_status, '{}'::jsonb) || jsonb_build_object(p_today::text, 'completed')
     WHERE id = p_mission_id;

    INSERT INTO public.mission_daily_completions (mission_id, completion_date, xp_earned, gold_earned, user_id)
    VALUES (p_mission_id, p_today, v_scaled_xp, v_gold, v_uid);
  ELSE
    UPDATE public.missions SET completed = true, completed_at = now() WHERE id = p_mission_id;
  END IF;

  SELECT count(*) FILTER (WHERE completed),
         COALESCE(sum(COALESCE(xp_bonus, 2)) FILTER (WHERE completed), 0)
    INTO v_checklist_done, v_checklist_xp
  FROM public.checklist_items WHERE mission_id = p_mission_id;

  v_gold := GREATEST(0, round((v_gold + LEAST(3, floor(v_checklist_done / 3.0)::int)) * v_gold_mult)::int);

  v_prev_count := COALESCE(v_profile.missions_completed, 0);
  v_next_count := v_prev_count + 1;
  v_gained_keys := GREATEST(0, (v_next_count / 5) - (v_prev_count / 5));

  v_total_xp_reward := CASE WHEN v_is_npc THEN 0 ELSE v_scaled_xp + v_checklist_xp END;

  IF v_m.attribute_id IS NOT NULL THEN
    SELECT xp INTO v_attr_xp FROM public.attributes WHERE id = v_m.attribute_id;
    IF FOUND THEN
      UPDATE public.attributes
         SET xp = v_attr_xp + v_total_xp_reward, level = public.get_level_from_xp_v2(v_attr_xp + v_total_xp_reward)
       WHERE id = v_m.attribute_id;
    END IF;
  END IF;

  IF v_m.secondary_attribute_ids IS NOT NULL THEN
    FOR v_sec IN SELECT (jsonb_array_elements_text(v_m.secondary_attribute_ids))::uuid LOOP
      UPDATE public.attributes SET xp = xp + 12, level = public.get_level_from_xp_v2(xp + 12)
       WHERE id = v_sec AND user_id = v_uid;
    END LOOP;
  END IF;

  v_new_total_xp := COALESCE(v_profile.total_xp, 0) + v_total_xp_reward;
  v_new_level := GREATEST(public.get_level_from_xp_v2(v_new_total_xp), COALESCE(v_profile.level, 1));
  UPDATE public.profiles
     SET total_xp = v_new_total_xp,
         xp_today = COALESCE(xp_today, 0) + v_total_xp_reward,
         missions_completed = COALESCE(missions_completed, 0) + 1,
         level = v_new_level,
         boss_keys = COALESCE(boss_keys, 0) + v_gained_keys
   WHERE user_id = v_uid;

  IF v_gained_keys > 0 THEN
    INSERT INTO public.activity_log (user_id, action, description, xp_gained)
    VALUES (v_uid, 'boss_key_earned', 'Voce ganhou ' || v_gained_keys || ' chave(s) de boss por completar 5 missoes.', 0);
  END IF;

  INSERT INTO public.activity_log (user_id, action, description, xp_gained)
  VALUES (v_uid, 'mission_complete', 'Missao concluida! +' || v_total_xp_reward || ' XP +' || v_gold || ' Ouro', v_total_xp_reward);

  INSERT INTO public.xp_history (user_id, xp_gained, type) VALUES (v_uid, v_total_xp_reward, 'mission');

  IF EXISTS (SELECT 1 FROM public.user_balance WHERE user_id = v_uid) THEN
    UPDATE public.user_balance SET gold = COALESCE(gold, 0) + v_gold, updated_at = now() WHERE user_id = v_uid;
  ELSE
    INSERT INTO public.user_balance (user_id, balance_percent, gold) VALUES (v_uid, 100, 100 + v_gold);
  END IF;

  INSERT INTO public.gold_history (user_id, type, amount, reason)
  VALUES (v_uid, 'missao', v_gold, 'Recompensa de missao: ' || COALESCE(v_m.title, 'Missao'));

  IF v_recover_hp_pct > 0 OR v_add_hp > 0 OR v_add_mp > 0 THEN
    PERFORM public._apply_mission_health_effects(v_uid, v_recover_hp_pct, v_add_hp, v_add_mp);
  END IF;

  IF v_grant_inspired THEN
    UPDATE public.profiles SET inspired_available = true, inspired_earned_at = now() WHERE user_id = v_uid;
  END IF;

  IF v_grant_flow THEN PERFORM public._grant_flow_xp_buff(v_uid); END IF;

  IF 'estado_fluxo_xp' = ANY(v_effects) THEN
    UPDATE public.user_buffs ub SET active = false
     WHERE ub.id = (
       SELECT ub2.id FROM public.user_buffs ub2 JOIN public.shop_items si2 ON si2.id = ub2.item_id
       WHERE ub2.user_id = v_uid AND ub2.active = true AND (ub2.expires_at IS NULL OR ub2.expires_at > now())
         AND si2.effect = 'estado_fluxo_xp' ORDER BY ub2.purchased_at ASC LIMIT 1
     );
  END IF;

  v_inspired_granted := public._grant_inspiration_if_perfect_day(v_uid, p_today);

  RETURN jsonb_build_object(
    'success', true, 'xp_gained', v_total_xp_reward, 'gold_gained', v_gold,
    'priority', COALESCE(v_m.priority, 'media'), 'priority_mult', v_priority_mult,
    'weekend_bonus', v_weekend_bonus,
    'gained_keys', v_gained_keys, 'streak_days', v_new_streak, 'streak_multiplier', v_streak_mult,
    'inspired_granted', v_inspired_granted, 'doubled_by_order_no_caos', v_doubled_caos
  );
END;
$function$;


REVOKE ALL ON FUNCTION public._complete_mission_daily(uuid, date, integer)
  FROM PUBLIC, anon, authenticated;
