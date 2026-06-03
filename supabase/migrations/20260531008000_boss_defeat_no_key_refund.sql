-- Derrota no boss NÃO devolve mais chaves — elas são consumidas integralmente.
-- (Ajuste de balanceamento solicitado.) Reaplica resolve_boss_battle sem o refund.
CREATE OR REPLACE FUNCTION public.resolve_boss_battle(
  p_boss_id uuid, p_won boolean, p_damage integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_boss public.bosses%ROWTYPE;
  v_keys_cost int; v_xp int; v_gold int;
  v_profile public.profiles%ROWTYPE;
  v_cur_keys int;
  v_new_total int; v_new_level int;
  v_damage int := GREATEST(0, COALESCE(p_damage, 0));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT * INTO v_boss FROM public.bosses WHERE id = p_boss_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Boss não encontrado'; END IF;

  IF EXISTS (SELECT 1 FROM public.boss_battles WHERE user_id = v_uid AND boss_id = p_boss_id AND won = true) THEN
    RAISE EXCEPTION 'BOSS_ALREADY_DEFEATED';
  END IF;

  v_keys_cost := GREATEST(0, COALESCE(v_boss.keys_cost, 0));
  v_xp := GREATEST(0, COALESCE(v_boss.xp_reward, 0));
  v_gold := GREATEST(0, COALESCE(v_boss.gold_reward, 10));

  SELECT * INTO v_profile FROM public.profiles WHERE user_id = v_uid;
  v_cur_keys := COALESCE(v_profile.boss_keys, 0);
  IF v_cur_keys < v_keys_cost THEN RAISE EXCEPTION 'INSUFFICIENT_KEYS'; END IF;

  UPDATE public.profiles SET boss_keys = v_cur_keys - v_keys_cost WHERE user_id = v_uid;

  INSERT INTO public.boss_battles (user_id, boss_id, damage_dealt, won)
  VALUES (v_uid, p_boss_id, v_damage, COALESCE(p_won, false));

  PERFORM public._consume_one_shot_buff(v_uid, ARRAY['adrenalina','adrenaline_boost']);
  PERFORM public._consume_one_shot_buff(v_uid, ARRAY['boss_debuff']);
  IF COALESCE(v_profile.inspired_available, false) THEN
    UPDATE public.profiles SET inspired_available = false, inspired_earned_at = null WHERE user_id = v_uid;
  END IF;

  IF COALESCE(p_won, false) THEN
    v_new_total := COALESCE(v_profile.total_xp, 0) + v_xp;
    v_new_level := GREATEST(public.get_level_from_xp_v2(v_new_total), COALESCE(v_profile.level, 1));
    UPDATE public.profiles SET total_xp = v_new_total, level = v_new_level WHERE user_id = v_uid;

    IF EXISTS (SELECT 1 FROM public.user_balance WHERE user_id = v_uid) THEN
      UPDATE public.user_balance SET gold = COALESCE(gold, 0) + v_gold, updated_at = now() WHERE user_id = v_uid;
    ELSE
      INSERT INTO public.user_balance (user_id, balance_percent, gold) VALUES (v_uid, 100, 100 + v_gold);
    END IF;

    INSERT INTO public.activity_log (user_id, action, description, xp_gained)
    VALUES (v_uid, 'boss_defeated', 'Boss derrotado! +' || v_xp || ' XP +' || v_gold || ' Ouro', v_xp);
    INSERT INTO public.xp_history (user_id, xp_gained, type) VALUES (v_uid, v_xp, 'boss');

    RETURN jsonb_build_object('won', true, 'xp_gained', v_xp, 'gold_gained', v_gold, 'damage', v_damage);
  ELSE
    INSERT INTO public.activity_log (user_id, action, description, xp_gained)
    VALUES (v_uid, 'boss_failed',
            'Derrota contra o boss. Dano causado: ' || v_damage || '. As chaves foram consumidas.', 0);
    RETURN jsonb_build_object('won', false, 'xp_gained', 0, 'gold_gained', 0, 'damage', v_damage, 'refunded_keys', 0);
  END IF;
END;
$$;
