-- Cluster-local inherited privileges can change effective ACL without proacl drift.
GRANT authenticated TO anon;
DO $drift$
BEGIN
  IF NOT has_function_privilege('anon','public.buy_pet(text)','EXECUTE')
  THEN RAISE EXCEPTION 'ROLE_MEMBERSHIP_DRIFT_NOT_CREATED'; END IF;
END $drift$;
