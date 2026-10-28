\set ON_ERROR_STOP on
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='horde_drift_owner')
  THEN CREATE ROLE horde_drift_owner NOLOGIN; END IF; END $$;
ALTER FUNCTION app_private.sync_auto_adventure() OWNER TO horde_drift_owner;
