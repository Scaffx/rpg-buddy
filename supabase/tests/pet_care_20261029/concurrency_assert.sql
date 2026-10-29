\set ON_ERROR_STOP on
DO $assert$
DECLARE u uuid:='c0000000-0000-0000-0000-000000000401';
  pet uuid:='d0000000-0000-0000-0000-000000000401';
BEGIN
  IF (SELECT gold FROM public.user_balance WHERE user_id=u)<>125
    OR (SELECT count(*) FROM app_private.pet_food_purchase_requests WHERE user_id=u)<>1
    OR (SELECT count(*) FROM public.gold_history
        WHERE user_id=u AND type='compra_alimento_pet')<>1
    OR (SELECT count(*) FROM app_private.pet_care_events
        WHERE companion_id=pet AND effective)<>1
    OR (SELECT count(*) FROM app_private.pet_feed_receipts WHERE companion_id=pet)<>2
    OR EXISTS (SELECT 1 FROM public.user_inventory ui
      JOIN app_private.pet_food_catalog f ON f.item_id=ui.item_id
      WHERE ui.user_id=u AND f.pet_type='dog')
    OR (SELECT total_xp FROM public.profiles WHERE user_id=u)<>700
  THEN RAISE EXCEPTION 'PET_CARE_CONCURRENCY_MISMATCH'; END IF;
  RAISE NOTICE 'PET_CARE_CONCURRENCY_PASS';
END $assert$;
