-- Use with psql -1 -f this_file -f <A6 migration> on a fresh pre-A6 DB.
-- A lone CR is not CRLF transport normalization and must fail the fingerprint.
DO $audit$
DECLARE v_definition text;
BEGIN
  SELECT pg_get_functiondef('public._complete_mission_with_weekly(uuid,date)'::regprocedure)
    INTO v_definition;
  IF position('v_next_weekly_count = v_m.target_count' IN v_definition)=0 THEN
    RAISE EXCEPTION 'Audit setup: weekly comparison not found';
  END IF;
  EXECUTE replace(v_definition,
    'v_next_weekly_count = v_m.target_count',
    'v_next_weekly_count' || chr(13) || ' = v_m.target_count');
  RAISE NOTICE 'AUDIT_A6_STRAY_CR_INJECTED: standalone CR before comparison';
END;
$audit$;
