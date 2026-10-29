\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='a0000000-0000-0000-0000-00000000b90b';
DO $review$
DECLARE v_inventory_id uuid;
BEGIN
  SELECT id INTO STRICT v_inventory_id FROM public.user_inventory
    WHERE user_id='a0000000-0000-0000-0000-00000000b90b'
      AND item_id='36aa16a5-153d-4c08-941e-ae3ee51d54d4';
  BEGIN
    PERFORM public.consume_inventory_item(v_inventory_id);
    RAISE EXCEPTION 'REVIEW_AUTO_FIRST_SPENT_AGAIN';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'ITEM_NOT_OWNED' THEN RAISE; END IF;
    RAISE NOTICE 'REVIEW_AUTO_FIRST_MANUAL_REJECTED';
  END;
END $review$;
COMMIT;
