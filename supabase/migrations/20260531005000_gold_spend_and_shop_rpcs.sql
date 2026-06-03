-- ================================================================
-- spend_gold / buy_shop_item — gastos de ouro server-side.
-- Custo lido do banco, dedução guardada (não negativa) e histórico.
-- Passo necessário para depois travar UPDATE(gold) na RLS.
-- ================================================================

CREATE OR REPLACE FUNCTION public.spend_gold(p_amount integer, p_reason text, p_type text DEFAULT 'gasto')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_gold int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 100000 THEN
    RAISE EXCEPTION 'Valor inválido: %', p_amount;
  END IF;

  SELECT gold INTO v_gold FROM public.user_balance WHERE user_id = v_uid FOR UPDATE;
  IF v_gold IS NULL THEN v_gold := 0; END IF;
  IF v_gold < p_amount THEN
    RAISE EXCEPTION 'Saldo insuficiente';
  END IF;

  UPDATE public.user_balance SET gold = v_gold - p_amount, updated_at = now() WHERE user_id = v_uid;

  INSERT INTO public.gold_history (user_id, type, amount, reason)
  VALUES (v_uid, COALESCE(p_type, 'gasto'), -p_amount, COALESCE(p_reason, 'Gasto de ouro'));

  RETURN jsonb_build_object('ok', true, 'spent', p_amount, 'gold', v_gold - p_amount);
END;
$$;

CREATE OR REPLACE FUNCTION public.buy_shop_item(p_item_id uuid, p_today date)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_server_date date := (now())::date;
  v_item public.shop_items%ROWTYPE;
  v_has_merchant boolean;
  v_cost int;
  v_gold int;
  v_expires timestamptz;
  v_week date;
  v_cur_week text;
  v_default_charges int;
  v_max_slots int;
  v_next_charges int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF p_today IS NULL OR p_today < v_server_date - 1 OR p_today > v_server_date + 1 THEN
    p_today := v_server_date;
  END IF;

  SELECT * INTO v_item FROM public.shop_items WHERE id = p_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item não encontrado'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.talentos_jogador tj
    JOIN public.talentos_disponiveis td ON td.id = tj.talento_id
    WHERE tj.personagem_id = v_uid AND td.efeito = 'mestre_mercador'
  ) INTO v_has_merchant;

  v_cost := COALESCE(v_item.cost_percent, 0);
  IF v_has_merchant THEN v_cost := GREATEST(1, floor(v_cost * 0.9)::int); END IF;

  SELECT gold INTO v_gold FROM public.user_balance WHERE user_id = v_uid FOR UPDATE;
  IF v_gold IS NULL THEN v_gold := 0; END IF;
  IF v_gold < v_cost THEN
    RAISE EXCEPTION 'Saldo insuficiente! Ganhe ouro completando missões.';
  END IF;

  UPDATE public.user_balance SET gold = v_gold - v_cost, updated_at = now() WHERE user_id = v_uid;

  IF v_item.effect = 'streak_protector' THEN
    v_week := date_trunc('week', p_today)::date;
    SELECT streak_protector_week,
           CASE WHEN streak_protector_week = v_week::text THEN COALESCE(streak_protector_charges, 2) ELSE 2 END,
           LEAST(3, GREATEST(1, COALESCE(streak_protector_max, 3)))
      INTO v_cur_week, v_default_charges, v_max_slots
      FROM public.profiles WHERE user_id = v_uid;

    v_next_charges := LEAST(v_max_slots, v_default_charges + 1);

    UPDATE public.profiles
       SET streak_protector_charges = v_next_charges,
           streak_protector_max = v_max_slots,
           streak_protector_week = v_week::text
     WHERE user_id = v_uid;

    INSERT INTO public.activity_log (user_id, action, description, xp_gained)
    VALUES (v_uid, 'streak_protector_bought',
            'Protetor de Streak comprado. Cargas: ' || v_next_charges || '/' || v_max_slots, 0);
  ELSE
    v_expires := CASE v_item.duration
      WHEN '50m'   THEN now() + interval '50 minutes'
      WHEN '1h'    THEN now() + interval '1 hour'
      WHEN '1h30m' THEN now() + interval '90 minutes'
      WHEN '2h'    THEN now() + interval '2 hours'
      WHEN '3h'    THEN now() + interval '3 hours'
      WHEN '12h'   THEN now() + interval '12 hours'
      WHEN '24h'   THEN now() + interval '24 hours'
      ELSE NULL END;

    INSERT INTO public.user_buffs (user_id, item_id, expires_at) VALUES (v_uid, p_item_id, v_expires);
  END IF;

  INSERT INTO public.gold_history (user_id, type, amount, reason)
  VALUES (v_uid, 'compra_loja', -v_cost,
          CASE WHEN v_has_merchant THEN 'Comprou ' || v_item.name || ' com desconto de talento'
               ELSE 'Comprou ' || v_item.name END);

  RETURN jsonb_build_object('ok', true, 'cost', v_cost);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.spend_gold(integer, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.spend_gold(integer, text, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.spend_gold(integer, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.buy_shop_item(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.buy_shop_item(uuid, date) FROM anon;
GRANT  EXECUTE ON FUNCTION public.buy_shop_item(uuid, date) TO authenticated;
