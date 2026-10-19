SET ROLE authenticated;
SET request.jwt.claim.sub='44444444-4444-4444-4444-444444444444';
SELECT (public.sync_auto_adventure()->>'stage')::integer;
