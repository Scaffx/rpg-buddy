\set ON_ERROR_STOP on
-- Apply only to a disposable clone of the composed pre-fix database.
ALTER TABLE public.adventure_encounters
  DROP CONSTRAINT adventure_encounters_gold_check;
ALTER TABLE public.adventure_encounters
  ADD CONSTRAINT adventure_encounters_gold_check CHECK (gold BETWEEN 0 AND 13);
SELECT 'GOLD_RANGE_CHECK_DRIFT_SEEDED' AS result;
