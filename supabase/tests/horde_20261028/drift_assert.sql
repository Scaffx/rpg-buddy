\set ON_ERROR_STOP on
DO $assert$
BEGIN
  IF to_regprocedure('app_private.adventure_simulate_horde(timestamptz,integer,integer,integer,integer,jsonb,jsonb,text,integer,jsonb)') IS NOT NULL
    OR (SELECT pg_get_constraintdef(k.oid)
      FROM pg_constraint k WHERE k.conrelid='app_private.adventure_battles'::regclass
        AND k.conname='adventure_battles_engine_version_check')
      <> 'CHECK ((engine_version = ''v3''::text))'
  THEN RAISE EXCEPTION 'HORDE_DRIFT_MUTATED_SCHEMA'; END IF;
END $assert$;
