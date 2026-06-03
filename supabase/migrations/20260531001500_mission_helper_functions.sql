-- ================================================================
-- Helpers para complete_mission (portados de src/lib e src/hooks/useProfile).
-- ================================================================

-- normaliza: minúsculas + remove acentos comuns PT-BR + trim
CREATE OR REPLACE FUNCTION public._norm(p text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT btrim(lower(translate(COALESCE(p, ''),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')));
$$;

-- deriveMissionCategory (+ normalizeMissionCategory, ATTRIBUTE_TO_CATEGORY, KEYWORDS)
CREATE OR REPLACE FUNCTION public._derive_mission_category(
  p_category text, p_attr_name text, p_title text, p_description text
)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_exp text := public._norm(p_category);
  v_attr text := public._norm(p_attr_name);
  v_hay text := public._norm(COALESCE(p_title,'') || ' ' || COALESCE(p_description,''));
BEGIN
  -- categoria explícita
  IF v_exp IN ('ar livre','ar_livre') THEN RETURN 'ar_livre'; END IF;
  IF v_exp IN ('fisico','casa','criativo','social','estudo','geral') THEN RETURN v_exp; END IF;

  -- mapeamento por atributo
  IF v_attr IN ('forca','agilidade','vitalidade','resiliencia') THEN RETURN 'fisico'; END IF;
  IF v_attr IN ('inteligencia','sabedoria','disciplina') THEN RETURN 'estudo'; END IF;
  IF v_attr = 'criatividade' THEN RETURN 'criativo'; END IF;
  IF v_attr IN ('carisma','relacionamento') THEN RETURN 'social'; END IF;

  -- keywords (ordem: fisico, casa, criativo, social, ar_livre, estudo)
  IF v_hay ~ '(treino|academia|corrida|caminhada|musculacao|exercicio|bike|cardio)' THEN RETURN 'fisico'; END IF;
  IF v_hay ~ '(casa|limpeza|louca|cozinha|organizar|arrumar|faxina)' THEN RETURN 'casa'; END IF;
  IF v_hay ~ '(criativo|desenho|pintura|escrever|musica|arte|design)' THEN RETURN 'criativo'; END IF;
  IF v_hay ~ '(social|amizade|familia|reuniao|network|conversa|encontro)' THEN RETURN 'social'; END IF;
  IF v_hay ~ '(ar livre|parque|trilha|sol|natureza|praia|externo)' THEN RETURN 'ar_livre'; END IF;
  IF v_hay ~ '(estudo|estudar|leitura|livro|curso|aula|codigo|programar)' THEN RETURN 'estudo'; END IF;

  RETURN 'geral';
END;
$$;

-- applyMissionTalentPostEffects — caminho de fallback (sem colunas talent_bonus_*)
CREATE OR REPLACE FUNCTION public._apply_mission_health_effects(
  p_uid uuid, p_recover_pct numeric, p_add_hp integer, p_add_mp integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  h public.user_health_stats%ROWTYPE;
  base_max_hp int; base_cur_hp int; base_max_mp int; base_cur_mp int; v_fat int;
  hp_cap int; mp_cap int; hp_gain int; mp_gain int;
  max_hp_after int; max_mp_after int; lost_hp int; recovered int; cur_hp_after int; cur_mp_after int;
BEGIN
  SELECT * INTO h FROM public.user_health_stats WHERE user_id = p_uid;

  base_max_hp := COALESCE(h.max_hp, 100);
  base_cur_hp := COALESCE(h.current_hp, base_max_hp);
  base_max_mp := COALESCE(h.max_mp, 10);
  base_cur_mp := COALESCE(h.current_mp, base_max_mp);
  v_fat := COALESCE(h.fatigue, 0);

  hp_cap := GREATEST(0, 200 - base_max_hp);
  mp_cap := GREATEST(0, 60 - base_max_mp);
  hp_gain := GREATEST(0, LEAST(p_add_hp, hp_cap));
  mp_gain := GREATEST(0, LEAST(p_add_mp, mp_cap));

  max_hp_after := base_max_hp + hp_gain;
  max_mp_after := base_max_mp + mp_gain;
  lost_hp := GREATEST(0, max_hp_after - (base_cur_hp + hp_gain));
  recovered := CASE WHEN p_recover_pct > 0 THEN GREATEST(0, ceil(lost_hp * p_recover_pct)::int) ELSE 0 END;
  cur_hp_after := LEAST(max_hp_after, base_cur_hp + hp_gain + recovered);
  cur_mp_after := LEAST(max_mp_after, base_cur_mp + mp_gain);

  IF FOUND THEN
    UPDATE public.user_health_stats
       SET max_hp = max_hp_after, current_hp = cur_hp_after,
           max_mp = max_mp_after, current_mp = cur_mp_after
     WHERE user_id = p_uid;
  ELSE
    INSERT INTO public.user_health_stats (user_id, max_hp, current_hp, max_mp, current_mp, fatigue)
    VALUES (p_uid, max_hp_after, cur_hp_after, max_mp_after, cur_mp_after, v_fat);
  END IF;
END;
$$;

-- grantFlowXpOneShotBuff
CREATE OR REPLACE FUNCTION public._grant_flow_xp_buff(p_uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item uuid;
BEGIN
  SELECT id INTO v_item FROM public.shop_items WHERE effect = 'estado_fluxo_xp' LIMIT 1;
  IF v_item IS NULL THEN RETURN; END IF;
  INSERT INTO public.user_buffs (user_id, item_id, active, expires_at)
  VALUES (p_uid, v_item, true, now() + interval '48 hours');
END;
$$;

-- grantInspirationIfPerfectDay (DAYS_NAMES com 'Sab' sem acento — fiel ao client)
CREATE OR REPLACE FUNCTION public._grant_inspiration_if_perfect_day(p_uid uuid, p_today date)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days text[] := ARRAY['Dom','Seg','Ter','Qua','Qui','Sex','Sab'];
  v_today_short text := v_days[EXTRACT(DOW FROM p_today)::int + 1];
  v_required int := 0;
  v_done int := 0;
  v_checklist_imperfect int := 0;
  v_already boolean;
BEGIN
  -- required hoje e quantas concluídas
  SELECT
    count(*),
    count(*) FILTER (WHERE
      (COALESCE(jsonb_array_length(COALESCE(days_of_week,'[]'::jsonb)),0) > 0
         AND COALESCE(daily_status->>p_today::text,'') = 'completed')
      OR
      (COALESCE(jsonb_array_length(COALESCE(days_of_week,'[]'::jsonb)),0) = 0
         AND COALESCE(completed,false))
    )
  INTO v_required, v_done
  FROM public.missions m
  WHERE m.user_id = p_uid
    AND COALESCE(m.is_failed, false) = false
    AND (
      (COALESCE(jsonb_array_length(COALESCE(m.days_of_week,'[]'::jsonb)),0) > 0
        AND m.days_of_week ? v_today_short)
      OR
      (COALESCE(jsonb_array_length(COALESCE(m.days_of_week,'[]'::jsonb)),0) = 0
        AND m.due_date = p_today)
    );

  IF v_required = 0 OR v_done < v_required THEN
    RETURN false;
  END IF;

  -- checklist perfeito em todas as missões requeridas hoje
  SELECT count(*) INTO v_checklist_imperfect
  FROM (
    SELECT ci.mission_id
    FROM public.checklist_items ci
    JOIN public.missions m ON m.id = ci.mission_id
    WHERE m.user_id = p_uid
      AND COALESCE(m.is_failed, false) = false
      AND (
        (COALESCE(jsonb_array_length(COALESCE(m.days_of_week,'[]'::jsonb)),0) > 0
          AND m.days_of_week ? v_today_short)
        OR
        (COALESCE(jsonb_array_length(COALESCE(m.days_of_week,'[]'::jsonb)),0) = 0
          AND m.due_date = p_today)
      )
    GROUP BY ci.mission_id
    HAVING count(*) <> count(*) FILTER (WHERE ci.completed)
  ) x;

  IF v_checklist_imperfect > 0 THEN
    RETURN false;
  END IF;

  SELECT COALESCE(inspired_available, false) INTO v_already FROM public.profiles WHERE user_id = p_uid;
  IF v_already THEN RETURN false; END IF;

  UPDATE public.profiles SET inspired_available = true, inspired_earned_at = now() WHERE user_id = p_uid;
  INSERT INTO public.activity_log (user_id, action, description, xp_gained)
  VALUES (p_uid, 'day_perfect_inspiration',
          'Dia Perfeito concluido! Voce ganhou Inspiracao para o proximo boss.', 0);
  RETURN true;
END;
$$;
