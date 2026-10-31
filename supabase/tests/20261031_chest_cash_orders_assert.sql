\set ON_ERROR_STOP on
CREATE FUNCTION pg_temp.cash_ok(p_value boolean,p_label text)
RETURNS void LANGUAGE plpgsql AS $$ BEGIN
  IF p_value IS DISTINCT FROM true THEN RAISE EXCEPTION 'CASH_ORDER_ASSERT %',p_label; END IF;
END $$;

SELECT pg_temp.cash_ok(NOT has_table_privilege('anon',
  'app_private.adventure_chest_cash_orders','SELECT,INSERT,UPDATE,DELETE')
  AND NOT has_table_privilege('authenticated',
    'app_private.adventure_chest_cash_orders','SELECT,INSERT,UPDATE,DELETE'),
  'private table ACL');
SELECT pg_temp.cash_ok(NOT has_function_privilege('anon',
  'public.prepare_adventure_chest_cash_order(uuid,uuid)','EXECUTE')
  AND NOT has_function_privilege('authenticated',
    'public.prepare_adventure_chest_cash_order(uuid,uuid)','EXECUTE')
  AND NOT has_function_privilege('authenticated',
    'public.attach_adventure_chest_cash_transaction(uuid,uuid,text)','EXECUTE')
  AND NOT has_function_privilege('authenticated',
    'public.finalize_adventure_chest_cash_order(text,text,text,integer,text,text)','EXECUTE')
  AND has_function_privilege('service_role',
    'public.finalize_adventure_chest_cash_order(text,text,text,integer,text,text)','EXECUTE'),
  'effective RPC ACL');
SELECT pg_temp.cash_ok((SELECT relrowsecurity FROM pg_class
  WHERE oid='app_private.adventure_chest_cash_orders'::regclass),'RLS enabled');

BEGIN;
SET LOCAL ROLE service_role;
SELECT pg_temp.cash_ok((public.get_adventure_chest_cash_checkout_state(
  '11111111-1111-1111-1111-111111111111')->>'ready')::boolean=false,
  'disabled by default');
RESET ROLE;
UPDATE app_private.adventure_chest_cash_config
  SET price_id='pri_aaaaaaaaaaaaaaaaaaaaaaaaaa',enabled=true WHERE singleton=true;
SET LOCAL ROLE service_role;
DO $test$ DECLARE s jsonb; o jsonb; v jsonb;
  uid uuid:='11111111-1111-1111-1111-111111111111';
  rid uuid:='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  tx text:='txn_bbbbbbbbbbbbbbbbbbbbbbbbbb';
  ev text:='evt_dddddddddddddddddddddddddd';
  price text:='pri_aaaaaaaaaaaaaaaaaaaaaaaaaa';
BEGIN
  s:=public.get_adventure_chest_cash_checkout_state(uid);
  PERFORM pg_temp.cash_ok((s->>'ready')::boolean,'gold cap three is ready');
  s:=public.get_adventure_chest_cash_checkout_state(
    '22222222-2222-2222-2222-222222222222');
  PERFORM pg_temp.cash_ok(s->>'reason'='GOLD_UNLOCKS_REQUIRED','gold prerequisite');
  o:=public.prepare_adventure_chest_cash_order(uid,rid);
  PERFORM pg_temp.cash_ok(o->>'status'='creating' AND o->>'replayed'='false',
    'new durable order');
  v:=public.prepare_adventure_chest_cash_order(uid,rid);
  PERFORM pg_temp.cash_ok(v->>'order_id'=o->>'order_id' AND v->>'replayed'='true',
    'same request idempotency');
  v:=public.prepare_adventure_chest_cash_order(uid,
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
  PERFORM pg_temp.cash_ok(v->>'order_id'=o->>'order_id' AND v->>'replayed'='true',
    'different request does not create second active order');
  BEGIN
    PERFORM public.prepare_adventure_chest_cash_order(
      '22222222-2222-2222-2222-222222222222',rid);
    RAISE EXCEPTION 'forged owner accepted';
  EXCEPTION WHEN sqlstate '22023' THEN NULL; END;
  BEGIN
    PERFORM public.attach_adventure_chest_cash_transaction(
      (o->>'order_id')::uuid,'22222222-2222-2222-2222-222222222222',tx);
    RAISE EXCEPTION 'foreign attach accepted';
  EXCEPTION WHEN sqlstate '22023' THEN NULL; END;
  PERFORM public.attach_adventure_chest_cash_transaction((o->>'order_id')::uuid,uid,tx);
  s:=public.get_adventure_chest_cash_checkout_state(uid);
  PERFORM pg_temp.cash_ok(s->>'request_id'=rid::text
    AND s->>'order_status'='ready','ready request can resume on another browser');
  PERFORM pg_temp.cash_ok((public.lookup_adventure_chest_cash_order(tx)->>'user_id')=uid::text,
    'lookup bound to known order');
  BEGIN
    PERFORM public.attach_adventure_chest_cash_transaction((o->>'order_id')::uuid,uid,
      'txn_eeeeeeeeeeeeeeeeeeeeeeeeee');
    RAISE EXCEPTION 'transaction replacement accepted';
  EXCEPTION WHEN sqlstate '22023' THEN NULL; END;
  BEGIN
    PERFORM public.finalize_adventure_chest_cash_order(tx,ev,price,991,'BRL','live');
    RAISE EXCEPTION 'wrong amount accepted';
  EXCEPTION WHEN sqlstate '22023' THEN NULL; END;
  BEGIN
    PERFORM public.finalize_adventure_chest_cash_order(tx,ev,price,990,'USD','live');
    RAISE EXCEPTION 'wrong currency accepted';
  EXCEPTION WHEN sqlstate '22023' THEN NULL; END;
  PERFORM pg_temp.cash_ok(public.lookup_adventure_chest_cash_order(tx)->>'status'='ready',
    'mismatches do not finalize');
  v:=public.finalize_adventure_chest_cash_order(tx,ev,price,990,'BRL','live');
  PERFORM pg_temp.cash_ok(v->>'replayed'='false' AND v->>'user_id'=uid::text,
    'first verified fulfillment');
  v:=public.finalize_adventure_chest_cash_order(tx,ev,price,990,'BRL','live');
  PERFORM pg_temp.cash_ok(v->>'replayed'='true','duplicate delivery');
  BEGIN
    PERFORM public.finalize_adventure_chest_cash_order(tx,
      'evt_ffffffffffffffffffffffffff',price,990,'BRL','live');
    RAISE EXCEPTION 'different event accepted';
  EXCEPTION WHEN sqlstate '22023' THEN NULL; END;
  PERFORM pg_temp.cash_ok(public.lookup_adventure_chest_cash_order(tx)->>'status'='completed',
    'order completed once');
END $test$;
RESET ROLE;
SELECT pg_temp.cash_ok((SELECT count(*)=1 FROM app_private.adventure_chest_cash_receipts
  WHERE transaction_id='txn_bbbbbbbbbbbbbbbbbbbbbbbbbb'
  AND user_id='11111111-1111-1111-1111-111111111111'),'one receipt only');
ROLLBACK;
SELECT pg_temp.cash_ok((SELECT enabled=false FROM app_private.adventure_chest_cash_config)
  AND (SELECT count(*)=0 FROM app_private.adventure_chest_cash_orders),
  'local simulation rolled back');
SELECT 'CHEST_CASH_ORDER_ASSERT_PASS';
