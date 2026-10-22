\set ON_ERROR_STOP on
BEGIN;
UPDATE public.profiles SET level=10
  WHERE user_id='11111111-1111-1111-1111-111111111111';
INSERT INTO public.adventure_state(user_id,stage,attempt,last_tick_at)
VALUES ('11111111-1111-1111-1111-111111111111',10,0,clock_timestamp());
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);
SELECT public.sync_auto_adventure() IS NOT NULL AS boss_created;
RESET ROLE;
DO $test$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_private.adventure_battles b
    WHERE b.user_id='11111111-1111-1111-1111-111111111111'
      AND b.stage=10 AND b.status='fighting' AND b.replay=false
      AND (b.events->-1->>'enemy_hp')::integer=0)
  THEN RAISE EXCEPTION 'GOLD_CONCURRENT_SERVER_BATTLE_MISSING'; END IF;
END;
$test$;
UPDATE app_private.adventure_battles SET
  started_at=clock_timestamp()-interval '2 minutes',
  ends_at=clock_timestamp()-interval '1 second'
WHERE user_id='11111111-1111-1111-1111-111111111111'
  AND stage=10 AND status='fighting';
COMMIT;
