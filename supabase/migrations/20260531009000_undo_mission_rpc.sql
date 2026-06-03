-- undo_mission: inverso transacional de complete_mission (missões diárias).
-- Lê os valores reais gravados em mission_daily_completions (anti-cheat).
-- Fecha 2 exploits do undo client antigo:
--   (a) secundários revertidos em -12 (igual ao +12 do complete), não -1
--   (b) reverte a chave de boss ganha ao cruzar múltiplo de 5
CREATE OR REPLACE FUNCTION public.undo_mission(p_mission_id uuid, p_today date)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_server_date date := (now())::date;
  v_m public.missions%ROWTYPE;
  v_xp int; v_gold int;
  v_attr_xp int; v_sec uuid;
  v_profile public.profiles%ROWTYPE;
  v_new_total int; v_new_count int; v_keys_remove int;
  v_status jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF p_today IS NULL OR p_today < v_server_date - 1 OR p_today > v_server_date + 1 THEN
    p_today := v_server_date;
  END IF;

  SELECT * INTO v_m FROM public.missions WHERE id = p_mission_id AND user_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Missão não encontrada'; END IF;

  IF COALESCE(v_m.daily_status->>p_today::text, '') <> 'completed' THEN
    RAISE EXCEPTION 'Esta missão não foi concluída hoje';
  END IF;

  SELECT COALESCE(xp_earned, 25), COALESCE(gold_earned, 2)
    INTO v_xp, v_gold
  FROM public.mission_daily_completions
  WHERE mission_id = p_mission_id AND completion_date = p_today
  ORDER BY created_at DESC LIMIT 1;
  IF v_xp IS NULL THEN v_xp := 25; v_gold := 2; END IF;

  v_status := (v_m.daily_status - p_today::text);
  UPDATE public.missions SET daily_status = v_status WHERE id = p_mission_id;
  DELETE FROM public.mission_daily_completions
   WHERE mission_id = p_mission_id AND completion_date = p_today;

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

  SELECT * INTO v_profile FROM public.profiles WHERE user_id = v_uid;
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

  RETURN jsonb_build_object('success', true, 'xpEarned', v_xp, 'goldEarned', v_gold);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.undo_mission(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.undo_mission(uuid, date) FROM anon;
GRANT  EXECUTE ON FUNCTION public.undo_mission(uuid, date) TO authenticated;
