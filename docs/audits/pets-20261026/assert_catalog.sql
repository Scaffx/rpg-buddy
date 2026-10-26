-- Independent immutable catalog contract. Run only after the frozen migration.
BEGIN;
DO $audit$
DECLARE
  v record;
  v_actual jsonb;
BEGIN
  FOR v IN
    SELECT * FROM (VALUES
      ('spirit_fox','mp'),('calopsita','mp'),('mini_necromante','mp'),
      ('mini_leviata','mp'),('golem_guardian','hp'),('mini_kraken','hp'),
      ('dog','hp'),('mini_dragao_sombrio','atk'),('mini_demonio_fome','atk'),
      ('mini_relampago','def'),('mini_wyrm_gelo','def'),('cat','def')
    ) AS expected(companion_type,stat)
  LOOP
    SELECT app_private.adventure_pet_catalog(v.companion_type) INTO v_actual;
    IF v_actual IS DISTINCT FROM jsonb_build_object('stat',v.stat,'pct',0.10) THEN
      RAISE EXCEPTION 'PET_CATALOG_MISMATCH type=% actual=%',v.companion_type,v_actual;
    END IF;
  END LOOP;
  IF app_private.adventure_pet_catalog('unknown') IS NOT NULL
    OR app_private.adventure_pet_catalog(NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'UNKNOWN_PET_HAS_BONUS';
  END IF;
  IF app_private.adventure_pet_sustain('mini_kraken')
       IS DISTINCT FROM '{"kind":"regen_hp","pct":0.05}'::jsonb
    OR app_private.adventure_pet_sustain('mini_necromante')
       IS DISTINCT FROM '{"kind":"regen_mp","pct":0.08}'::jsonb
    OR app_private.adventure_pet_sustain('mini_leviata')
       IS DISTINCT FROM '{"kind":"mp_cost","pct":0.20}'::jsonb
    OR app_private.adventure_pet_sustain('dog') IS NOT NULL
    OR app_private.adventure_pet_sustain('unknown') IS NOT NULL
    OR app_private.adventure_pet_sustain(NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'PET_SUSTAIN_MISMATCH';
  END IF;
  RAISE NOTICE 'PET_CATALOG_12_AND_SUSTAIN_3_PASS';
END $audit$;
ROLLBACK;
