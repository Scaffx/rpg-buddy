\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.ok(p_ok boolean,p_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF p_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'PET_CARE_ACL: %',p_label; END IF; END $$;
DO $check$
BEGIN
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM (VALUES
    ('public','get_pet_food_catalog'),('public','get_pet_food_purchase_receipt'),
    ('public','buy_pet_food'),('public','interact_pet_care'),('public','get_pet_care_state'),
    ('app_private','settle_pet_care'),('app_private','pet_care_participation'),
    ('app_private','pet_care_snapshot')) expected(s,n)
    JOIN pg_namespace ns ON ns.nspname=expected.s
    LEFT JOIN pg_proc p ON p.pronamespace=ns.oid AND p.proname=expected.n
    GROUP BY expected.s,expected.n HAVING count(p.oid)<>1),'no overloads');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM (VALUES
    ('public.get_pet_food_catalog()'),('public.get_pet_food_purchase_receipt(uuid)'),
    ('public.buy_pet_food(text,integer,uuid)'),('public.interact_pet_care(uuid,text,uuid)'),
    ('public.get_pet_care_state()'),('app_private.settle_pet_care(uuid,timestamptz)'),
    ('app_private.pet_care_participation(uuid,timestamptz)'),
    ('app_private.pet_care_snapshot(jsonb,timestamptz)')) x(sig)
    WHERE has_function_privilege('anon',x.sig,'EXECUTE')),'anon denied');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM (VALUES
    ('app_private.pet_food_catalog'),('app_private.pet_care_state'),
    ('app_private.pet_feed_receipts'),('app_private.pet_care_events'),
    ('app_private.pet_food_purchase_requests')) x(tbl)
    CROSS JOIN (VALUES ('anon'),('authenticated'),('service_role')) r(role_name)
    CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),
      ('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) v(privilege)
    WHERE has_table_privilege(r.role_name,x.tbl,v.privilege)),'private effective table ACL');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM (VALUES
    ('app_private.pet_food_catalog'),('app_private.pet_care_state'),
    ('app_private.pet_feed_receipts'),('app_private.pet_care_events'),
    ('app_private.pet_food_purchase_requests')) x(tbl)
    JOIN pg_class c ON c.oid=x.tbl::regclass
    CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r'::"char",c.relowner))) a
    WHERE a.grantee=0),'private table PUBLIC ACL');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM (VALUES
    ('app_private.pet_care_on_acquisition()'),
    ('app_private.settle_pet_care(uuid,timestamptz)'),
    ('app_private.pet_care_participation(uuid,timestamptz)'),
    ('app_private.pet_care_snapshot(jsonb,timestamptz)')) x(sig)
    CROSS JOIN (VALUES ('anon'),('authenticated'),('service_role')) r(role_name)
    WHERE has_function_privilege(r.role_name,x.sig,'EXECUTE')),'private effective function ACL');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM (VALUES
    ('app_private.pet_care_on_acquisition()'),
    ('app_private.settle_pet_care(uuid,timestamptz)'),
    ('app_private.pet_care_participation(uuid,timestamptz)'),
    ('app_private.pet_care_snapshot(jsonb,timestamptz)')) x(sig)
    JOIN pg_proc p ON p.oid=x.sig::regprocedure
    CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f'::"char",p.proowner))) a
    WHERE a.grantee=0),'private function PUBLIC ACL');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM (VALUES
    ('app_private.pet_food_catalog'),('app_private.pet_care_state'),
    ('app_private.pet_feed_receipts'),('app_private.pet_care_events'),
    ('app_private.pet_food_purchase_requests')) x(tbl)
    JOIN pg_class c ON c.oid=x.tbl::regclass WHERE NOT c.relrowsecurity),'private RLS');
END $check$;

INSERT INTO auth.users(id) VALUES
  ('c0000000-0000-0000-0000-000000000301'),
  ('c0000000-0000-0000-0000-000000000302');
INSERT INTO public.profiles(user_id,level,starter_class)
VALUES('c0000000-0000-0000-0000-000000000301',10,'novato'),
  ('c0000000-0000-0000-0000-000000000302',10,'novato');
INSERT INTO public.user_balance(user_id,balance_percent,gold)
VALUES('c0000000-0000-0000-0000-000000000301',100,100),
  ('c0000000-0000-0000-0000-000000000302',100,100)
ON CONFLICT (user_id) DO UPDATE SET gold=100;
INSERT INTO public.companions(id,user_id,companion_type,origin,name)
VALUES('d0000000-0000-0000-0000-000000000301',
  'c0000000-0000-0000-0000-000000000301','dog','shop','Other');
SET ROLE authenticated;
SET request.jwt.claim.sub='c0000000-0000-0000-0000-000000000302';
DO $test$
BEGIN
  IF public.get_pet_food_catalog()<>'[]'::jsonb THEN RAISE EXCEPTION 'foreign pet visible'; END IF;
  IF public.get_pet_food_purchase_receipt('d0000000-0000-0000-0000-000000000301')->>'found'<>'false'
  THEN RAISE EXCEPTION 'foreign receipt visible'; END IF;
  BEGIN
    PERFORM public.buy_pet_food('dog',1,'d0000000-0000-0000-0000-000000000302');
    RAISE EXCEPTION 'foreign pet buy accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  BEGIN
    PERFORM public.interact_pet_care('d0000000-0000-0000-0000-000000000301','care',
      'd0000000-0000-0000-0000-000000000303');
    RAISE EXCEPTION 'foreign care accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  BEGIN
    UPDATE app_private.pet_care_state SET last_feed_at=clock_timestamp()
      WHERE companion_id='d0000000-0000-0000-0000-000000000301';
    RAISE EXCEPTION 'private write accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'PET_CARE_AUTH_OWNERSHIP_PASS';
END $test$;
RESET ROLE;
GRANT USAGE ON SCHEMA app_private TO authenticated;
SET ROLE authenticated;
DO $truncate_denied$
BEGIN
  BEGIN
    TRUNCATE app_private.pet_food_catalog;
    RAISE EXCEPTION 'PET_CARE_TRUNCATE_ACCEPTED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'PET_CARE_TRUNCATE_DENIED_PASS';
END $truncate_denied$;
RESET ROLE;
DO $catalog_intact$
BEGIN
  IF (SELECT count(*) FROM app_private.pet_food_catalog)<>13 THEN
    RAISE EXCEPTION 'PET_CARE_CATALOG_CHANGED';
  END IF;
END $catalog_intact$;
ROLLBACK;
