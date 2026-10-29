\set ON_ERROR_STOP on
BEGIN;
SET ROLE authenticated;
SET request.jwt.claim.sub='c0000000-0000-0000-0000-000000000401';
SELECT public.get_pet_care_state() AS state;
SELECT pg_sleep(0.7);
COMMIT;
