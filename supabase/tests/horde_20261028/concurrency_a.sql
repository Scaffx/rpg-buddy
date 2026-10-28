\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-00000000a431',true);
DO $$ BEGIN PERFORM public.sync_auto_adventure(); END $$;
SELECT pg_sleep(0.5);
COMMIT;
