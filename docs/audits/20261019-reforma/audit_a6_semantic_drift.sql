-- Use with psql -1 -f this_file -f <A6 migration> against a pre-A6 local DB.
-- The A6 migration must reject this one-operator semantic change and roll back.
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
    'v_next_weekly_count > v_m.target_count');
  RAISE NOTICE 'AUDIT_A6_DRIFT_INJECTED: = changed to > in weekly helper';
END;
$audit$;
