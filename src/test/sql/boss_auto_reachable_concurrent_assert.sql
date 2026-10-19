DO $$
BEGIN
  IF (SELECT count(*) FROM public.adventure_encounters
      WHERE user_id='44444444-4444-4444-4444-444444444444' AND stage=590) <> 1
     OR (SELECT stage FROM public.adventure_state
         WHERE user_id='44444444-4444-4444-4444-444444444444') <> 591
     OR (SELECT count(*) FROM public.boss_battles
         WHERE user_id='44444444-4444-4444-4444-444444444444' AND won) <> 57
     OR (SELECT total_xp <> 1176000 OR level <> 50 FROM public.profiles
         WHERE user_id='44444444-4444-4444-4444-444444444444')
     OR (SELECT xp <> 252000 OR level <> 28 FROM public.attributes
         WHERE user_id='44444444-4444-4444-4444-444444444444' AND name='forca') THEN
    RAISE EXCEPTION 'concurrent replay duplicated stage or boss credit';
  END IF;
END $$;
SELECT 'reachable catalog concurrent assertions passed' AS result;
