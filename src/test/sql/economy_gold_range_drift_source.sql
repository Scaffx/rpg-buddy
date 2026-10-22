\set ON_ERROR_STOP on
-- Apply only to a disposable clone of the composed pre-fix database.
CREATE OR REPLACE FUNCTION app_private.sync_auto_adventure()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$ BEGIN RETURN '{}'::jsonb; END $$;
SELECT 'GOLD_RANGE_SOURCE_DRIFT_SEEDED' AS result;
