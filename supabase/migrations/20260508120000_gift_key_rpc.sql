-- ═══════════════════════════════════════════════════════════════════════════════
-- Gift Key system: SELECT policy + redeem_access_key RPC
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. SELECT policy — owner and recipient can see their keys
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Owner or recipient can view access key" ON public.subscription_access_keys;
CREATE POLICY "Owner or recipient can view access key"
  ON public.subscription_access_keys
  FOR SELECT
  USING (
    auth.uid() = owner_user_id
    OR auth.uid() = recipient_user_id
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. redeem_access_key(p_code text)
--    - Validates the code (exists, issued, not expired)
--    - Extends caller's subscription by grant_months months
--      (or creates a new subscription row if none exists)
--    - Marks the key as redeemed
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.redeem_access_key(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key        public.subscription_access_keys%ROWTYPE;
  v_user_id    uuid := auth.uid();
  v_sub        public.subscriptions%ROWTYPE;
  v_new_end    timestamptz;
  v_env        text := 'live';
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Lock the key row to prevent concurrent redemptions
  SELECT * INTO v_key
  FROM public.subscription_access_keys
  WHERE code = upper(trim(p_code))
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  IF v_key.status <> 'issued' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_used');
  END IF;

  IF v_key.expires_at IS NOT NULL AND v_key.expires_at < now() THEN
    UPDATE public.subscription_access_keys
      SET status = 'expired', updated_at = now()
      WHERE id = v_key.id;
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;

  -- Owner cannot redeem their own key (they already have the annual plan)
  -- but we allow it: useful if they want to extend their own subscription.

  -- Find caller's active subscription
  SELECT * INTO v_sub
  FROM public.subscriptions
  WHERE user_id = v_user_id
    AND environment = v_env
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    -- Extend from current_period_end (or now if already expired)
    v_new_end := GREATEST(COALESCE(v_sub.current_period_end, now()), now())
                 + (v_key.grant_months || ' months')::interval;

    UPDATE public.subscriptions
      SET current_period_end = v_new_end,
          status             = 'active',
          cancel_at_period_end = false,
          updated_at         = now()
      WHERE id = v_sub.id;
  ELSE
    -- No subscription: create a gift-based one
    v_new_end := now() + (v_key.grant_months || ' months')::interval;

    INSERT INTO public.subscriptions (
      user_id, paddle_subscription_id, paddle_customer_id,
      product_id, price_id, status,
      current_period_start, current_period_end, environment
    ) VALUES (
      v_user_id,
      'gift_' || replace(gen_random_uuid()::text, '-', ''),
      'gift_' || v_user_id::text,
      'premium_gift', 'premium_gift', 'active',
      now(), v_new_end, v_env
    );
  END IF;

  -- Mark key as redeemed
  UPDATE public.subscription_access_keys
    SET status            = 'redeemed',
        recipient_user_id = v_user_id,
        redeemed_at       = now(),
        updated_at        = now()
    WHERE id = v_key.id;

  RETURN jsonb_build_object(
    'ok', true,
    'grant_months', v_key.grant_months,
    'new_period_end', v_new_end
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_access_key(text) TO authenticated;
