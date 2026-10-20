-- Calibrate C4 after boss_auto_entitlements without changing boss identity,
-- rewards, hero power, or any historical entitlement. Fail on SQL drift.
DO $migration$
DECLARE
  v_definition text;
  v_before text := $before$v_enemy := CASE WHEN v_kind = 'boss' THEN least(900, 30 + floor(1.5 * v_stage)::integer)
                    ELSE least(880, 20 + floor(1.5 * v_stage)::integer) END;$before$;
  v_after text := $after$v_enemy := CASE WHEN v_kind = 'boss' THEN least(400, 30 + floor(1.5 * v_stage)::integer)
                    ELSE least(380, 20 + floor(1.5 * v_stage)::integer) END;$after$;
BEGIN
  v_definition := pg_get_functiondef('app_private.sync_auto_adventure()'::regprocedure);
  IF (length(v_definition) - length(replace(v_definition, v_before, '')))
       <> length(v_before)
     OR position('v_boss_id := NULL;' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'unexpected C4 adventure function definition' USING ERRCODE = '22023';
  END IF;
  EXECUTE replace(v_definition, v_before, v_after);
END;
$migration$;
