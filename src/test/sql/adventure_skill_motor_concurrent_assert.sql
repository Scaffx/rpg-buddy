DO $$ BEGIN
  IF (SELECT count(*) FROM public.adventure_encounters
      WHERE user_id='cccccccc-0000-0000-0000-000000000001' AND stage=1 AND won) <> 1
    OR (SELECT count(*) FROM public.gold_history
      WHERE user_id='cccccccc-0000-0000-0000-000000000001' AND type='adventure') <> 1
    OR (SELECT sum(amount) FROM public.gold_history
      WHERE user_id='cccccccc-0000-0000-0000-000000000001' AND type='adventure') <> 4
    OR (SELECT count(*) FROM app_private.adventure_battles
      WHERE user_id='cccccccc-0000-0000-0000-000000000001' AND status='fighting') <> 1 THEN
    RAISE EXCEPTION 'concurrent sync duplicated or missed state';
  END IF;
END $$;
