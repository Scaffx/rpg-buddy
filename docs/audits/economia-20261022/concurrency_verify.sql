\set ON_ERROR_STOP on
DO $$ BEGIN
  IF (SELECT count(*) FROM app_private.craft_requests
      WHERE user_id='11111111-1111-1111-1111-111111111111'
        AND request_id='00000000-0000-0000-0000-000000000092')<>1
     OR (SELECT count(*) FROM public.inventory_purchase_requests
      WHERE user_id='11111111-1111-1111-1111-111111111111'
        AND request_id='00000000-0000-0000-0000-000000000093')<>1
     OR (SELECT count(*) FROM app_private.adventure_chest_claim_receipts
      WHERE chest_id='00000000-0000-0000-0000-000000000090')<>1
     OR (SELECT count(*) FROM public.gold_history
      WHERE user_id='11111111-1111-1111-1111-111111111111'
        AND type='adventure_chest')<>1
     OR (SELECT status FROM app_private.adventure_chests
      WHERE id='00000000-0000-0000-0000-000000000090')<>'claimed'
     OR (SELECT gold FROM public.user_balance
      WHERE user_id='11111111-1111-1111-1111-111111111111')<0
  THEN RAISE EXCEPTION 'REVIEW_CONCURRENCY_INVARIANT_FAILED'; END IF;
END $$;
SELECT 'REVIEW_CONCURRENCY_PASS';
