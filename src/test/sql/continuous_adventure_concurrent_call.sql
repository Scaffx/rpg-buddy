SET ROLE authenticated;
SET request.jwt.claim.sub='33333333-3333-3333-3333-333333333333';
SELECT (public.sync_auto_adventure()->>'stage')::integer;
