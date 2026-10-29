\set ON_ERROR_STOP on
ALTER FUNCTION app_private.adventure_simulate_horde(
  timestamptz,integer,integer,integer,integer,jsonb,jsonb,text,integer,jsonb)
OWNER TO authenticated;
