\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000100',true);
SELECT public.set_active_adventure_pet('b0000000-0000-0000-0000-000000000100');
SELECT public.sync_auto_adventure();
COMMIT;
