-- ================================================================
-- complete_mission(p_mission_id, p_today, p_hour) — keystone server-side.
--
-- Substitui a lógica client-side de useCompleteMission por uma função
-- atômica e autoritativa no servidor. O cliente NÃO envia mais valores
-- de XP/ouro/atributo — tudo é lido do banco. Recompensas (XP escalado por
-- nível/streak/buff, ouro por streak/checklist/talento, chaves de boss,
-- bônus de checklist, progresso de planos, efeitos de talento) são
-- calculadas aqui dentro, numa única transação.
--
-- p_today / p_hour: contexto de fuso do cliente (o daily_status é chaveado
-- por data LOCAL). p_today é limitado a ±1 dia da data do servidor para
-- impedir backfill de streak. p_hour (0-23) só afeta o bônus do talento
-- "madrugador". Nenhum dos dois influencia valores de alto impacto.
--
-- Fidelidade: replica getLevelFromXp (XP_TABLE de progression.ts),
-- getStreakXpMultiplier, getRoutineXpBuffBonus, deriveMissionCategory
-- (via coluna mission_category quando presente; senão atributo/keywords),
-- resolveMissionTalentEffects, getMissionGoldRewardFromStreakWithTalent,
-- e applyMissionTalentPostEffects (caminho de fallback sem talent_bonus_*).
-- ================================================================

CREATE OR REPLACE FUNCTION public.get_level_from_xp_v2(p_total_xp integer)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
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
    IF v_xp >= xp_table[i] THEN
      RETURN i;
    END IF;
  END LOOP;
  RETURN 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_mission(
  p_mission_id uuid,
  p_today      date,
  p_hour       integer DEFAULT 12
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid             uuid := auth.uid();
  v_server_date     date := (now())::date;
  v_m               public.missions%ROWTYPE;
  v_profile         public.profiles%ROWTYPE;
  v_primary_name    text;
  v_is_npc          boolean;
  v_is_daily        boolean;
  v_effects         text[];      -- buffs ativos
  v_talents         text[];      -- efeitos de talento do jogador
  v_category        text;
  -- streak XP
  v_prev            date;
  v_d               date;
  v_prior_streak    int := 0;
  v_new_streak      int := 0;
  v_streak_mult     numeric := 1.0;
  -- multiplicadores
  v_level           int;
  v_level_mult      numeric;
  v_buff_bonus      numeric := 0;
  v_xp_mult         numeric;
  v_scaled_xp       int;
  -- gold
  v_gold            int := 2;
  v_gold_streak     int := 1;
  v_gold_prev       date;
  v_gold_maxgap     int;
  v_gold_bonus      int;
  v_checklist_done  int := 0;
  v_checklist_xp    int := 0;
  v_gold_mult       numeric := 1.0;
  v_doubled_caos    boolean := false;
  -- talento post-effects
  v_recover_hp_pct  numeric := 0;
  v_add_hp          int := 0;
  v_add_mp          int := 0;
  v_grant_flow      boolean := false;
  v_grant_inspired  boolean := false;
  -- chaves
  v_prev_count      int;
  v_next_count      int;
  v_gained_keys     int;
  -- xp final
  v_total_xp_reward int;
  v_attr_xp         int;
  v_sec             uuid;
  v_new_total_xp    int;
  v_new_level       int;
  v_inspired_granted boolean := false;
  v_rng             numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- Contexto de fuso: impede backfill de streak.
  IF p_today IS NULL OR p_today < v_server_date - 1 OR p_today > v_server_date + 1 THEN
    p_today := v_server_date;
  END IF;
  IF p_hour IS NULL OR p_hour < 0 OR p_hour > 23 THEN
    p_hour := 12;
  END IF;

  -- Missão (com posse garantida)
  SELECT * INTO v_m FROM public.missions WHERE id = p_mission_id AND user_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Missão não encontrada';
  END IF;

  v_is_npc   := v_m.npc_id IS NOT NULL;
  v_is_daily := COALESCE(jsonb_array_length(COALESCE(v_m.days_of_week, '[]'::jsonb)), 0) > 0;

  -- Idempotência: bloqueia dupla conclusão
  IF v_is_daily THEN
    IF COALESCE(v_m.daily_status->>p_today::text, '') = 'completed' THEN
      RAISE EXCEPTION 'Missão já concluída hoje';
    END IF;
  ELSE
    IF COALESCE(v_m.completed, false) THEN
      RAISE EXCEPTION 'Missão já concluída';
    END IF;
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE user_id = v_uid;
  v_level := GREATEST(1, COALESCE(v_profile.level, 1));

  SELECT name INTO v_primary_name FROM public.attributes WHERE id = v_m.attribute_id;

  -- Buffs ativos (efeitos)
  SELECT COALESCE(array_agg(si.effect), '{}') INTO v_effects
  FROM public.user_buffs ub
  JOIN public.shop_items si ON si.id = ub.item_id
  WHERE ub.user_id = v_uid AND ub.active = true
    AND (ub.expires_at IS NULL OR ub.expires_at > now());

  -- Talentos do jogador (efeitos) — fidelidade: sem filtro de equipped
  SELECT COALESCE(array_agg(td.efeito), '{}') INTO v_talents
  FROM public.talentos_jogador tj
  JOIN public.talentos_disponiveis td ON td.id = tj.talento_id
  WHERE tj.personagem_id = v_uid;

  -- Categoria da missão
  v_category := public._derive_mission_category(v_m.mission_category, v_primary_name, v_m.title, v_m.description);

  -- ── Streak XP (a partir do daily_status, antes de marcar hoje) ──
  IF v_is_daily THEN
    v_prev := NULL;
    FOR v_d IN
      SELECT (kv.key)::date AS d
      FROM jsonb_each_text(COALESCE(v_m.daily_status, '{}'::jsonb)) kv
      WHERE kv.value = 'completed'
      ORDER BY (kv.key)::date DESC
    LOOP
      IF v_prev IS NULL THEN
        v_prior_streak := 1;
      ELSIF (v_prev - v_d) <= 2 THEN
        v_prior_streak := v_prior_streak + 1;
      ELSE
        EXIT;
      END IF;
      v_prev := v_d;
    END LOOP;
    v_new_streak := v_prior_streak + 1;
  END IF;

  v_streak_mult := CASE
    WHEN v_new_streak >= 30 THEN 2.0
    WHEN v_new_streak >= 14 THEN 1.5
    WHEN v_new_streak >= 7  THEN 1.25
    WHEN v_new_streak >= 3  THEN 1.10
    ELSE 1.0 END;

  -- ── Multiplicadores de XP ──
  v_level_mult := LEAST(3.5, 1 + floor((v_level - 1) / 5.0) * 0.5);
  v_buff_bonus :=
      (CASE WHEN ('xp_boost' = ANY(v_effects) OR 'foco_profundo' = ANY(v_effects)) THEN 0.5 ELSE 0 END)
    + (CASE WHEN 'estado_fluxo_xp' = ANY(v_effects) THEN 0.2 ELSE 0 END)
    + (CASE WHEN ('madrugador' = ANY(v_talents) AND p_hour < 8) THEN 0.15 ELSE 0 END)
    + (v_streak_mult - 1);
  v_xp_mult := v_level_mult * (1 + v_buff_bonus);
  v_scaled_xp := round(COALESCE(v_m.xp_reward, 0) * v_xp_mult);

  -- ── Talent effects da missão (resolveMissionTalentEffects) ──
  v_rng := random();
  IF v_category = 'fisico' AND 'pulmoes_de_aco' = ANY(v_talents) THEN
    v_recover_hp_pct := 0.1;
  END IF;
  IF v_category = 'casa' AND 'ordem_no_caos' = ANY(v_talents) AND v_rng < 0.2 THEN
    v_gold_mult := v_gold_mult * 2; v_doubled_caos := true;
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

  -- ── Marcar missão concluída ──
  IF v_is_daily THEN
    -- Gold por streak (antes de inserir hoje)
    v_gold_maxgap := CASE WHEN 'foco_inabalavel' = ANY(v_talents) THEN 2 ELSE 1 END;
    v_gold_streak := 1;
    v_gold_prev := p_today;
    FOR v_d IN
      SELECT DISTINCT completion_date
      FROM public.mission_daily_completions
      WHERE mission_id = p_mission_id
      ORDER BY completion_date DESC
      LIMIT 60
    LOOP
      IF (v_gold_prev - v_d) <= 0 THEN
        CONTINUE;
      ELSIF (v_gold_prev - v_d) <= v_gold_maxgap THEN
        v_gold_streak := v_gold_streak + 1;
        v_gold_prev := v_d;
      ELSE
        EXIT;
      END IF;
    END LOOP;
    v_gold := 2 + LEAST(2, floor(v_gold_streak / 3.0))::int;

    UPDATE public.missions
       SET daily_status = COALESCE(daily_status, '{}'::jsonb) || jsonb_build_object(p_today::text, 'completed')
     WHERE id = p_mission_id;

    INSERT INTO public.mission_daily_completions (mission_id, completion_date, xp_earned, gold_earned, user_id)
    VALUES (p_mission_id, p_today, v_scaled_xp, v_gold, v_uid);
  ELSE
    UPDATE public.missions
       SET completed = true, completed_at = now()
     WHERE id = p_mission_id;
  END IF;

  -- ── Bônus de checklist ──
  SELECT count(*) FILTER (WHERE completed),
         COALESCE(sum(COALESCE(xp_bonus, 2)) FILTER (WHERE completed), 0)
    INTO v_checklist_done, v_checklist_xp
  FROM public.checklist_items WHERE mission_id = p_mission_id;

  v_gold := GREATEST(0, round((v_gold + LEAST(3, floor(v_checklist_done / 3.0)::int)) * v_gold_mult)::int);

  -- ── Chaves de boss (1 a cada 5 missões) ──
  v_prev_count := COALESCE(v_profile.missions_completed, 0);
  v_next_count := v_prev_count + 1;
  v_gained_keys := GREATEST(0, (v_next_count / 5) - (v_prev_count / 5));

  -- ── XP final ──
  v_total_xp_reward := CASE WHEN v_is_npc THEN 0 ELSE v_scaled_xp + v_checklist_xp END;

  -- Atributo primário
  IF v_m.attribute_id IS NOT NULL THEN
    SELECT xp INTO v_attr_xp FROM public.attributes WHERE id = v_m.attribute_id;
    IF FOUND THEN
      UPDATE public.attributes
         SET xp = v_attr_xp + v_total_xp_reward,
             level = public.get_level_from_xp_v2(v_attr_xp + v_total_xp_reward)
       WHERE id = v_m.attribute_id;
    END IF;
  END IF;

  -- Atributos secundários (+12 cada)
  IF v_m.secondary_attribute_ids IS NOT NULL THEN
    FOR v_sec IN SELECT (jsonb_array_elements_text(v_m.secondary_attribute_ids))::uuid LOOP
      UPDATE public.attributes
         SET xp = xp + 12,
             level = public.get_level_from_xp_v2(xp + 12)
       WHERE id = v_sec AND user_id = v_uid;
    END LOOP;
  END IF;

  -- Perfil
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
    VALUES (v_uid, 'boss_key_earned',
            'Voce ganhou ' || v_gained_keys || ' chave(s) de boss por completar 5 missoes.', 0);
  END IF;

  -- NOTA: o bloco de "planos vinculados" foi removido — a tabela public.plans
  -- não possui a coluna current_value no schema atual. O código client-side
  -- equivalente (useProfile.tsx) referenciava essa coluna inexistente e estava
  -- quebrado/morto. Progresso de planos precisa de correção de schema à parte.

  -- Histórico
  INSERT INTO public.activity_log (user_id, action, description, xp_gained)
  VALUES (v_uid, 'mission_complete',
          'Missao concluida! +' || v_total_xp_reward || ' XP +' || v_gold || ' Ouro', v_total_xp_reward);

  INSERT INTO public.xp_history (user_id, xp_gained, type)
  VALUES (v_uid, v_total_xp_reward, 'mission');

  -- Ouro
  IF EXISTS (SELECT 1 FROM public.user_balance WHERE user_id = v_uid) THEN
    UPDATE public.user_balance
       SET gold = COALESCE(gold, 0) + v_gold, updated_at = now()
     WHERE user_id = v_uid;
  ELSE
    INSERT INTO public.user_balance (user_id, balance_percent, gold)
    VALUES (v_uid, 100, 100 + v_gold);
  END IF;

  INSERT INTO public.gold_history (user_id, type, amount, reason)
  VALUES (v_uid, 'missao', v_gold, 'Recompensa de missao: ' || COALESCE(v_m.title, 'Missao'));

  -- ── Talent post-effects (health / inspired / flow) ──
  IF v_recover_hp_pct > 0 OR v_add_hp > 0 OR v_add_mp > 0 THEN
    PERFORM public._apply_mission_health_effects(v_uid, v_recover_hp_pct, v_add_hp, v_add_mp);
  END IF;

  IF v_grant_inspired THEN
    UPDATE public.profiles SET inspired_available = true, inspired_earned_at = now() WHERE user_id = v_uid;
  END IF;

  IF v_grant_flow THEN
    PERFORM public._grant_flow_xp_buff(v_uid);
  END IF;

  -- Consome buff de fluxo de uso único, se estava ativo
  IF 'estado_fluxo_xp' = ANY(v_effects) THEN
    UPDATE public.user_buffs ub
       SET active = false
     WHERE ub.id = (
       SELECT ub2.id FROM public.user_buffs ub2
       JOIN public.shop_items si2 ON si2.id = ub2.item_id
       WHERE ub2.user_id = v_uid AND ub2.active = true
         AND (ub2.expires_at IS NULL OR ub2.expires_at > now())
         AND si2.effect = 'estado_fluxo_xp'
       ORDER BY ub2.purchased_at ASC LIMIT 1
     );
  END IF;

  -- Inspiração por dia perfeito
  v_inspired_granted := public._grant_inspiration_if_perfect_day(v_uid, p_today);

  RETURN jsonb_build_object(
    'success', true,
    'xp_gained', v_total_xp_reward,
    'gold_gained', v_gold,
    'gained_keys', v_gained_keys,
    'streak_days', v_new_streak,
    'streak_multiplier', v_streak_mult,
    'inspired_granted', v_inspired_granted,
    'doubled_by_order_no_caos', v_doubled_caos
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_mission(uuid, date, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.complete_mission(uuid, date, integer) FROM anon;
GRANT  EXECUTE ON FUNCTION public.complete_mission(uuid, date, integer) TO authenticated;
