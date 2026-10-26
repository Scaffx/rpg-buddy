DO $assert$
BEGIN
  IF (SELECT count(*) FROM app_private.adventure_pet_selection
    WHERE user_id='a0000000-0000-0000-0000-000000000100')<>1
    OR (SELECT count(*) FROM app_private.adventure_pet_selection
    WHERE user_id='a0000000-0000-0000-0000-000000000101')<>2
  THEN RAISE EXCEPTION 'selection contention/duplicate failed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM app_private.adventure_battles b
    WHERE b.user_id='a0000000-0000-0000-0000-000000000100'
    AND b.status='fighting' AND b.rules_snapshot->'pet'->>'companion_id'=
      'b0000000-0000-0000-0000-000000000100')
    OR NOT EXISTS(SELECT 1 FROM app_private.adventure_battles b
    WHERE b.user_id='a0000000-0000-0000-0000-000000000101'
    AND b.status='fighting' AND b.rules_snapshot->'pet'->>'companion_id'=
      'b0000000-0000-0000-0000-000000000102')
  THEN RAISE EXCEPTION 'switch/sync battle snapshot mismatch'; END IF;
END $assert$;
