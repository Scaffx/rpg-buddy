-- Pair with the A6 migration in a single psql -1 invocation. The expected
-- migration error rolls this artificial source mutation back as well.
DO $probe$
DECLARE
  v_definition text;
  v_modified text;
  v_target text := 'v_next_weekly_count = v_m.target_count';
BEGIN
  SELECT pg_get_functiondef(to_regprocedure('public._complete_mission_with_weekly(uuid,date)'))
    INTO v_definition;
  IF current_setting('test.a6_probe', true) = 'lone_cr' THEN
    v_modified := replace(v_definition, v_target, v_target || chr(13) || ' ');
  ELSE
    v_modified := replace(v_definition, v_target, v_target || ' /* real drift */');
  END IF;
  IF v_modified = v_definition THEN
    RAISE EXCEPTION 'A6 probe target absent';
  END IF;
  EXECUTE v_modified;
END;
$probe$;
