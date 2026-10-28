\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id) VALUES('a0000000-0000-0000-0000-00000000a451');
INSERT INTO public.profiles(user_id,level,starter_class)
  VALUES('a0000000-0000-0000-0000-00000000a451',100,'guerreiro');
SET ROLE authenticated;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000a451';
DO $$ BEGIN PERFORM public.sync_auto_adventure(); END $$;
RESET ROLE;
UPDATE app_private.adventure_battles SET status='draw'
  WHERE user_id='a0000000-0000-0000-0000-00000000a451';
UPDATE public.adventure_state SET current_battle_id=NULL,
  last_tick_at=clock_timestamp()-interval '45 seconds'
  WHERE user_id='a0000000-0000-0000-0000-00000000a451';
SET ROLE authenticated;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000a451';
DO $$ BEGIN PERFORM public.sync_auto_adventure(); END $$;
RESET ROLE;
DO $assert$
BEGIN
  IF (SELECT count(*) FROM app_private.adventure_battles
      WHERE user_id='a0000000-0000-0000-0000-00000000a451'
        AND engine_version='v4_horde')<2
    OR (SELECT count(*) FROM public.adventure_encounters
      WHERE user_id='a0000000-0000-0000-0000-00000000a451')
      <> (SELECT count(*) FROM app_private.adventure_battles
        WHERE user_id='a0000000-0000-0000-0000-00000000a451'
          AND status='won' AND NOT replay)
    OR (SELECT count(*) FROM public.gold_history
      WHERE user_id='a0000000-0000-0000-0000-00000000a451' AND type='adventure')
      <> (SELECT count(*) FROM app_private.adventure_battles
        WHERE user_id='a0000000-0000-0000-0000-00000000a451'
          AND status='won')
    OR NOT (SELECT level=100 AND total_xp=0 FROM public.profiles
      WHERE user_id='a0000000-0000-0000-0000-00000000a451')
  THEN RAISE EXCEPTION 'HORDE_OFFLINE_ASSERT'; END IF;
END $assert$;
ROLLBACK;
