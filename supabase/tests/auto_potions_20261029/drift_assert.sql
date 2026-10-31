\set ON_ERROR_STOP on
DO $test$
BEGIN
  IF to_regclass('app_private.adventure_auto_potion_selection') IS NOT NULL
    OR to_regclass('app_private.adventure_auto_potion_receipts') IS NOT NULL
    OR to_regprocedure('app_private.adventure_simulate_horde_potions(timestamptz,integer,integer,integer,integer,jsonb,jsonb,text,integer,jsonb,jsonb,jsonb)') IS NOT NULL
    OR to_regprocedure('public.get_adventure_auto_potions_state()') IS NOT NULL
    OR to_regprocedure('public.set_adventure_auto_potions_enabled(boolean)') IS NOT NULL THEN
    RAISE EXCEPTION 'AUTO_POTION_PARTIAL_DRIFT_APPLY'; END IF;
  RAISE NOTICE 'AUTO_POTIONS_DRIFT_ATOMIC_PASS';
END $test$;
