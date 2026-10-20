-- B4: serialize authenticated writes before PostgreSQL obtains mission row locks.
-- RPC complete_mission/undo_mission use the same (hashtext(uid), 20261019) key.
-- Auth-null privileged maintenance is intentionally outside this per-user protocol;
-- run it offline or set a trusted auth context before concurrent mission writes.
CREATE OR REPLACE FUNCTION private.lock_mission_priority_statement()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_uid::text), 20261019);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.lock_mission_priority_statement() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS lock_mission_priority_statement ON public.missions;
CREATE TRIGGER lock_mission_priority_statement
BEFORE INSERT OR UPDATE OR DELETE ON public.missions
FOR EACH STATEMENT EXECUTE FUNCTION private.lock_mission_priority_statement();

-- Paid days are durable distinct grant reservations. Undo reverses XP through
-- the RPC ledger but keeps this reservation, so undo/delete/recreate cannot
-- manufacture another high/medium grant in the same day. A same-mission redo
-- after undo may reuse its reservation.
CREATE OR REPLACE FUNCTION private.enforce_mission_priority()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_row public.missions;
  v_priority text;
  v_cap integer;
  v_day date;
  v_dow integer;
  v_count integer;
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_recurring boolean;
  v_entry record;
  v_old_status jsonb;
BEGIN
  v_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  IF TG_OP = 'UPDATE' AND OLD.user_id IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'MISSION_OWNER_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> v_row.user_id THEN
    RAISE EXCEPTION 'MISSION_OWNER_MISMATCH' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;

  NEW.xp_reward := 25;
  v_priority := private.mission_priority_key(NEW.priority);
  v_recurring := NEW.frequency_type = 'weekly' OR CASE
    WHEN pg_catalog.jsonb_typeof(NEW.days_of_week) = 'array'
    THEN pg_catalog.jsonb_array_length(NEW.days_of_week) > 0
    ELSE false END;

  -- Keep B's scheduled-slot guard. Edits to legacy over-cap rows that do not
  -- change a slot stay possible; taking a new slot must pass the guard.
  IF TG_OP = 'INSERT' OR
     (TG_OP = 'UPDATE' AND (
       NEW.priority IS DISTINCT FROM OLD.priority OR
       NEW.days_of_week IS DISTINCT FROM OLD.days_of_week OR
       NEW.due_date IS DISTINCT FROM OLD.due_date OR
       NEW.frequency_type IS DISTINCT FROM OLD.frequency_type OR
       (OLD.completed AND NOT NEW.completed) OR
       (OLD.status = 'arquivada' AND NEW.status <> 'arquivada')
     )) THEN
    IF v_priority IN ('alta', 'media') AND NOT NEW.completed
       AND COALESCE(NEW.status, '') <> 'arquivada' THEN
      v_cap := CASE v_priority WHEN 'alta' THEN 4 ELSE 8 END;
      IF NEW.frequency_type NOT IN ('daily', 'weekly') OR
         (NEW.frequency_type <> 'weekly' AND
          (NEW.days_of_week IS NULL OR pg_catalog.jsonb_typeof(NEW.days_of_week) <> 'array')) THEN
        RAISE EXCEPTION 'MISSION_SCHEDULE_INVALID' USING ERRCODE = '23514';
      END IF;
      IF NEW.frequency_type = 'daily' AND EXISTS (
        SELECT 1 FROM pg_catalog.jsonb_array_elements_text(NEW.days_of_week) d(value)
        WHERE d.value IS NULL OR lower(replace(d.value, 'á', 'a')) NOT IN
          ('dom','seg','ter','qua','qui','sex','sab')
      ) THEN
        RAISE EXCEPTION 'MISSION_SCHEDULE_INVALID' USING ERRCODE = '23514';
      END IF;
      IF NOT v_recurring AND NEW.due_date IS NULL THEN
        RAISE EXCEPTION 'MISSION_SCHEDULE_INVALID' USING ERRCODE = '23514';
      END IF;

      IF v_recurring THEN
        FOR v_dow IN 0..6 LOOP
          v_day := v_today + ((v_dow - extract(dow FROM v_today)::int + 7) % 7);
          IF private.mission_priority_occurs_on(NEW, v_day) THEN
            SELECT count(*) INTO v_count FROM public.missions m
            WHERE m.user_id = NEW.user_id AND m.id <> NEW.id
              AND private.mission_priority_key(m.priority) = v_priority
              AND NOT m.completed AND COALESCE(m.status, '') <> 'arquivada'
              AND (m.frequency_type = 'weekly' OR CASE
                   WHEN pg_catalog.jsonb_typeof(m.days_of_week) = 'array'
                   THEN pg_catalog.jsonb_array_length(m.days_of_week) > 0
                   ELSE false END)
              AND private.mission_priority_occurs_on(m, v_day);
            IF v_count >= v_cap THEN
              RAISE EXCEPTION 'MISSION_PRIORITY_CAP:%:%:%', v_priority, v_day, v_cap USING ERRCODE = '23514';
            END IF;
          END IF;
        END LOOP;
      END IF;

      FOR v_day IN
        SELECT NEW.due_date WHERE NOT v_recurring
        UNION
        SELECT m.due_date FROM public.missions m
        WHERE v_recurring AND m.user_id = NEW.user_id AND m.due_date >= v_today - 1
          AND m.due_date IS NOT NULL AND m.frequency_type <> 'weekly'
          AND CASE WHEN pg_catalog.jsonb_typeof(m.days_of_week) = 'array'
                   THEN pg_catalog.jsonb_array_length(m.days_of_week) = 0
                   ELSE true END
        UNION
        SELECT p.day FROM private.mission_priority_paid_days p
        WHERE v_recurring AND p.user_id = NEW.user_id AND p.day >= v_today - 1
        UNION SELECT v_today WHERE v_recurring
        UNION SELECT v_today - 1 WHERE v_recurring
      LOOP
        IF v_day IS NULL OR NOT private.mission_priority_occurs_on(NEW, v_day) THEN CONTINUE; END IF;
        SELECT count(DISTINCT slot.mission_id) INTO v_count FROM (
          SELECT m.id AS mission_id FROM public.missions m
          WHERE m.user_id = NEW.user_id AND m.id <> NEW.id
            AND private.mission_priority_key(m.priority) = v_priority
            AND NOT m.completed AND COALESCE(m.status, '') <> 'arquivada'
            AND private.mission_priority_occurs_on(m, v_day)
          UNION ALL
          SELECT p.mission_id FROM private.mission_priority_paid_days p
          WHERE p.user_id = NEW.user_id AND p.mission_id <> NEW.id
            AND p.priority = v_priority AND p.day = v_day
        ) slot;
        IF v_count >= v_cap THEN
          RAISE EXCEPTION 'MISSION_PRIORITY_CAP:%:%:%', v_priority, v_day, v_cap USING ERRCODE = '23514';
        END IF;
      END LOOP;
    END IF;
  END IF;

  -- A new completed daily_status entry is the grant event for recurring
  -- missions. Existing entries do not become a second grant on edit,
  -- reclassification, archive, or deletion.
  IF NEW.daily_status IS NOT NULL AND
     pg_catalog.jsonb_typeof(NEW.daily_status) <> 'object' THEN
    RAISE EXCEPTION 'MISSION_DAILY_STATUS_INVALID' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.daily_status IS NOT NULL AND
     pg_catalog.jsonb_typeof(OLD.daily_status) <> 'object' THEN
    RAISE EXCEPTION 'MISSION_DAILY_STATUS_INVALID' USING ERRCODE = '23514';
  END IF;
  FOR v_entry IN
    SELECT d.key, d.value
    FROM pg_catalog.jsonb_each_text(COALESCE(NEW.daily_status, '{}'::jsonb)) d
    WHERE d.value = 'completed'
  LOOP
    v_old_status := CASE WHEN TG_OP = 'UPDATE'
      THEN OLD.daily_status -> v_entry.key ELSE NULL END;
    IF v_old_status = '"completed"'::jsonb THEN CONTINUE; END IF;
    IF v_entry.key !~ '^\d{4}-\d{2}-\d{2}$' OR
       NOT pg_catalog.pg_input_is_valid(v_entry.key, 'date') THEN
      RAISE EXCEPTION 'MISSION_COMPLETION_DATE_INVALID' USING ERRCODE = '23514';
    END IF;
    v_day := v_entry.key::date;
    IF COALESCE(NEW.status, '') = 'arquivada' OR NEW.completed THEN
      RAISE EXCEPTION 'MISSION_NOT_ACTIVE' USING ERRCODE = '23514';
    END IF;
    IF NOT private.mission_priority_occurs_on(NEW, v_day) THEN
      RAISE EXCEPTION 'MISSION_NOT_SCHEDULED:%', v_day USING ERRCODE = '23514';
    END IF;
    IF v_priority IN ('alta', 'media') THEN
      v_cap := CASE v_priority WHEN 'alta' THEN 4 ELSE 8 END;
      IF NOT EXISTS (
        SELECT 1 FROM private.mission_priority_paid_days p
        WHERE p.user_id = NEW.user_id AND p.mission_id = NEW.id
          AND p.priority = v_priority AND p.day = v_day
      ) THEN
        SELECT count(DISTINCT p.mission_id) INTO v_count
        FROM private.mission_priority_paid_days p
        WHERE p.user_id = NEW.user_id AND p.priority = v_priority AND p.day = v_day;
        IF v_count >= v_cap THEN
          RAISE EXCEPTION 'MISSION_PRIORITY_PAID_CAP:%:%:%', v_priority, v_day, v_cap USING ERRCODE = '23514';
        END IF;
        INSERT INTO private.mission_priority_paid_days (user_id, mission_id, priority, day)
        VALUES (NEW.user_id, NEW.id, v_priority, v_day);
      END IF;
    END IF;
  END LOOP;

  -- The ordinary archive action sets completed=true and status=arquivada;
  -- it must not consume a grant. Single missions credit their due_date only
  -- on a non-archived false->true completion transition.
  IF TG_OP = 'UPDATE' AND NOT v_recurring AND NEW.completed AND
     NOT OLD.completed AND
     COALESCE(NEW.status, '') <> 'arquivada' THEN
    IF NEW.due_date IS NULL THEN
      RAISE EXCEPTION 'MISSION_SCHEDULE_INVALID' USING ERRCODE = '23514';
    END IF;
    IF v_priority IN ('alta', 'media') THEN
      v_cap := CASE v_priority WHEN 'alta' THEN 4 ELSE 8 END;
      IF NOT EXISTS (
        SELECT 1 FROM private.mission_priority_paid_days p
        WHERE p.user_id = NEW.user_id AND p.mission_id = NEW.id
          AND p.priority = v_priority AND p.day = NEW.due_date
      ) THEN
        SELECT count(DISTINCT p.mission_id) INTO v_count
        FROM private.mission_priority_paid_days p
        WHERE p.user_id = NEW.user_id AND p.priority = v_priority AND p.day = NEW.due_date;
        IF v_count >= v_cap THEN
          RAISE EXCEPTION 'MISSION_PRIORITY_PAID_CAP:%:%:%', v_priority, NEW.due_date, v_cap USING ERRCODE = '23514';
        END IF;
        INSERT INTO private.mission_priority_paid_days (user_id, mission_id, priority, day)
        VALUES (NEW.user_id, NEW.id, v_priority, NEW.due_date);
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.enforce_mission_priority() FROM PUBLIC, anon, authenticated;
