BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
-- Fail before any DDL when the previous chest grant contract is absent/drifted.
DO $preflight$ BEGIN
  IF to_regclass('app_private.adventure_chest_cash_config') IS NULL
    OR to_regclass('app_private.adventure_chest_cash_receipts') IS NULL
    OR to_regclass('app_private.adventure_chest_opening_entitlements') IS NULL
    OR to_regprocedure('public.grant_adventure_chest_cash_receipt(uuid,text,text,text,integer,text,text)') IS NULL
    OR NOT has_function_privilege('service_role',
      'public.grant_adventure_chest_cash_receipt(uuid,text,text,text,integer,text,text)','EXECUTE')
    OR has_function_privilege('authenticated',
      'public.grant_adventure_chest_cash_receipt(uuid,text,text,text,integer,text,text)','EXECUTE')
  THEN RAISE EXCEPTION 'CHEST_CASH_GRANT_CONTRACT_DRIFT' USING ERRCODE='22023'; END IF;
END $preflight$;

-- A checkout is bound to a verified user before Paddle receives a create request.
-- A lost provider response leaves status=creating and requires reconciliation;
-- it must never silently create a second transaction.
CREATE TABLE app_private.adventure_chest_cash_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(user_id),
  request_id uuid NOT NULL UNIQUE,
  provider text NOT NULL DEFAULT 'paddle' CHECK (provider='paddle'),
  environment text NOT NULL DEFAULT 'live' CHECK (environment='live'),
  price_id text NOT NULL,
  amount_minor integer NOT NULL DEFAULT 990 CHECK (amount_minor=990),
  currency text NOT NULL DEFAULT 'BRL' CHECK (currency='BRL'),
  status text NOT NULL DEFAULT 'creating' CHECK (status IN ('creating','ready','completed')),
  transaction_id text UNIQUE,
  event_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  ready_at timestamptz,
  completed_at timestamptz,
  CONSTRAINT chest_cash_order_shape CHECK (
    (status='creating' AND transaction_id IS NULL AND event_id IS NULL)
    OR (status='ready' AND transaction_id IS NOT NULL AND event_id IS NULL)
    OR (status='completed' AND transaction_id IS NOT NULL AND event_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX adventure_chest_cash_one_active_order
  ON app_private.adventure_chest_cash_orders(user_id)
  WHERE status IN ('creating','ready');
CREATE INDEX adventure_chest_cash_orders_user
  ON app_private.adventure_chest_cash_orders(user_id);
ALTER TABLE app_private.adventure_chest_cash_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.adventure_chest_cash_orders FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.get_adventure_chest_cash_checkout_state(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_config app_private.adventure_chest_cash_config%ROWTYPE;
  v_order app_private.adventure_chest_cash_orders%ROWTYPE;
  v_cap integer;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'USER_REQUIRED' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.profiles WHERE user_id=p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND' USING ERRCODE='22023'; END IF;
  SELECT coalesce(gold_cap,1) INTO v_cap
    FROM app_private.adventure_chest_opening_entitlements WHERE user_id=p_user_id;
  SELECT * INTO STRICT v_config FROM app_private.adventure_chest_cash_config WHERE singleton=true;
  SELECT * INTO v_order FROM app_private.adventure_chest_cash_orders
    WHERE user_id=p_user_id AND status IN ('creating','ready') ORDER BY created_at LIMIT 1;
  RETURN jsonb_build_object(
    'ready', v_config.enabled AND v_config.environment='live'
      AND v_config.price_id IS NOT NULL AND coalesce(v_cap,1)=3
      AND NOT EXISTS (SELECT 1 FROM app_private.adventure_chest_cash_receipts
        WHERE user_id=p_user_id),
    'reason', CASE
      WHEN EXISTS (SELECT 1 FROM app_private.adventure_chest_cash_receipts WHERE user_id=p_user_id)
        THEN 'ALREADY_OWNED'
      WHEN coalesce(v_cap,1)<3 THEN 'GOLD_UNLOCKS_REQUIRED'
      WHEN NOT v_config.enabled OR v_config.environment<>'live' OR v_config.price_id IS NULL
        THEN 'NOT_CONFIGURED'
      ELSE NULL END,
    'already_owned', EXISTS (SELECT 1 FROM app_private.adventure_chest_cash_receipts WHERE user_id=p_user_id),
    'price_id',v_config.price_id,'currency','BRL','amount_minor',990,
    'order_id',v_order.id,'order_status',v_order.status,
    'request_id',v_order.request_id);
END $fn$;

CREATE FUNCTION public.prepare_adventure_chest_cash_order(p_user_id uuid,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_state jsonb; v_order app_private.adventure_chest_cash_orders%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'ORDER_INPUT_INVALID' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.profiles WHERE user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_order FROM app_private.adventure_chest_cash_orders WHERE request_id=p_request_id;
  IF FOUND THEN
    IF v_order.user_id<>p_user_id THEN
      RAISE EXCEPTION 'ORDER_OWNER_CONFLICT' USING ERRCODE='22023'; END IF;
    RETURN jsonb_build_object('order_id',v_order.id,'request_id',v_order.request_id,'status',v_order.status,
      'transaction_id',v_order.transaction_id,
      'price_id',v_order.price_id,'replayed',true);
  END IF;
  v_state := public.get_adventure_chest_cash_checkout_state(p_user_id);
  IF NOT (v_state->>'ready')::boolean THEN
    RAISE EXCEPTION '%',v_state->>'reason' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_order FROM app_private.adventure_chest_cash_orders
    WHERE user_id=p_user_id AND status IN ('creating','ready') ORDER BY created_at LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('order_id',v_order.id,'request_id',v_order.request_id,'status',v_order.status,
      'transaction_id',v_order.transaction_id,
      'price_id',v_order.price_id,'replayed',true);
  END IF;
  INSERT INTO app_private.adventure_chest_cash_orders(user_id,request_id,price_id)
    VALUES(p_user_id,p_request_id,v_state->>'price_id') RETURNING * INTO v_order;
  RETURN jsonb_build_object('order_id',v_order.id,'request_id',v_order.request_id,'status',v_order.status,
    'price_id',v_order.price_id,'replayed',false);
END $fn$;

CREATE FUNCTION public.attach_adventure_chest_cash_transaction(
  p_order_id uuid,p_user_id uuid,p_transaction_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_order app_private.adventure_chest_cash_orders%ROWTYPE;
BEGIN
  IF p_order_id IS NULL OR p_user_id IS NULL OR p_transaction_id IS NULL
    OR p_transaction_id !~ '^txn_[a-z0-9]{26}$' THEN
    RAISE EXCEPTION 'ORDER_ATTACH_INVALID' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.profiles WHERE user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_order FROM app_private.adventure_chest_cash_orders
    WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.user_id<>p_user_id THEN
    RAISE EXCEPTION 'ORDER_OWNER_CONFLICT' USING ERRCODE='22023'; END IF;
  IF v_order.status<>'creating' THEN
    IF v_order.transaction_id=p_transaction_id THEN
      RETURN jsonb_build_object('ok',true,'replayed',true,'order_id',v_order.id);
    END IF;
    RAISE EXCEPTION 'ORDER_TRANSACTION_CONFLICT' USING ERRCODE='22023';
  END IF;
  UPDATE app_private.adventure_chest_cash_orders
    SET status='ready',transaction_id=p_transaction_id,ready_at=now()
    WHERE id=p_order_id;
  RETURN jsonb_build_object('ok',true,'replayed',false,'order_id',p_order_id);
END $fn$;

CREATE FUNCTION public.finalize_adventure_chest_cash_order(
  p_transaction_id text,p_event_id text,p_price_id text,
  p_amount_minor integer,p_currency text,p_environment text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_user_id uuid; v_order app_private.adventure_chest_cash_orders%ROWTYPE;
  v_grant jsonb;
BEGIN
  SELECT user_id INTO v_user_id FROM app_private.adventure_chest_cash_orders
    WHERE transaction_id=p_transaction_id AND environment=p_environment;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.profiles WHERE user_id=v_user_id FOR UPDATE;
  SELECT * INTO STRICT v_order FROM app_private.adventure_chest_cash_orders
    WHERE transaction_id=p_transaction_id AND environment=p_environment FOR UPDATE;
  IF v_order.status='creating' OR v_order.price_id<>p_price_id
    OR v_order.amount_minor<>p_amount_minor OR v_order.currency<>p_currency
    OR v_order.environment<>p_environment THEN
    RAISE EXCEPTION 'ORDER_PAYMENT_MISMATCH' USING ERRCODE='22023'; END IF;
  IF v_order.status='completed' AND v_order.event_id<>p_event_id THEN
    RAISE EXCEPTION 'ORDER_EVENT_CONFLICT' USING ERRCODE='22023'; END IF;
  v_grant := public.grant_adventure_chest_cash_receipt(v_user_id,p_transaction_id,
    p_event_id,p_price_id,p_amount_minor,p_currency,p_environment);
  IF v_order.status='ready' THEN
    UPDATE app_private.adventure_chest_cash_orders
      SET status='completed',event_id=p_event_id,completed_at=now()
      WHERE id=v_order.id;
  END IF;
  RETURN v_grant || jsonb_build_object('order_id',v_order.id,'user_id',v_user_id);
END $fn$;

CREATE FUNCTION public.lookup_adventure_chest_cash_order(p_transaction_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_order app_private.adventure_chest_cash_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM app_private.adventure_chest_cash_orders
    WHERE transaction_id=p_transaction_id AND environment='live';
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('order_id',v_order.id,'user_id',v_order.user_id,
    'transaction_id',v_order.transaction_id,
    'status',v_order.status,'price_id',v_order.price_id,
    'amount_minor',v_order.amount_minor,'currency',v_order.currency,
    'environment',v_order.environment,'event_id',v_order.event_id);
END $fn$;

REVOKE ALL ON FUNCTION public.get_adventure_chest_cash_checkout_state(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.prepare_adventure_chest_cash_order(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.attach_adventure_chest_cash_transaction(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.finalize_adventure_chest_cash_order(text,text,text,integer,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.lookup_adventure_chest_cash_order(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_adventure_chest_cash_checkout_state(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.prepare_adventure_chest_cash_order(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.attach_adventure_chest_cash_transaction(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_adventure_chest_cash_order(text,text,text,integer,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.lookup_adventure_chest_cash_order(text) TO service_role;

DO $acl$ DECLARE v_role text; BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='app_private.adventure_chest_cash_orders'::regclass
    AND relowner='postgres'::regrole AND relrowsecurity) THEN
    RAISE EXCEPTION 'CHEST_CASH_ORDER_RLS_DRIFT' USING ERRCODE='22023'; END IF;
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_table_privilege(v_role,'app_private.adventure_chest_cash_orders',
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
      OR EXISTS (SELECT 1 FROM pg_attribute a
        WHERE a.attrelid='app_private.adventure_chest_cash_orders'::regclass
          AND a.attnum>0 AND NOT a.attisdropped
          AND has_column_privilege(v_role,a.attrelid,a.attname,
            'SELECT,INSERT,UPDATE,REFERENCES')) THEN
      RAISE EXCEPTION 'CHEST_CASH_ORDER_EFFECTIVE_ACL_DRIFT %',v_role
        USING ERRCODE='22023'; END IF;
  END LOOP;
  IF has_function_privilege('anon','public.prepare_adventure_chest_cash_order(uuid,uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.prepare_adventure_chest_cash_order(uuid,uuid)','EXECUTE')
    OR has_function_privilege('anon','public.get_adventure_chest_cash_checkout_state(uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.get_adventure_chest_cash_checkout_state(uuid)','EXECUTE')
    OR has_function_privilege('anon','public.attach_adventure_chest_cash_transaction(uuid,uuid,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.attach_adventure_chest_cash_transaction(uuid,uuid,text)','EXECUTE')
    OR has_function_privilege('anon','public.finalize_adventure_chest_cash_order(text,text,text,integer,text,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.finalize_adventure_chest_cash_order(text,text,text,integer,text,text)','EXECUTE')
    OR has_function_privilege('anon','public.lookup_adventure_chest_cash_order(text)','EXECUTE')
    OR has_function_privilege('authenticated','public.lookup_adventure_chest_cash_order(text)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.prepare_adventure_chest_cash_order(uuid,uuid)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.attach_adventure_chest_cash_transaction(uuid,uuid,text)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.finalize_adventure_chest_cash_order(text,text,text,integer,text,text)','EXECUTE')
  THEN RAISE EXCEPTION 'CHEST_CASH_ORDER_ACL_DRIFT' USING ERRCODE='22023'; END IF;
END $acl$;
COMMIT;
