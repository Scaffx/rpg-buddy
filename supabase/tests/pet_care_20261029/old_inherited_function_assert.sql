\set ON_ERROR_STOP on
DO $old_acl$
BEGIN
  IF NOT has_function_privilege('authenticated',
      'app_private.pet_care_snapshot(jsonb,timestamptz)','EXECUTE') THEN
    RAISE EXCEPTION 'OLD_FUNCTION_INHERITANCE_MISSING';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
      WHERE p.oid='app_private.pet_care_snapshot(jsonb,timestamptz)'::regprocedure
        AND a.grantee='authenticated'::regrole) THEN
    RAISE EXCEPTION 'OLD_FUNCTION_DIRECT_GRANT_PRESENT';
  END IF;
  RAISE NOTICE 'OLD_PRIVATE_FUNCTION_INHERITED_EXECUTE_PRESENT';
END $old_acl$;
SET ROLE authenticated;
SELECT app_private.pet_care_snapshot(NULL::jsonb,clock_timestamp()) IS NULL
  AS inherited_private_function_callable;
RESET ROLE;
