-- claim_health_challenge: +35 XP (guard diário no servidor) + restaura HP.
CREATE OR REPLACE FUNCTION public.claim_health_challenge()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_xp int; v_level int; v_new int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.activity_log
    WHERE user_id = v_uid AND action = 'health_challenge_complete'
      AND created_at >= date_trunc('day', now())
  ) THEN
    RAISE EXCEPTION 'Você já ganhou o bônus de saúde hoje!';
  END IF;

  SELECT total_xp, level INTO v_xp, v_level FROM public.profiles WHERE user_id = v_uid;
  v_new := COALESCE(v_xp, 0) + 35;
  UPDATE public.profiles
     SET total_xp = v_new,
         xp_today = COALESCE(xp_today, 0) + 35,
         level = GREATEST(COALESCE(level, 1), public.get_level_from_xp_v2(v_new))
   WHERE user_id = v_uid;

  UPDATE public.user_health_stats SET current_hp = COALESCE(max_hp, 100), fatigue = 0 WHERE user_id = v_uid;

  INSERT INTO public.activity_log (user_id, action, description, xp_gained)
  VALUES (v_uid, 'health_challenge_complete', '✨ Desafio de saúde completado! +35 XP', 35);

  RETURN jsonb_build_object('success', true, 'xp', 35);
END;
$$;

-- pay_mission_penalty: gasta 10 ouro e restaura o XP perdido (lido do banco).
CREATE OR REPLACE FUNCTION public.pay_mission_penalty(p_mission_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cost int := 10;
  v_m public.missions%ROWTYPE;
  v_gold int; v_txp int; v_restore int; v_new int;
  v_status jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT * INTO v_m FROM public.missions WHERE id = p_mission_id AND user_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Missão não encontrada'; END IF;

  SELECT gold INTO v_gold FROM public.user_balance WHERE user_id = v_uid FOR UPDATE;
  IF COALESCE(v_gold, 0) < v_cost THEN
    RAISE EXCEPTION 'Ouro insuficiente! Custa 10 🪙 para pagar a penalidade.';
  END IF;
  UPDATE public.user_balance SET gold = v_gold - v_cost, updated_at = now() WHERE user_id = v_uid;

  v_restore := GREATEST(0, COALESCE(NULLIF(v_m.xp_penalized, 0), v_m.xp_reward, 0));
  SELECT total_xp INTO v_txp FROM public.profiles WHERE user_id = v_uid;
  v_new := COALESCE(v_txp, 0) + v_restore;
  UPDATE public.profiles
     SET total_xp = v_new, level = GREATEST(COALESCE(level, 1), public.get_level_from_xp_v2(v_new))
   WHERE user_id = v_uid;

  v_status := COALESCE(v_m.daily_status, '{}'::jsonb);
  IF v_m.failed_date IS NOT NULL THEN
    v_status := v_status || jsonb_build_object(v_m.failed_date::text, 'failed_accepted');
  END IF;
  UPDATE public.missions
     SET is_failed = false, xp_penalized = 0, failed_date = null, daily_status = v_status
   WHERE id = p_mission_id;

  INSERT INTO public.gold_history (user_id, type, amount, reason)
  VALUES (v_uid, 'penalidade', -v_cost, 'Pagou penalidade: ' || COALESCE(v_m.title, 'Missao'));

  BEGIN
    INSERT INTO public.xp_transactions (user_id, mission_id, reason, xp_delta, gold_delta, local_date, description)
    VALUES (v_uid, p_mission_id, 'penalty_paid_with_gold', v_restore, -v_cost,
            COALESCE(v_m.failed_date, (now())::date),
            'Pagou penalidade com ' || v_cost || ' 🪙: ' || COALESCE(v_m.title, 'Missao') || ' (+' || v_restore || ' XP)');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'xp_restored', v_restore, 'gold_spent', v_cost);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_health_challenge() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.claim_health_challenge() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.pay_mission_penalty(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.pay_mission_penalty(uuid) TO authenticated;
