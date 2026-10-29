\set ON_ERROR_STOP on
REVOKE authenticated FROM anon;
DO $review$
BEGIN
  IF has_function_privilege('anon','app_private.sync_auto_adventure()','EXECUTE')
  THEN RAISE EXCEPTION 'REVIEW_INHERITED_ACL_TEARDOWN_FAILED'; END IF;
  RAISE NOTICE 'REVIEW_INHERITED_ACL_TEARDOWN_PASS';
END $review$;
