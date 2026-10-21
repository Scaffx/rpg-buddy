SET ROLE authenticated;
SET request.jwt.claim.sub='cccccccc-0000-0000-0000-000000000001';
SELECT (public.sync_auto_adventure()->>'stage')::integer;
