\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='a0000000-0000-0000-0000-00000000b90b';
SELECT public.sync_auto_adventure();
SELECT pg_sleep(2);
COMMIT;
