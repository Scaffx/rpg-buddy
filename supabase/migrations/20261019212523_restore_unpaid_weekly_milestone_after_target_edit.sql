-- A5: an edited target can leave an unpaid milestone below the current count.
-- A later eligible completion may settle that debt, once, through the existing
-- public wrapper and its private attribute milestone receipt.
-- No historical balance is recalculated and an UPDATE of the target pays nothing.
DO $preflight$
DECLARE
  v_source text;
  v_definition text;
  v_guard_source text;
  v_old text := E'v_next_weekly_count = v_m.target_count\n    AND NOT v_progress.milestone_paid';
  v_new text := E'v_next_weekly_count >= v_m.target_count\n    AND NOT v_progress.milestone_paid';
  v_old_in_source text;
  v_new_in_source text;
  v_lf_count integer;
  v_crlf_count integer;
BEGIN
  SELECT p.prosrc, pg_get_functiondef(p.oid)
    INTO v_source, v_definition
    FROM pg_proc p
   WHERE p.oid = to_regprocedure('public._complete_mission_with_weekly(uuid,date)')
     AND p.prokind = 'f'
     AND p.prosecdef
     AND p.proconfig = ARRAY['search_path=public']::text[];

  -- The known body may have arrived through an LF or CRLF checkout. Only
  -- normalize paired CRLF for the full-body fingerprint; never trim or ignore
  -- standalone CR, whitespace, comments or any other source difference.
  v_lf_count := (length(v_source) - length(replace(v_source, v_old, ''))) / length(v_old);
  v_crlf_count := (length(v_source) - length(replace(v_source,
    replace(v_old, E'\n', E'\r\n'), ''))) / length(replace(v_old, E'\n', E'\r\n'));
  IF v_source IS NULL
     OR md5(replace(v_source, E'\r\n', E'\n')) <> '79de81c374d61104c0625b4c4eb8c03d'
     OR v_lf_count + v_crlf_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'WEEKLY_MILESTONE_RPC_DRIFT: expected A+B+A3+B4+A4+A5 helper';
  END IF;
  v_old_in_source := CASE WHEN v_crlf_count = 1 THEN replace(v_old, E'\n', E'\r\n') ELSE v_old END;
  v_new_in_source := CASE WHEN v_crlf_count = 1 THEN replace(v_new, E'\n', E'\r\n') ELSE v_new END;

  SELECT p.prosrc INTO v_guard_source
    FROM pg_proc p
   WHERE p.oid = to_regprocedure('public._guard_progression_initial_values()')
     AND p.prokind = 'f'
     AND NOT p.prosecdef
     AND p.proconfig = ARRAY['search_path=public']::text[];
  IF v_guard_source IS NULL
     OR md5(replace(v_guard_source, E'\r\n', E'\n')) <> '4f75688bda580c0d8e69dc354701ba18' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'INITIAL_PROGRESSION_GUARD_DRIFT: expected A guard';
  END IF;

  EXECUTE replace(v_definition, v_old_in_source, v_new_in_source);
  -- PL/pgSQL's NEW record is shaped by TG_RELID. A boolean AND does not
  -- protect a reference to a column absent from the other trigger's table.
  EXECUTE $replace_guard$
    CREATE OR REPLACE FUNCTION public._guard_progression_initial_values()
    RETURNS trigger LANGUAGE plpgsql SET search_path = public
    AS $initial_guard$
    BEGIN
      IF current_user IN ('anon', 'authenticated') THEN
        IF TG_TABLE_NAME = 'profiles' THEN
          IF NEW.total_xp <> 0 OR NEW.xp_today <> 0 OR NEW.level <> 1
             OR NEW.missions_completed <> 0 OR NEW.boss_keys <> 0
             OR NEW.inspired_available OR NEW.inspired_earned_at IS NOT NULL THEN
            RAISE EXCEPTION 'Initial progression values must be server defaults';
          END IF;
        ELSIF TG_TABLE_NAME = 'attributes' THEN
          IF NEW.xp <> 0 OR NEW.level <> 1 THEN
            RAISE EXCEPTION 'Initial attribute progression must be server defaults';
          END IF;
        END IF;
      END IF;
      RETURN NEW;
    END;
    $initial_guard$;
  $replace_guard$;
END;
$preflight$;
