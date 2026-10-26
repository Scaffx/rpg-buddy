-- Adversarial catalog state: NULL proacl restores function-default PUBLIC EXECUTE.
-- Local clone only. This cannot be produced by a normal GRANT on an existing
-- explicit ACL, so the superuser changes the catalog to exercise NULL logic.
SET allow_system_table_mods = on;
UPDATE pg_proc SET proacl=NULL
WHERE oid='public.buy_pet(text)'::regprocedure;
DO $audit$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.buy_pet(text)'::regprocedure
    AND proacl IS NULL)
    OR NOT has_function_privilege('anon','public.buy_pet(text)','EXECUTE')
  THEN RAISE EXCEPTION 'NULL_ACL_DRIFT_NOT_CREATED'; END IF;
END $audit$;
