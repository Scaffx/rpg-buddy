\set ON_ERROR_STOP on
DO $assert$
BEGIN
  IF (SELECT count(*) FROM public.adventure_encounters
      WHERE user_id='a0000000-0000-0000-0000-00000000a431' AND stage=1 AND won)<>1
    OR (SELECT count(*) FROM public.gold_history
      WHERE user_id='a0000000-0000-0000-0000-00000000a431' AND type='adventure')<>1
    OR (SELECT count(*) FROM app_private.adventure_battles
      WHERE user_id='a0000000-0000-0000-0000-00000000a431' AND stage=1)<>1
    OR (SELECT status FROM app_private.adventure_battles
      WHERE user_id='a0000000-0000-0000-0000-00000000a431' AND stage=1)<>'won'
    OR (SELECT total_xp<>0 OR level<>100 FROM public.profiles
      WHERE user_id='a0000000-0000-0000-0000-00000000a431')
  THEN RAISE EXCEPTION 'HORDE_CONCURRENCY_ASSERT'; END IF;
END $assert$;
