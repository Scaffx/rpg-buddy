\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_true(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'probe failed: %',label; END IF; END $$;
INSERT INTO auth.users(id) VALUES ('66666666-6666-6666-6666-666666666666');
INSERT INTO public.profiles(user_id,level,starter_class) VALUES
  ('66666666-6666-6666-6666-666666666666',50,'mago');
INSERT INTO public.adventure_state(user_id,stage,attempt,last_tick_at)
  VALUES('66666666-6666-6666-6666-666666666666',1,0,clock_timestamp()-interval '12 hours');
SET ROLE authenticated;
SET request.jwt.claim.sub='66666666-6666-6666-6666-666666666666';
SELECT public.sync_auto_adventure() AS first_snapshot \gset
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM app_private.adventure_battles
  WHERE user_id='66666666-6666-6666-6666-666666666666'), 'one new battle');
SELECT pg_temp.assert_true((SELECT started_at>clock_timestamp()-interval '30 seconds'
  FROM app_private.adventure_battles WHERE user_id='66666666-6666-6666-6666-666666666666'),
  'legacy state starts v2 now');
SELECT pg_temp.assert_true((:'first_snapshot'::jsonb->'battle'->>'hero_hp')::integer =
  (:'first_snapshot'::jsonb->'battle'->>'hero_max_hp')::integer AND
  (:'first_snapshot'::jsonb->'battle'->>'enemy_hp')::integer =
  (:'first_snapshot'::jsonb->'battle'->>'enemy_max_hp')::integer,
  'future events do not apply HP early');
SELECT pg_temp.assert_true((:'first_snapshot'::jsonb->'catchup'->>'battles')::integer=0,
  'legacy state no retroactive fights');
SELECT 'legacy-start and future HP passed' AS result;
ROLLBACK;
