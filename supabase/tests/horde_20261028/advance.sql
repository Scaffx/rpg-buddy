\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id) VALUES('a0000000-0000-0000-0000-00000000a461');
INSERT INTO public.profiles(user_id,level,starter_class)
  VALUES('a0000000-0000-0000-0000-00000000a461',20,'mago');
INSERT INTO public.adventure_state(user_id,last_tick_at,stage,adventure_mode)
  VALUES('a0000000-0000-0000-0000-00000000a461',clock_timestamp(),1,'holding');
SET ROLE authenticated;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000a461';
DO $$ BEGIN PERFORM public.sync_auto_adventure(); END $$;
RESET ROLE;
SELECT set_config('horde.advance_battle_id',current_battle_id::text,true)
  FROM public.adventure_state
  WHERE user_id='a0000000-0000-0000-0000-00000000a461';
SET ROLE authenticated;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000a461';
DO $$ BEGIN
  PERFORM public.advance_auto_adventure(current_setting('horde.advance_battle_id')::uuid);
  BEGIN
    PERFORM public.advance_auto_adventure(current_setting('horde.advance_battle_id')::uuid);
    RAISE EXCEPTION 'duplicate advance accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
END $$;
RESET ROLE;
DO $assert$
BEGIN
  IF NOT (SELECT adventure_mode='holding' AND advance_requested
      AND current_battle_id=current_setting('horde.advance_battle_id')::uuid
    FROM public.adventure_state
    WHERE user_id='a0000000-0000-0000-0000-00000000a461')
    OR EXISTS (SELECT 1 FROM public.gold_history
      WHERE user_id='a0000000-0000-0000-0000-00000000a461' AND type='adventure')
  THEN RAISE EXCEPTION 'HORDE_ADVANCE_ASSERT'; END IF;
END $assert$;
ROLLBACK;
