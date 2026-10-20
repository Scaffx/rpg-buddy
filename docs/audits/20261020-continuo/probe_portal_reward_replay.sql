\set ON_ERROR_STOP on
BEGIN;
SET ROLE authenticated;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
SELECT (public.portal_coop_create('daily',NULL,
  '30000000-0000-0000-0000-000000000001',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa51',NULL)->>'session_id') AS sid \gset
SELECT (public.portal_coop_state(:'sid'::uuid)->>'invite_code') AS code \gset
SELECT set_config('test.sid',:'sid',false);
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
SELECT public.portal_coop_join(:'code',NULL);
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
SELECT public.portal_coop_start(:'sid'::uuid);
SELECT public.portal_coop_action(:'sid'::uuid,
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa52',1) AS first_action \gset
SELECT public.portal_coop_action(:'sid'::uuid,
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa52',1) AS replay_action \gset
RESET ROLE;
DO $$ BEGIN
  IF (SELECT count(*)<>2 OR bool_or(xp_earned<>0 OR gold_earned<>0)
    FROM public.portal_runs WHERE coop_session_id=current_setting('test.sid')::uuid) THEN
    RAISE EXCEPTION 'daily winners or zero-XP/gold wrong'; END IF;
  IF (SELECT count(*)<>1 FROM public.portal_coop_actions
    WHERE session_id=current_setting('test.sid')::uuid) THEN
    RAISE EXCEPTION 'action replay recorded twice'; END IF;
  IF EXISTS(SELECT 1 FROM public.profiles
    WHERE user_id IN ('00000000-0000-0000-0000-000000000001',
                      '00000000-0000-0000-0000-000000000002')
      AND (total_xp<>0 OR level<>80)) THEN
    RAISE EXCEPTION 'portal changed profile progression'; END IF;
END $$;
SELECT 'first=' || :'first_action' || ' replay=' || :'replay_action' AS receipts;
SELECT 'daily zero-XP/gold, two winners, one action passed' AS result;
ROLLBACK;
