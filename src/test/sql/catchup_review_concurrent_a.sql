BEGIN;
SET ROLE authenticated;
SET request.jwt.claim.sub='bbbbbbbb-0000-0000-0000-000000000020';
SELECT 'A' AS caller,(snap->'catchup'->>'battles')::integer AS battles,
 (snap->'battle'->>'id') AS battle_id,(snap->'catchup'->>'pending')::boolean AS pending
 FROM (SELECT public.sync_auto_adventure() AS snap) q;
SELECT pg_sleep(2);
COMMIT;
