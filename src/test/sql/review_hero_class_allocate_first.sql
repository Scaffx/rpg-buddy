\set ON_ERROR_STOP on
BEGIN;
SET ROLE authenticated;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
SELECT public.allocate_skill_node('m_dardo');
SELECT pg_sleep(2);
COMMIT;
