SET ROLE authenticated;
SET request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
SELECT (public.sync_auto_adventure()->>'stage')::integer;
