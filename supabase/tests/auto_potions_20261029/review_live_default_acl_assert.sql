\set ON_ERROR_STOP on
DO $review$
BEGIN
  IF has_function_privilege('anon','public.get_adventure_auto_potions_state()','EXECUTE')
    OR has_function_privilege('anon','public.set_adventure_auto_potions_enabled(boolean)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.get_adventure_auto_potions_state()','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.set_adventure_auto_potions_enabled(boolean)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.get_adventure_auto_potions_state()','EXECUTE')
    OR NOT has_function_privilege('service_role','public.set_adventure_auto_potions_enabled(boolean)','EXECUTE')
  THEN RAISE EXCEPTION 'REVIEW_LIVE_DEFAULT_ACL_POSTFLIGHT_FAILED'; END IF;
  RAISE NOTICE 'REVIEW_LIVE_DEFAULT_ACL_POSTFLIGHT_PASS service_role_inherited_default=true';
END $review$;
