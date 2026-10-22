-- Run with ON_ERROR_STOP=1 against untouched catchup_review_base.
BEGIN;
\ir ../../../supabase/migrations/20261022013316_adventure_catchup_retreat.sql
DO $$ BEGIN
  IF pg_get_functiondef('app_private.sync_auto_adventure()'::regprocedure)
       NOT LIKE '%FOR batch IN 1..256 LOOP%'
    OR pg_get_functiondef('app_private.sync_auto_adventure()'::regprocedure)
       NOT LIKE '%v_state.stage := greatest(1,v_battle.stage-1)%' THEN
    RAISE EXCEPTION 'CATCHUP_REVIEW: migration body missing';
  END IF;
END $$;
SELECT 'CATCHUP_REVIEW_PREFLIGHT_PASS' AS result;
ROLLBACK;
