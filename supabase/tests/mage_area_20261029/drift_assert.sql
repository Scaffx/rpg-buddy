\set ON_ERROR_STOP on
DO $assert$
BEGIN
  IF md5(replace(pg_get_functiondef('app_private.sync_auto_adventure()'::regprocedure),
      chr(13)||chr(10),chr(10)))<>'b2f065b8720f8a91f0d0d42262c87e06'
    OR (SELECT pg_get_constraintdef(oid) FROM pg_constraint
      WHERE conrelid='app_private.adventure_battles'::regclass
        AND conname='adventure_battles_engine_version_check')<>
      'CHECK ((engine_version = ANY (ARRAY[''v3''::text, ''v4_horde''::text])))'
  THEN RAISE EXCEPTION 'MAGE_DRIFT_PARTIAL_APPLICATION'; END IF;
  RAISE NOTICE 'MAGE_DRIFT_ATOMIC_PASS';
END $assert$;
