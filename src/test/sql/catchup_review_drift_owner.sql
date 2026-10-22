-- Expected failure: 22023 ADVENTURE_RECOVERY_SOURCE_OR_METADATA_DRIFT.
-- Run with ON_ERROR_STOP=1 against catchup_review_base. Disconnect rolls back.
BEGIN;
ALTER FUNCTION public.sync_auto_adventure() OWNER TO authenticated;
\ir ../../../supabase/migrations/20261022013316_adventure_catchup_retreat.sql
ROLLBACK;
