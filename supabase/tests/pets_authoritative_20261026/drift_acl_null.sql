-- Local adversarial fixture: NULL proacl restores default PUBLIC EXECUTE.
SET allow_system_table_mods = on;
UPDATE pg_proc SET proacl=NULL
WHERE oid='public.buy_pet(text)'::regprocedure;
DO $drift$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc
      WHERE oid='public.buy_pet(text)'::regprocedure AND proacl IS NULL)
     OR NOT has_function_privilege('anon','public.buy_pet(text)','EXECUTE')
  THEN RAISE EXCEPTION 'NULL_ACL_DRIFT_NOT_CREATED'; END IF;
END $drift$;
