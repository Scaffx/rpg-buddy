-- ================================================================
-- claim_daily_bonus(p_today) — bônus diário server-side.
-- Cooldown de 24h, XP/ouro por nível e talento Investidor Anjo são
-- calculados e validados no servidor (o client não decide mais nada).
-- ================================================================

-- Streak ofensiva global (dias consecutivos com ao menos 1 missão concluída)
CREATE OR REPLACE FUNCTION public._global_offensive_streak(p_uid uuid, p_today date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev date := p_today;
  v_d date;
  v_streak int := 0;
  v_diff int;
BEGIN
  FOR v_d IN
    SELECT DISTINCT completion_date FROM public.mission_daily_completions
    WHERE user_id = p_uid ORDER BY completion_date DESC LIMIT 120
  LOOP
    v_diff := v_prev - v_d;
    IF v_diff <= 0 THEN
      v_streak := v_streak + 1; v_prev := v_d;
    ELSIF v_diff = 1 THEN
      v_streak := v_streak + 1; v_prev := v_d;
    ELSE
      EXIT;
    END IF;
  END LOOP;
  RETURN v_streak;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_daily_bonus(p_today date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_server_date date := (now())::date;
  v_last timestamptz;
  v_total_xp int;
  v_level int;
  v_daily_xp int;
  v_daily_gold int;
  v_new_total int;
  v_investor int := 0;
  v_streak int;
  v_gold_amt int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF p_today IS NULL OR p_today < v_server_date - 1 OR p_today > v_server_date + 1 THEN
    p_today := v_server_date;
  END IF;

  -- Cooldown 24h (inviolável — checado no servidor)
  SELECT created_at INTO v_last FROM public.activity_log
   WHERE user_id = v_uid AND action = 'daily_bonus'
   ORDER BY created_at DESC LIMIT 1;
  IF v_last IS NOT NULL AND (now() - v_last) < interval '24 hours' THEN
    RAISE EXCEPTION 'Aguarde 24h desde a última coleta para coletar novamente!';
  END IF;

  SELECT total_xp, level INTO v_total_xp, v_level FROM public.profiles WHERE user_id = v_uid;
  v_level := GREATEST(1, COALESCE(v_level, 1));
  v_daily_xp := 15 + (v_level - 1) * 3;
  v_daily_gold := 5 + floor((v_level - 1) / 5.0)::int;

  v_new_total := COALESCE(v_total_xp, 0) + v_daily_xp;
  UPDATE public.profiles
     SET total_xp = v_new_total,
         level = GREATEST(public.get_level_from_xp_v2(v_new_total), COALESCE(level, 1))
   WHERE user_id = v_uid;

  -- Investidor Anjo: +1 ouro no 1º login do dia se streak ofensiva > 5
  IF EXISTS (
    SELECT 1 FROM public.talentos_jogador tj
    JOIN public.talentos_disponiveis td ON td.id = tj.talento_id
    WHERE tj.personagem_id = v_uid AND td.efeito = 'investidor_anjo'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.activity_log
      WHERE user_id = v_uid AND action = 'investidor_anjo_daily'
        AND created_at >= date_trunc('day', now())
    ) THEN
      v_streak := public._global_offensive_streak(v_uid, p_today);
      IF v_streak > 5 THEN
        v_investor := 1;
        INSERT INTO public.activity_log (user_id, action, description, xp_gained)
        VALUES (v_uid, 'investidor_anjo_daily',
                'Investidor Anjo: +1 ouro no primeiro login do dia (streak ofensiva ' || v_streak || ').', 0);
      END IF;
    END IF;
  END IF;

  v_gold_amt := v_daily_gold + v_investor;

  IF EXISTS (SELECT 1 FROM public.user_balance WHERE user_id = v_uid) THEN
    UPDATE public.user_balance SET gold = COALESCE(gold, 0) + v_gold_amt, updated_at = now() WHERE user_id = v_uid;
  ELSE
    INSERT INTO public.user_balance (user_id, balance_percent, gold) VALUES (v_uid, 100, 100 + v_gold_amt);
  END IF;

  INSERT INTO public.activity_log (user_id, action, description, xp_gained)
  VALUES (v_uid, 'daily_bonus', 'Bonus diario coletado: +' || v_daily_xp || ' XP, +' || v_gold_amt || ' Ouro', v_daily_xp);

  RETURN jsonb_build_object('xp', v_daily_xp, 'gold', v_gold_amt);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_daily_bonus(date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_daily_bonus(date) FROM anon;
GRANT  EXECUTE ON FUNCTION public.claim_daily_bonus(date) TO authenticated;
