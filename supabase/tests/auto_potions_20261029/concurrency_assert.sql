\set ON_ERROR_STOP on
DO $test$
DECLARE b app_private.adventure_battles%ROWTYPE;
BEGIN
  SELECT * INTO STRICT b FROM app_private.adventure_battles
    WHERE user_id='a0000000-0000-0000-0000-00000000b906';
  IF (SELECT count(*) FROM app_private.adventure_battles WHERE user_id=b.user_id)<>1
    OR (SELECT count(*) FROM app_private.adventure_auto_potion_receipts WHERE battle_id=b.id)<>1
    OR EXISTS (SELECT 1 FROM public.user_inventory WHERE user_id=b.user_id
      AND item_id='36aa16a5-153d-4c08-941e-ae3ee51d54d4') THEN
    RAISE EXCEPTION 'AUTO_POTION_CONCURRENCY_DUPLICATED'; END IF;
  RAISE NOTICE 'AUTO_POTIONS_CONCURRENCY_PASS';
END $test$;
