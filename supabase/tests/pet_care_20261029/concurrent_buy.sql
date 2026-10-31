\set ON_ERROR_STOP on
BEGIN;
SET ROLE authenticated;
SET request.jwt.claim.sub='c0000000-0000-0000-0000-000000000401';
SELECT public.buy_pet_food('dog',7,'d0000000-0000-0000-0000-000000000401') AS receipt;
SELECT pg_sleep(0.7);
COMMIT;
