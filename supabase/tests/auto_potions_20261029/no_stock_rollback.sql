\set ON_ERROR_STOP on
INSERT INTO auth.users(id) VALUES
  ('a0000000-0000-0000-0000-00000000b905'),
  ('a0000000-0000-0000-0000-00000000b907');
INSERT INTO public.profiles(user_id,level,starter_class) VALUES
  ('a0000000-0000-0000-0000-00000000b905',1,'novato'),
  ('a0000000-0000-0000-0000-00000000b907',1,'novato');
INSERT INTO public.adventure_state(user_id,stage,last_tick_at) VALUES
  ('a0000000-0000-0000-0000-00000000b905',15,clock_timestamp()),
  ('a0000000-0000-0000-0000-00000000b907',15,clock_timestamp());
INSERT INTO public.user_inventory(user_id,item_id,quantity,equipped) VALUES
  ('a0000000-0000-0000-0000-00000000b905','36aa16a5-153d-4c08-941e-ae3ee51d54d4',1,false);
INSERT INTO public.game_items(id,name,category,rarity,is_consumable,stackable,effect,level_required)
VALUES ('a0000000-0000-4000-8000-00000000b907','Poção mista de teste',
  'consumable','comum',true,true,'heal_30,mana_20',1);
INSERT INTO public.user_inventory(user_id,item_id,quantity,equipped) VALUES
  ('a0000000-0000-0000-0000-00000000b907','a0000000-0000-4000-8000-00000000b907',1,false);
INSERT INTO app_private.adventure_auto_potion_selection(user_id,enabled,effective_at) VALUES
  ('a0000000-0000-0000-0000-00000000b905',true,clock_timestamp()-interval '1 minute'),
  ('a0000000-0000-0000-0000-00000000b907',true,clock_timestamp()-interval '1 minute');

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='a0000000-0000-0000-0000-00000000b905';
SELECT public.sync_auto_adventure() AS response \gset potion_
DO $test$
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_inventory WHERE
    user_id='a0000000-0000-0000-0000-00000000b905'
    AND item_id='36aa16a5-153d-4c08-941e-ae3ee51d54d4') THEN
    RAISE EXCEPTION 'AUTO_POTION_ROLLBACK_PROBE_NO_DEBIT'; END IF;
END $test$;
ROLLBACK;
DO $test$
BEGIN
  IF (SELECT quantity FROM public.user_inventory WHERE
    user_id='a0000000-0000-0000-0000-00000000b905'
    AND item_id='36aa16a5-153d-4c08-941e-ae3ee51d54d4')<>1 OR
    EXISTS (SELECT 1 FROM app_private.adventure_auto_potion_receipts
      WHERE user_id='a0000000-0000-0000-0000-00000000b905') OR
    EXISTS (SELECT 1 FROM app_private.adventure_battles
      WHERE user_id='a0000000-0000-0000-0000-00000000b905') THEN
    RAISE EXCEPTION 'AUTO_POTION_ROLLBACK_NOT_ATOMIC'; END IF;
  RAISE NOTICE 'AUTO_POTIONS_ROLLBACK_PASS';
END $test$;

SET ROLE authenticated;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000b907';
SELECT public.sync_auto_adventure() AS response \gset potion_
RESET ROLE;
DO $test$
DECLARE b app_private.adventure_battles%ROWTYPE;
BEGIN
  SELECT * INTO STRICT b FROM app_private.adventure_battles
    WHERE user_id='a0000000-0000-0000-0000-00000000b907' LIMIT 1;
  IF EXISTS (SELECT 1 FROM app_private.adventure_auto_potion_receipts WHERE battle_id=b.id)
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(b.events) x
      WHERE x->>'skill_id' IN ('consumable.hp','consumable.mp')) THEN
    RAISE EXCEPTION 'AUTO_POTION_NO_STOCK_DID_NOT_CONTINUE'; END IF;
  RAISE NOTICE 'AUTO_POTIONS_NO_COMPATIBLE_STOCK_PASS';
END $test$;
