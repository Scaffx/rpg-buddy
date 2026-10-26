\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('request.jwt.claim.sub','c0000000-0000-0000-0000-000000000001',true);
SELECT public.set_active_adventure_pet('c0000000-0000-0000-0000-000000000011');
SELECT pg_sleep(1.0);
SELECT public.sync_auto_adventure();
COMMIT;
