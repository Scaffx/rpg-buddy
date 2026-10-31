\set ON_ERROR_STOP on
DO $test$
BEGIN
  IF has_function_privilege('anon','public.get_adventure_auto_potions_state()','EXECUTE')
    OR has_function_privilege('anon','public.set_adventure_auto_potions_enabled(boolean)','EXECUTE')
    OR has_function_privilege('authenticated',
      'app_private.adventure_simulate_horde_potions(timestamptz,integer,integer,integer,integer,jsonb,jsonb,text,integer,jsonb,jsonb,jsonb)','EXECUTE')
    OR has_table_privilege('authenticated','app_private.adventure_auto_potion_receipts','SELECT')
    OR has_table_privilege('authenticated','app_private.adventure_auto_potion_selection','SELECT')
    OR NOT has_function_privilege('authenticated','public.get_adventure_auto_potions_state()','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.set_adventure_auto_potions_enabled(boolean)','EXECUTE') THEN
    RAISE EXCEPTION 'AUTO_POTION_ACL'; END IF;
  RAISE NOTICE 'AUTO_POTIONS_ACL_PASS';
END $test$;
SET ROLE authenticated;
SET request.jwt.claim.sub='';
DO $test$
BEGIN
  BEGIN
    PERFORM public.get_adventure_auto_potions_state();
    RAISE EXCEPTION 'ANON_IDENTITY_WAS_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '28000' THEN
    RAISE NOTICE 'AUTO_POTIONS_AUTH_REQUIRED_PASS';
  END;
END $test$;
RESET ROLE;
SET ROLE anon;
DO $test$
BEGIN
  BEGIN
    PERFORM public.get_adventure_auto_potions_state();
    RAISE EXCEPTION 'ANON_EXECUTE_WAS_ACCEPTED';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'AUTO_POTIONS_ANON_DENIED_PASS';
  END;
END $test$;
RESET ROLE;
