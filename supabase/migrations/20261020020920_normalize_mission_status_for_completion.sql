-- BUG32: live missions.status is nullable without a default. The form omitted
-- status, while complete_mission requires an active status before any payout.
-- Apply after 20261019222715; leave historical failed/completed rows untouched.
DO $preflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.missions'::regclass AND attname = 'status'
      AND atttypid = 'pg_catalog.text'::regtype AND NOT attisdropped
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.missions'::regclass AND attname = 'completed'
      AND atttypid = 'pg_catalog.bool'::regtype AND attnotnull AND NOT attisdropped
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.missions'::regclass AND attname = 'is_failed'
      AND atttypid = 'pg_catalog.bool'::regtype AND attnotnull AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'MISSION_STATUS_SCHEMA_DRIFT';
  END IF;
  IF pg_catalog.to_regprocedure('public.complete_mission(uuid,date)') IS NULL
     OR pg_catalog.to_regprocedure('public.undo_mission(uuid,date)') IS NULL
     OR pg_catalog.to_regprocedure('private.enforce_mission_priority()') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_proc p
       WHERE p.oid = 'public.undo_mission(uuid,date)'::regprocedure
         AND p.prosecdef
         AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
     )
     OR pg_catalog.strpos(pg_catalog.pg_get_functiondef(
       'public.complete_mission(uuid,date)'::regprocedure), 'MISSION_NOT_ACTIVE') = 0
     OR pg_catalog.strpos(pg_catalog.pg_get_functiondef(
       'private.enforce_mission_priority()'::regprocedure), 'MISSION_PRIORITY_PAID_CAP') = 0
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_trigger t
       JOIN pg_catalog.pg_proc p ON p.oid = t.tgfoid
       WHERE t.tgrelid = 'public.missions'::regclass
         AND t.tgname = 'enforce_mission_priority'
         AND t.tgenabled IN ('O', 'A') AND t.tgtype = 31
         AND NOT t.tgisinternal
         AND t.tgfoid = 'private.enforce_mission_priority()'::regprocedure
         AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres' AND p.prosecdef
     )
     OR pg_catalog.to_regprocedure('private.lock_mission_priority_statement()') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_trigger t
       JOIN pg_catalog.pg_proc p ON p.oid = t.tgfoid
       WHERE t.tgrelid = 'public.missions'::regclass
         AND t.tgname = 'lock_mission_priority_statement'
         AND t.tgenabled IN ('O', 'A') AND t.tgtype = 30
         AND NOT t.tgisinternal
         AND t.tgfoid = 'private.lock_mission_priority_statement()'::regprocedure
         AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres' AND NOT p.prosecdef
     ) THEN
    RAISE EXCEPTION 'MISSION_STATUS_GUARD_DRIFT';
  END IF;
  IF current_user <> 'postgres'
     OR (SELECT pg_catalog.pg_get_userbyid(relowner)
         FROM pg_catalog.pg_class WHERE oid='public.missions'::regclass) <> 'postgres'
     OR (SELECT pg_catalog.pg_get_userbyid(nspowner)
         FROM pg_catalog.pg_namespace WHERE oid='private'::regnamespace) <> 'postgres'
     OR pg_catalog.to_regprocedure('private.normalize_mission_status()') IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_trigger
       WHERE tgrelid='public.missions'::regclass
         AND tgname='before_mission_status_normalize'
     ) THEN
    RAISE EXCEPTION 'MISSION_STATUS_OBJECT_DRIFT';
  END IF;
END;
$preflight$;

ALTER TABLE public.missions ALTER COLUMN status SET DEFAULT 'pendente';

-- Runs alphabetically before enforce_mission_priority, so explicit NULL cannot
-- hide a newly active mission from its scheduled-slot and paid-grant checks.
CREATE FUNCTION private.normalize_mission_status()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $normalize$
BEGIN
  IF NEW.status IS NOT NULL OR NEW.completed IS NOT FALSE
     OR NEW.is_failed IS NOT FALSE THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'pendente';
    RETURN NEW;
  END IF;

  IF (OLD.completed IS FALSE AND OLD.is_failed IS FALSE
      AND COALESCE(OLD.status, 'pendente') IN
        ('pendente', 'em_progresso', 'em_andamento'))
     OR (current_user = 'postgres' AND OLD.status IS NULL AND OLD.is_failed IS FALSE
         AND OLD.completed IS TRUE AND NEW.completed IS FALSE) THEN
    NEW.status := 'pendente';
    RETURN NEW;
  END IF;

  -- Undo of a completed legacy unique row above is allowed only under its
  -- SECURITY DEFINER owner. Recovery of failed NULL rows must name 'pendente'
  -- explicitly; clearing is_failed alone cannot reactivate them.
  RAISE EXCEPTION 'MISSION_STATUS_REQUIRED' USING ERRCODE = '23514';
END;
$normalize$;
REVOKE ALL ON FUNCTION private.normalize_mission_status() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER before_mission_status_normalize
BEFORE INSERT OR UPDATE ON public.missions
FOR EACH ROW EXECUTE FUNCTION private.normalize_mission_status();

-- These rows were already treated as active by the priority-slot counter.
-- Preserve status NULL for every failed or completed historical row.
DO $backfill$
DECLARE v_rows integer;
BEGIN
  UPDATE public.missions SET status = 'pendente'
  WHERE status IS NULL AND completed IS FALSE AND is_failed IS FALSE;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RAISE NOTICE 'MISSION_STATUS_ACTIVE_BACKFILL: %', v_rows;
END;
$backfill$;
