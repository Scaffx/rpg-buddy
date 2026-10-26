DO $audit$
DECLARE v_uid uuid:='c0000000-0000-0000-0000-000000000001';
  v_win_count integer; v_gold integer; v_awarded integer;
BEGIN
  SELECT count(*),coalesce(sum(gold),0) INTO v_win_count,v_awarded
  FROM public.adventure_encounters WHERE user_id=v_uid AND stage=1 AND won;
  SELECT gold INTO v_gold FROM public.user_balance WHERE user_id=v_uid;
  IF v_win_count<>1 OR v_awarded<=0 OR v_gold<>100+v_awarded
    OR (SELECT count(*) FROM public.gold_history
        WHERE user_id=v_uid AND amount>0)<>1
    OR (SELECT count(*) FROM app_private.adventure_battles
        WHERE user_id=v_uid AND stage=1 AND status='won')<>1
    OR (SELECT count(*) FROM app_private.adventure_pet_selection
        WHERE user_id=v_uid)<>2
    OR (SELECT companion_id FROM app_private.adventure_pet_selection
        WHERE user_id=v_uid ORDER BY revision DESC LIMIT 1)<>
          'c0000000-0000-0000-0000-000000000012'::uuid
    OR NOT EXISTS(SELECT 1 FROM app_private.adventure_battles
        WHERE user_id=v_uid AND stage=1
          AND rules_snapshot->'pet'->>'companion_id'=
            'c0000000-0000-0000-0000-000000000011')
  THEN RAISE EXCEPTION 'PET_CONCURRENCY_CREDIT_OR_SNAPSHOT_MISMATCH wins=% gold=% awarded=%',
    v_win_count,v_gold,v_awarded; END IF;
  RAISE NOTICE 'PET_TWO_SESSION_SELECTION_SYNC_REPLAY_PASS';
END $audit$;
