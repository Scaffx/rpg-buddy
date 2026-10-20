\set ON_ERROR_STOP on
-- Run only against a disposable fixture database. Leaves a three-member lobby.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
SELECT (public.portal_coop_create('fragments','ultra',NULL,
  '40000000-0000-0000-0000-000000000099',NULL)->>'session_id') AS sid \gset
SELECT (public.portal_coop_state(:'sid'::uuid)->>'invite_code') AS code \gset
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
SELECT public.portal_coop_join(:'code',NULL);
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
SELECT public.portal_coop_join(:'code',NULL);
\echo :code
