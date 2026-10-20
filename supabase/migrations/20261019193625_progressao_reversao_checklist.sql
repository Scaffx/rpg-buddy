-- Migration unica: concilia D-1 e ledger semanal antes do preflight.

-- Conciliacao aditiva desde as definicoes publicadas em 19/10.
-- Fonte: snapshot vivo jfnospjxdkelxlhcwuia; hashes e contratos no relatorio.
-- Estes corpos preservam formulas, wallet, talentos, streak e guards publicados.
DO $source_guard$
DECLARE
  v_daily text;
  v_weekly text;
  v_complete text;
  v_undo text;
  v_proc_oids oid[];
  v_index integer;
  v_definition text;
BEGIN
  IF to_regprocedure('public._complete_mission_daily(uuid,date,integer)') IS NULL
     OR (to_regprocedure('public._complete_mission_with_weekly(uuid)') IS NULL
         AND to_regprocedure('public._complete_mission_with_weekly(uuid,date)') IS NULL)
     OR (to_regprocedure('public.complete_mission(uuid)') IS NULL
         AND to_regprocedure('public.complete_mission(uuid,date)') IS NULL)
     OR to_regprocedure('public.undo_mission(uuid,date)') IS NULL
     -- A published one-arg function must not mask an already existing two-arg
     -- target: CREATE OR REPLACE would retain that target's owner and ACL.
     OR (to_regprocedure('public._complete_mission_with_weekly(uuid)') IS NULL)
        = (to_regprocedure('public._complete_mission_with_weekly(uuid,date)') IS NULL)
     OR (to_regprocedure('public.complete_mission(uuid)') IS NULL)
        = (to_regprocedure('public.complete_mission(uuid,date)') IS NULL)
     OR (to_regprocedure('public._complete_mission_with_weekly(uuid)') IS NULL)
        IS DISTINCT FROM (to_regprocedure('public.complete_mission(uuid)') IS NULL) THEN
    RAISE EXCEPTION 'Unknown progression source signatures';
  END IF;
  v_proc_oids := ARRAY[
    'public._complete_mission_daily(uuid,date,integer)'::regprocedure::oid,
    COALESCE(to_regprocedure('public._complete_mission_with_weekly(uuid)'),
             to_regprocedure('public._complete_mission_with_weekly(uuid,date)'))::oid,
    COALESCE(to_regprocedure('public.complete_mission(uuid)'),
             to_regprocedure('public.complete_mission(uuid,date)'))::oid,
    'public.undo_mission(uuid,date)'::regprocedure::oid
  ];
  -- pg_get_functiondef includes arguments, defaults, result, security and
  -- configuration, but excludes the owner and ACL. Check both separately.
  FOR v_index IN 1..4 LOOP
    v_definition := pg_get_functiondef(v_proc_oids[v_index]);
    IF strpos(replace(v_definition, E'\r\n', E'\n'), chr(13)) > 0
       OR NOT EXISTS (
         SELECT 1 FROM pg_proc p WHERE p.oid = v_proc_oids[v_index]
           AND pg_get_userbyid(p.proowner) = 'postgres'
           AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
           AND has_function_privilege('authenticated', p.oid, 'EXECUTE') = (v_index > 2)
       ) THEN
      RAISE EXCEPTION 'Progression source metadata or authority changed: %',
        v_proc_oids[v_index]::regprocedure;
    END IF;
  END LOOP;
  -- Hashes do corpo completo, normalizados para UTF8/LF: publicado, D-1,
  -- ou D-1 + undo semanal. Mudanca remota posterior exige nova reconciliacao.
  v_daily := md5(convert_to(replace(pg_get_functiondef(v_proc_oids[1]), E'\r\n', E'\n'), 'UTF8'));
  v_weekly := md5(convert_to(replace(pg_get_functiondef(v_proc_oids[2]), E'\r\n', E'\n'), 'UTF8'));
  v_complete := md5(convert_to(replace(pg_get_functiondef(v_proc_oids[3]), E'\r\n', E'\n'), 'UTF8'));
  v_undo := md5(convert_to(replace(pg_get_functiondef(v_proc_oids[4]), E'\r\n', E'\n'), 'UTF8'));
  IF (v_daily, v_weekly, v_complete, v_undo) NOT IN (
    ('7f11e3a31afc2cf0be9ac94aafab8b87','674f157fc9729832831c45c0092dfde3',
     '21cdfe0c120c50ab38f95687ddb70a9b','923ccdffc8a3b16aff4241a4366c4791'),
    ('66044a02ebc7fff4d40760f26887b573','39e4b29bf0abe13498d58993ea26d190',
     '6d4ab724c2fefa5ebd7476793727c5df','2ff1b7f3b17038b4a1e5e5b1fb80f083'),
    ('66044a02ebc7fff4d40760f26887b573','9488ea2a663188edc91905bf79497640',
     '6d4ab724c2fefa5ebd7476793727c5df','b88a78c2cfcd00439c57f23258eeb532')
  ) THEN
    RAISE EXCEPTION 'Progression source changed after known snapshot: %, %, %, %',
      v_daily, v_weekly, v_complete, v_undo;
  END IF;
END;
$source_guard$;

ALTER TABLE public.mission_weekly_progress
  ADD COLUMN IF NOT EXISTS milestone_xp integer,
  ADD COLUMN IF NOT EXISTS milestone_gold integer;
ALTER TABLE public.mission_weekly_progress
  ALTER COLUMN milestone_xp DROP DEFAULT,
  ALTER COLUMN milestone_xp DROP NOT NULL,
  ALTER COLUMN milestone_gold DROP DEFAULT,
  ALTER COLUMN milestone_gold DROP NOT NULL;
ALTER TABLE public.mission_daily_completions
  ADD COLUMN IF NOT EXISTS weekly_week_start date;
-- Um zero legado criado por DEFAULT nao comprova o marco ja pago.
UPDATE public.mission_weekly_progress
   SET milestone_xp = NULL, milestone_gold = NULL
 WHERE milestone_paid AND milestone_xp = 0 AND milestone_gold = 0;

-- Remover aliases antigos antes de publicar assinaturas com DEFAULT.
-- Evita ambiguidade tanto no PostgreSQL quanto no PostgREST.
DROP FUNCTION IF EXISTS public.complete_mission(uuid);
DROP FUNCTION IF EXISTS public._complete_mission_with_weekly(uuid);

CREATE OR REPLACE FUNCTION public._complete_mission_daily(p_mission_id uuid, p_today date, p_hour integer DEFAULT 12)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_server_date date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
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

  IF p_today IS NULL OR p_today < v_server_date - 1 OR p_today > v_server_date THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DATE_OUT_OF_WINDOW';
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

  SELECT * INTO v_profile FROM public.profiles WHERE user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
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

  -- XP de habito: teto em 21 dias (janela de formacao de habito), pico +75%.
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
  -- Prioridade multiplica o XP base ANTES de nivel/buff/streak/fim de semana.
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
    SELECT xp INTO v_attr_xp FROM public.attributes
     WHERE id = v_m.attribute_id AND user_id = v_uid FOR UPDATE;
    IF FOUND THEN
      UPDATE public.attributes
         SET xp = v_attr_xp + v_total_xp_reward, level = public.get_level_from_xp_v2(v_attr_xp + v_total_xp_reward)
       WHERE id = v_m.attribute_id AND user_id = v_uid;
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


CREATE OR REPLACE FUNCTION public._complete_mission_with_weekly(p_mission_id uuid, p_date date DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
  v_today := COALESCE(p_date, v_server_today);
  IF v_today > v_server_today OR v_today < v_server_today - 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DATE_OUT_OF_WINDOW';
  END IF;
  v_is_backfill := v_today < v_server_today;
  v_hour := CASE WHEN v_is_backfill THEN 12
    ELSE EXTRACT(hour FROM v_local_now)::integer END;
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
  -- Prioridade multiplica o XP base ANTES de nivel/buff/streak. Missao sem
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
         milestone_xp = CASE WHEN v_milestone_reached THEN v_milestone_xp ELSE milestone_xp END,
         milestone_gold = CASE WHEN v_milestone_reached THEN v_milestone_gold ELSE milestone_gold END,
         last_completed_date = v_today,
         updated_at = now()
   WHERE id = v_progress.id;

  UPDATE public.missions
     SET daily_status = COALESCE(daily_status, '{}'::jsonb)
       || jsonb_build_object(v_today::text, 'completed')
   WHERE id = v_m.id;

  INSERT INTO public.mission_daily_completions (
    mission_id, completion_date, xp_earned, gold_earned, user_id, weekly_week_start
  ) VALUES (
    p_mission_id, v_today, v_execution_xp, v_execution_gold, v_uid, v_week_start
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


REVOKE EXECUTE ON FUNCTION public._complete_mission_daily(uuid,date,integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._complete_mission_with_weekly(uuid,date)
  FROM PUBLIC, anon, authenticated;

DO $preflight$
BEGIN
  IF to_regprocedure('public._complete_mission_with_weekly(uuid,date)') IS NULL
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

-- RLS de posse nao limita colunas: o cliente podia editar xp_bonus.
-- O valor dos itens administrativos existentes fica preservado.
REVOKE INSERT, UPDATE ON public.checklist_items FROM PUBLIC, anon, authenticated;
GRANT INSERT (mission_id, description) ON public.checklist_items TO authenticated;
GRANT UPDATE (completed, description) ON public.checklist_items TO authenticated;

-- INSERT proprio em profiles/attributes tambem podia nascer com XP arbitrario.
CREATE OR REPLACE FUNCTION public._guard_progression_initial_values()
RETURNS trigger LANGUAGE plpgsql SET search_path = public
AS $initial_guard$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_TABLE_NAME = 'profiles' AND (
      NEW.total_xp <> 0 OR NEW.xp_today <> 0 OR NEW.level <> 1
      OR NEW.missions_completed <> 0 OR NEW.boss_keys <> 0
      OR NEW.inspired_available OR NEW.inspired_earned_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Initial progression values must be server defaults';
    ELSIF TG_TABLE_NAME = 'attributes' AND (NEW.xp <> 0 OR NEW.level <> 1) THEN
      RAISE EXCEPTION 'Initial attribute progression must be server defaults';
    END IF;
  END IF;
  RETURN NEW;
END;
$initial_guard$;
REVOKE EXECUTE ON FUNCTION public._guard_progression_initial_values()
  FROM PUBLIC, anon, authenticated;
DO $initial_triggers$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.profiles'::regclass
                 AND tgname = 'guard_profiles_progression_insert') THEN
    CREATE TRIGGER guard_profiles_progression_insert BEFORE INSERT ON public.profiles
      FOR EACH ROW EXECUTE FUNCTION public._guard_progression_initial_values();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.attributes'::regclass
                 AND tgname = 'guard_attributes_progression_insert') THEN
    CREATE TRIGGER guard_attributes_progression_insert BEFORE INSERT ON public.attributes
      FOR EACH ROW EXECUTE FUNCTION public._guard_progression_initial_values();
  END IF;
END;
$initial_triggers$;

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

-- O cliente podia inserir sua propria linha em user_achievements. Uma linha
-- forjada nao prova a condicao de XP; a checagem ocorre no resgate atomico.
CREATE OR REPLACE FUNCTION public._guard_achievement_xp_claim()
RETURNS trigger LANGUAGE plpgsql SET search_path = public
AS $achievement_guard$
DECLARE
  v_type text;
  v_value integer;
  v_xp integer;
  v_current integer;
BEGIN
  IF NEW.claimed_at IS NULL OR OLD.claimed_at IS NOT NULL THEN RETURN NEW; END IF;
  SELECT condition_type, condition_value, xp_reward
    INTO v_type, v_value, v_xp
    FROM public.achievements WHERE id = NEW.achievement_id;
  IF COALESCE(v_xp, 0) <= 0 THEN RETURN NEW; END IF;

  IF v_type = 'missions_total' THEN
    SELECT missions_completed INTO v_current FROM public.profiles
     WHERE user_id = NEW.user_id;
  ELSIF v_type = 'level_reached' THEN
    SELECT level INTO v_current FROM public.profiles
     WHERE user_id = NEW.user_id;
  ELSIF v_type = 'missions_streak' THEN
    WITH days AS (
      SELECT DISTINCT completion_date AS d
        FROM public.mission_daily_completions WHERE user_id = NEW.user_id
    ), numbered AS (
      SELECT d, d - row_number() OVER (ORDER BY d)::integer AS run_key FROM days
    ), runs AS (
      SELECT count(*) AS length FROM numbered GROUP BY run_key
    )
    SELECT COALESCE(max(length), 0)::integer INTO v_current FROM runs;
  ELSE
    RAISE EXCEPTION 'Conquista externa nao pode pagar XP';
  END IF;
  IF COALESCE(v_current, 0) < COALESCE(v_value, 1) THEN
    RAISE EXCEPTION 'Conquista de rotina ainda nao comprovada';
  END IF;
  RETURN NEW;
END;
$achievement_guard$;
REVOKE EXECUTE ON FUNCTION public._guard_achievement_xp_claim()
  FROM PUBLIC, anon, authenticated;
DO $achievement_trigger$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgrelid = 'public.user_achievements'::regclass
                   AND tgname = 'guard_achievement_xp_claim') THEN
    CREATE TRIGGER guard_achievement_xp_claim
      BEFORE UPDATE OF claimed_at ON public.user_achievements
      FOR EACH ROW EXECUTE FUNCTION public._guard_achievement_xp_claim();
  END IF;
END;
$achievement_trigger$;

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
  IF v_m.attribute_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.attributes WHERE id = v_m.attribute_id
      AND user_id = v_uid AND xp < v_xp FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'Saldo do atributo insuficiente para desfazer';
  END IF;
  IF v_m.secondary_attribute_ids IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.attributes
     WHERE id IN (SELECT jsonb_array_elements_text(v_m.secondary_attribute_ids)::uuid)
       AND user_id = v_uid AND xp < 12 FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'Saldo de atributo secundario insuficiente para desfazer';
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

  IF v_m.attribute_id IS NOT NULL THEN
    SELECT xp INTO v_attr_xp FROM public.attributes
     WHERE id = v_m.attribute_id AND user_id = v_uid FOR UPDATE;
    IF FOUND THEN
      UPDATE public.attributes
         SET xp = GREATEST(0, v_attr_xp - v_xp),
             level = public.get_level_from_xp_v2(GREATEST(0, v_attr_xp - v_xp))
       WHERE id = v_m.attribute_id AND user_id = v_uid;
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
