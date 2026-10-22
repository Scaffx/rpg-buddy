\set ON_ERROR_STOP on
-- Apply only to a disposable clone of the composed pre-fix database.
ALTER TABLE public.adventure_encounters DISABLE ROW LEVEL SECURITY;
SELECT 'GOLD_RANGE_RLS_DRIFT_SEEDED' AS result;
