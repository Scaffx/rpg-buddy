\set ON_ERROR_STOP on
UPDATE public.user_inventory SET quantity=2
WHERE user_id='c0000000-0000-0000-0000-000000000401'
  AND item_id=(SELECT item_id FROM app_private.pet_food_catalog WHERE pet_type='dog');
UPDATE app_private.pet_care_state SET baseline_at=clock_timestamp()-interval '72 hours',
  last_feed_at=clock_timestamp()-interval '72 hours',
  next_feed_at=clock_timestamp()-interval '48 hours',
  settled_through_at=clock_timestamp()-interval '72 hours'
WHERE companion_id='d0000000-0000-0000-0000-000000000401';
