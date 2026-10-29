\set ON_ERROR_STOP on
BEGIN;
SET ROLE authenticated;
SET request.jwt.claim.sub='c0000000-0000-0000-0000-000000000401';
SELECT public.interact_pet_care('d0000000-0000-0000-0000-000000000401',
  'play','d0000000-0000-0000-0000-000000000402') AS receipt;
SELECT pg_sleep(0.7);
COMMIT;
