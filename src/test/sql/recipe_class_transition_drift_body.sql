\set ON_ERROR_STOP on
-- Negative preflight probe: the name and metadata remain, but the body is a no-op.
CREATE OR REPLACE FUNCTION app_private.register_boss_recipe(
  p_battle app_private.adventure_battles,p_historical boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
  RETURN;
END;
$fn$;
REVOKE ALL ON FUNCTION app_private.register_boss_recipe(app_private.adventure_battles,boolean)
  FROM PUBLIC,anon,authenticated;
