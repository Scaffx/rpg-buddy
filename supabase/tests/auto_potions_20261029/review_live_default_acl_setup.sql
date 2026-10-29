\set ON_ERROR_STOP on
-- Reproduce the read-only live pg_default_acl for new public functions.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;
DO $review$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_default_acl d
    JOIN pg_namespace n ON n.oid=d.defaclnamespace
    WHERE d.defaclrole='postgres'::regrole AND n.nspname='public'
      AND d.defaclobjtype='f' AND d.defaclacl::text LIKE '%service_role=X/postgres%')
  THEN RAISE EXCEPTION 'REVIEW_LIVE_DEFAULT_ACL_FIXTURE_FAILED'; END IF;
  RAISE NOTICE 'REVIEW_LIVE_DEFAULT_ACL_FIXTURE_PASS';
END $review$;
