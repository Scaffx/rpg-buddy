\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);
SELECT public.sync_auto_adventure() IS NOT NULL AS sync_ok;
SELECT pg_sleep(:hold_seconds);
COMMIT;
