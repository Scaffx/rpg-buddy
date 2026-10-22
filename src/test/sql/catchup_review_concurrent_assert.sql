DO $$ BEGIN
  IF (SELECT count(*)<>1 FROM public.adventure_state
      WHERE user_id='bbbbbbbb-0000-0000-0000-000000000020') THEN
    RAISE EXCEPTION 'missing shared state';
  END IF;
  IF (SELECT attempt<2 OR stage<>1 OR adventure_mode<>'holding'
       OR gold_today>120 OR loot_today>2
      FROM public.adventure_state
      WHERE user_id='bbbbbbbb-0000-0000-0000-000000000020') THEN
    RAISE EXCEPTION 'concurrent state/limits invalid';
  END IF;
  IF (SELECT count(*)<>count(DISTINCT attempt) FROM app_private.adventure_battles
      WHERE user_id='bbbbbbbb-0000-0000-0000-000000000020') THEN
    RAISE EXCEPTION 'duplicate battle attempt';
  END IF;
  IF (SELECT count(*)<>1 FROM app_private.adventure_battles
      WHERE user_id='bbbbbbbb-0000-0000-0000-000000000020' AND status='fighting') THEN
    RAISE EXCEPTION 'duplicate current battle';
  END IF;
  IF (SELECT coalesce(sum(amount),0)<>coalesce((SELECT gold-100 FROM public.user_balance
      WHERE user_id='bbbbbbbb-0000-0000-0000-000000000020'),0)
      FROM public.gold_history WHERE user_id='bbbbbbbb-0000-0000-0000-000000000020'
        AND type='adventure') THEN RAISE EXCEPTION 'concurrent ledger mismatch'; END IF;
  IF (SELECT count(*)<>1 FROM public.adventure_encounters
      WHERE user_id='bbbbbbbb-0000-0000-0000-000000000020' AND stage=1 AND won) THEN
    RAISE EXCEPTION 'concurrent first clear duplicate';
  END IF;
END $$;
SELECT attempt,gold_today,loot_today,
 (SELECT count(*) FROM app_private.adventure_battles b WHERE b.user_id=s.user_id AND b.status='fighting') AS active_battles,
 (SELECT count(*) FROM public.adventure_encounters e WHERE e.user_id=s.user_id AND e.stage=1 AND e.won) AS first_clears
 FROM public.adventure_state s WHERE user_id='bbbbbbbb-0000-0000-0000-000000000020';
SELECT 'CATCHUP_REVIEW_CONCURRENT_PASS' AS result;
