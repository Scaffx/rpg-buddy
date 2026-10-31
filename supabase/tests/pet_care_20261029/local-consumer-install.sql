\set ON_ERROR_STOP on
-- Frozen local copy of the read-only consumer capture used by the potion review.
\ir local-consumer-source.sql
REVOKE ALL ON FUNCTION public.consume_inventory_item(uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.consume_inventory_item(uuid)
  TO authenticated,service_role;
DO $guard$
BEGIN
  IF md5(replace(pg_get_functiondef('public.consume_inventory_item(uuid)'::regprocedure),
      chr(13)||chr(10),chr(10)))<>'758fca4a260de7aea24758c03b9ffafd'
  THEN RAISE EXCEPTION 'LOCAL_CONSUMER_SOURCE_DRIFT'; END IF;
END $guard$;
