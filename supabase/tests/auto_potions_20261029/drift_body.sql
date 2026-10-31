\set ON_ERROR_STOP on
DO $drift$
DECLARE source text;
BEGIN
  source:=pg_get_functiondef('app_private.adventure_simulate_horde(timestamptz,integer,integer,integer,integer,jsonb,jsonb,text,integer,jsonb)'::regprocedure);
  IF (length(source)-length(replace(source,'  v_events jsonb[]:=ARRAY[]::jsonb[];','')))
      <>length('  v_events jsonb[]:=ARRAY[]::jsonb[];') THEN
    RAISE EXCEPTION 'AUTO_POTION_DRIFT_TEST_SOURCE_CHANGED'; END IF;
  EXECUTE replace(source,'  v_events jsonb[]:=ARRAY[]::jsonb[];',
    '  v_events jsonb[]:=ARRAY[]::jsonb[]; -- local drift probe');
END $drift$;
