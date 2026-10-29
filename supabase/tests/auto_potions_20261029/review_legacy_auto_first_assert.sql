\set ON_ERROR_STOP on
DO $review$
DECLARE v_battle app_private.adventure_battles%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_battle FROM app_private.adventure_battles
    WHERE user_id='a0000000-0000-0000-0000-00000000b90b';
  IF EXISTS (SELECT 1 FROM public.user_inventory WHERE user_id=v_battle.user_id
      AND item_id='36aa16a5-153d-4c08-941e-ae3ee51d54d4')
    OR (SELECT count(*) FROM app_private.adventure_auto_potion_receipts
      WHERE battle_id=v_battle.id AND potion_type='hp')<>1
    OR (SELECT count(*) FROM jsonb_array_elements(v_battle.events) x
      WHERE x->>'skill_id'='consumable.hp')<>1
  THEN RAISE EXCEPTION 'REVIEW_AUTO_FIRST_OVERSPENT_OR_NO_RECEIPT'; END IF;
  RAISE NOTICE 'REVIEW_AUTO_FIRST_PASS';
END $review$;
