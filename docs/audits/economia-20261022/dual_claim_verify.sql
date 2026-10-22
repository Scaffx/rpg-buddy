\set ON_ERROR_STOP on
DO $$ BEGIN
  IF (SELECT count(*) FROM app_private.adventure_chest_claim_receipts
      WHERE chest_id='00000000-0000-0000-0000-000000000095')<>1
     OR (SELECT count(*) FROM public.gold_history
      WHERE user_id='11111111-1111-1111-1111-111111111111'
        AND type='adventure_chest')<>2
     OR (SELECT status FROM app_private.adventure_chests
      WHERE id='00000000-0000-0000-0000-000000000095')<>'claimed'
  THEN RAISE EXCEPTION 'REVIEW_DUAL_CLAIM_DUPLICATED'; END IF;
END $$;
SELECT 'REVIEW_DUAL_CLAIM_PASS';
