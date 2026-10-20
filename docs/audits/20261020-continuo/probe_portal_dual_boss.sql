\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_true(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'probe failed: %',label; END IF; END $$;
SET ROLE authenticated;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
SELECT (public.portal_coop_create('fragments','hard',NULL,
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa47',NULL)->>'session_id') AS sid \gset
SELECT (public.portal_coop_state(:'sid'::uuid)->>'invite_code') AS code \gset
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
SELECT public.portal_coop_join(:'code',NULL);
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
SELECT public.portal_coop_start(:'sid'::uuid);
SELECT public.portal_coop_action(:'sid'::uuid,
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa48',1);
RESET ROLE;
SELECT pg_temp.assert_true((SELECT wave=2 FROM public.portal_coop_sessions WHERE id=:'sid'::uuid),
  'wave 2 reached');
UPDATE public.portal_coop_enemies SET hp=1000,max_hp=1000,atk=10
  WHERE session_id=:'sid'::uuid AND wave=2;
SET ROLE authenticated;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
SELECT pg_sleep(2.1);
SELECT public.portal_coop_action(:'sid'::uuid,
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa49',1);
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM public.portal_coop_log
  WHERE session_id=:'sid'::uuid AND wave=2 AND message LIKE 'Boss % causou %'),
  'both surviving bosses retaliated');
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM public.portal_coop_enemies
  WHERE session_id=:'sid'::uuid AND wave=2 AND hp>0), 'two live bosses retained');
SELECT 'dual-boss retaliation passed' AS result;
ROLLBACK;
