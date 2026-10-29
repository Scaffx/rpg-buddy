\set ON_ERROR_STOP on
-- Exact read-only production source captured on 2026-10-29. Local clone only.
-- LF MD5 of pg_get_functiondef: 758fca4a260de7aea24758c03b9ffafd.
\i C:/Users/Murillo/Documents/Codex/2026-10-15/seguinte-dentro-do-sistema-de-rpg/work/mago-area-20261029/consume-inventory-live-readonly.sql
REVOKE ALL ON FUNCTION public.consume_inventory_item(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.consume_inventory_item(uuid) TO authenticated,service_role;
DO $review$
DECLARE v_proc oid:=to_regprocedure('public.consume_inventory_item(uuid)');
BEGIN
  IF v_proc IS NULL
    OR md5(replace(pg_get_functiondef(v_proc),chr(13)||chr(10),chr(10)))
       <> '758fca4a260de7aea24758c03b9ffafd'
    OR (SELECT p.proowner FROM pg_proc p WHERE p.oid=v_proc)<>'postgres'::regrole
    OR has_function_privilege('anon',v_proc,'EXECUTE')
    OR NOT has_function_privilege('authenticated',v_proc,'EXECUTE')
  THEN RAISE EXCEPTION 'REVIEW_LIVE_CONSUMER_SOURCE_DRIFT'; END IF;
  RAISE NOTICE 'REVIEW_LIVE_CONSUMER_SOURCE_PASS';
END $review$;
