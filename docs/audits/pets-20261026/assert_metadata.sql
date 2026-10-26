-- Independent public/private surface check on the composed PostgreSQL 17 fixture.
BEGIN;
DO $audit$
DECLARE
  v_table regclass;
  v_function regprocedure;
BEGIN
  IF (SELECT count(*) FROM app_private.adventure_pet_rollout)<>1
    OR (SELECT global_enabled FROM app_private.adventure_pet_rollout WHERE singleton)
    OR EXISTS(SELECT 1 FROM app_private.adventure_pet_allowlist)
  THEN RAISE EXCEPTION 'PET_GATE_NOT_DARK'; END IF;

  FOREACH v_table IN ARRAY ARRAY[
    'app_private.adventure_pet_rollout'::regclass,
    'app_private.adventure_pet_allowlist'::regclass,
    'app_private.adventure_pet_selection'::regclass] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=v_table)
      OR has_table_privilege('anon',v_table,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
      OR has_table_privilege('authenticated',v_table,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
      OR EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=v_table
        AND a.attnum>0 AND NOT a.attisdropped AND
        (has_column_privilege('anon',v_table,a.attname,'INSERT,UPDATE')
        OR has_column_privilege('authenticated',v_table,a.attname,'INSERT,UPDATE')))
    THEN RAISE EXCEPTION 'PET_PRIVATE_SURFACE_LEAK: %',v_table; END IF;
  END LOOP;

  FOREACH v_function IN ARRAY ARRAY[
    'app_private.adventure_pet_catalog(text)'::regprocedure,
    'app_private.adventure_pet_sustain(text)'::regprocedure,
    'app_private.adventure_pet_at(uuid,timestamptz)'::regprocedure,
    'app_private.adventure_simulate_v3(timestamptz,integer,integer,integer,integer,integer,integer,jsonb,jsonb,text,integer,jsonb)'::regprocedure] LOOP
    IF has_function_privilege('anon',v_function,'EXECUTE')
      OR has_function_privilege('authenticated',v_function,'EXECUTE')
    THEN RAISE EXCEPTION 'PET_HELPER_EXECUTE_LEAK: %',v_function; END IF;
  END LOOP;

  IF has_function_privilege('anon','public.get_adventure_pet_state()','EXECUTE')
    OR has_function_privilege('anon','public.set_active_adventure_pet(uuid)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.get_adventure_pet_state()','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.set_active_adventure_pet(uuid)','EXECUTE')
    OR has_table_privilege('anon','public.companions','INSERT')
    OR has_table_privilege('authenticated','public.companions','INSERT')
    OR EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid='public.companions'::regclass
      AND a.attnum>0 AND NOT a.attisdropped AND
      (has_column_privilege('anon',a.attrelid,a.attname,'INSERT')
      OR has_column_privilege('authenticated',a.attrelid,a.attname,'INSERT')))
  THEN RAISE EXCEPTION 'PET_PUBLIC_SURFACE_MISMATCH'; END IF;

  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='get_adventure_pet_state')<>1
    OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='set_active_adventure_pet')<>1
    OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='app_private' AND p.proname='adventure_simulate_v3')<>2
  THEN RAISE EXCEPTION 'PET_FUNCTION_OVERLOAD_MISMATCH'; END IF;

  IF NOT EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conrelid='app_private.adventure_pet_selection'::regclass
    AND c.confrelid='public.companions'::regclass AND c.confdeltype='n')
    OR NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid='public.companions'::regclass
      AND t.tgname='guard_inventory_forage_pet' AND t.tgenabled='O'
      AND t.tgfoid='public._guard_inventory_forage_pet()'::regprocedure)
    OR NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid='public.companions'::regclass
      AND t.tgname='record_inventory_forage_pet' AND t.tgenabled='O'
      AND t.tgfoid='public._record_inventory_forage_pet()'::regprocedure)
  THEN RAISE EXCEPTION 'PET_BINDING_MISMATCH'; END IF;
  RAISE NOTICE 'PET_METADATA_ACL_BINDING_PASS';
END $audit$;
ROLLBACK;
