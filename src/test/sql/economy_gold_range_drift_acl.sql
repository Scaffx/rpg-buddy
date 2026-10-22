\set ON_ERROR_STOP on
-- Apply only to a disposable clone of the composed pre-fix database.
GRANT UPDATE ON public.adventure_encounters TO authenticated;
SELECT 'GOLD_RANGE_ACL_DRIFT_SEEDED' AS result;
