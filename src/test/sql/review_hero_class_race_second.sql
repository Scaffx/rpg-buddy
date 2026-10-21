\set ON_ERROR_STOP on
SET ROLE authenticated;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
SELECT public.perform_class_respec('gatuno');
