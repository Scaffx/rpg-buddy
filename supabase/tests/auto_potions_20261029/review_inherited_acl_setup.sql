\set ON_ERROR_STOP on
-- Local clone only: raw proacl remains unchanged while anon inherits EXECUTE.
GRANT authenticated TO anon;
DO $review$
BEGIN
  IF NOT has_function_privilege('anon','app_private.sync_auto_adventure()','EXECUTE')
  THEN RAISE EXCEPTION 'REVIEW_INHERITED_ACL_FIXTURE_FAILED'; END IF;
  RAISE NOTICE 'REVIEW_INHERITED_ACL_FIXTURE_PASS';
END $review$;
