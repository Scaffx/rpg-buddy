\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE horde_catchup_samples(elapsed_ms numeric);
GRANT INSERT ON horde_catchup_samples TO authenticated;
INSERT INTO auth.users(id)
SELECT ('a0000000-0000-0000-0000-00000000'||lpad(i::text,4,'0'))::uuid
FROM generate_series(601,630) i;
INSERT INTO public.profiles(user_id,level,starter_class)
SELECT id,100,'guerreiro' FROM auth.users
WHERE id::text LIKE 'a0000000-0000-0000-0000-0000000006__';
SET ROLE authenticated;
DO $seed$
DECLARE v_user uuid;
BEGIN
  FOR v_user IN SELECT ('a0000000-0000-0000-0000-00000000'||lpad(i::text,4,'0'))::uuid
    FROM generate_series(601,630) i LOOP
    PERFORM set_config('request.jwt.claim.sub',v_user::text,true);
    PERFORM public.sync_auto_adventure();
  END LOOP;
END $seed$;
RESET ROLE;
UPDATE app_private.adventure_battles SET status='draw'
WHERE user_id::text LIKE 'a0000000-0000-0000-0000-0000000006__';
UPDATE public.adventure_state SET current_battle_id=NULL,
  last_tick_at=clock_timestamp()-interval '45 seconds'
WHERE user_id::text LIKE 'a0000000-0000-0000-0000-0000000006__';
SET ROLE authenticated;
DO $measure$
DECLARE v_user uuid; v_started timestamptz;
BEGIN
  FOR v_user IN SELECT ('a0000000-0000-0000-0000-00000000'||lpad(i::text,4,'0'))::uuid
    FROM generate_series(601,630) i LOOP
    PERFORM set_config('request.jwt.claim.sub',v_user::text,true);
    v_started:=clock_timestamp();
    PERFORM public.sync_auto_adventure();
    INSERT INTO horde_catchup_samples VALUES(
      extract(epoch FROM clock_timestamp()-v_started)*1000);
  END LOOP;
END $measure$;
RESET ROLE;
SELECT count(*) samples,
  round(percentile_cont(0.95) WITHIN GROUP (ORDER BY elapsed_ms)::numeric,3) p95_ms,
  round(max(elapsed_ms),3) max_ms
FROM horde_catchup_samples;
DO $assert$
BEGIN
  IF (SELECT count(*)<>30 OR max(elapsed_ms)>=250 FROM horde_catchup_samples)
  THEN RAISE EXCEPTION 'HORDE_CATCHUP_BUDGET_FAILED'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles
    WHERE user_id::text LIKE 'a0000000-0000-0000-0000-0000000006__'
      AND total_xp<>0)
  THEN RAISE EXCEPTION 'HORDE_CATCHUP_XP_FAILED'; END IF;
END $assert$;
ROLLBACK;
