\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='a0000000-0000-0000-0000-00000000b90a';
DO $review$
DECLARE v_inventory_id uuid; v_result jsonb;
BEGIN
  SELECT id INTO STRICT v_inventory_id FROM public.user_inventory
    WHERE user_id='a0000000-0000-0000-0000-00000000b90a'
      AND item_id='36aa16a5-153d-4c08-941e-ae3ee51d54d4';
  v_result:=public.consume_inventory_item(v_inventory_id);
  IF v_result->>'ok'<>'true' OR v_result->>'preserved'<>'false'
  THEN RAISE EXCEPTION 'REVIEW_MANUAL_FIRST_NO_SPEND: %',v_result; END IF;
END $review$;
SELECT pg_sleep(2);
COMMIT;
