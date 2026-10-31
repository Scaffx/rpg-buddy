\set ON_ERROR_STOP on
INSERT INTO auth.users(id) VALUES
  ('a0000000-0000-0000-0000-00000000b901'),
  ('a0000000-0000-0000-0000-00000000b902');
INSERT INTO public.profiles(user_id,level,starter_class) VALUES
  ('a0000000-0000-0000-0000-00000000b901',1,'novato'),
  ('a0000000-0000-0000-0000-00000000b902',1,'novato');
INSERT INTO public.adventure_state(user_id,stage,last_tick_at) VALUES
  ('a0000000-0000-0000-0000-00000000b901',15,clock_timestamp()),
  ('a0000000-0000-0000-0000-00000000b902',15,clock_timestamp()-interval '3 minutes');
INSERT INTO public.user_inventory(user_id,item_id,quantity,equipped) VALUES
  ('a0000000-0000-0000-0000-00000000b901','36aa16a5-153d-4c08-941e-ae3ee51d54d4',2,false),
  ('a0000000-0000-0000-0000-00000000b901','ea63052e-8530-4c4e-98ed-9d62a9cbf781',2,false),
  ('a0000000-0000-0000-0000-00000000b902','36aa16a5-153d-4c08-941e-ae3ee51d54d4',2,false);

SET ROLE authenticated;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000b901';
SELECT public.get_adventure_auto_potions_state() AS before_state \gset potion_
SELECT public.set_adventure_auto_potions_enabled(true) AS enabled_state \gset potion_
SELECT public.sync_auto_adventure() AS battle_state \gset potion_
RESET ROLE;
CREATE TEMP TABLE auto_potion_capture(kind text PRIMARY KEY, value jsonb);
INSERT INTO auto_potion_capture VALUES
  ('before',:'potion_before_state'::jsonb),
  ('enabled',:'potion_enabled_state'::jsonb),
  ('battle',:'potion_battle_state'::jsonb);

DO $test$
DECLARE b app_private.adventure_battles%ROWTYPE; receipts integer; stock integer;
BEGIN
  IF (SELECT (value->>'enabled')::boolean FROM auto_potion_capture WHERE kind='before')
    OR NOT (SELECT (value->>'enabled')::boolean FROM auto_potion_capture WHERE kind='enabled') THEN
    RAISE EXCEPTION 'AUTO_POTION_DEFAULT_OR_TOGGLE'; END IF;
  SELECT * INTO STRICT b FROM app_private.adventure_battles
    WHERE user_id='a0000000-0000-0000-0000-00000000b901' ORDER BY started_at DESC LIMIT 1;
  IF b.engine_version<>'v4_horde' OR b.rules_snapshot->'auto_potions'->>'enabled'<>'true' THEN
    RAISE EXCEPTION 'AUTO_POTION_NOT_SNAPSHOTTED'; END IF;
  SELECT count(*) INTO receipts FROM app_private.adventure_auto_potion_receipts WHERE battle_id=b.id;
  SELECT quantity INTO stock FROM public.user_inventory WHERE user_id=b.user_id
    AND item_id='36aa16a5-153d-4c08-941e-ae3ee51d54d4';
  IF receipts <> (SELECT count(*) FROM jsonb_array_elements(b.events) x
      WHERE x->>'skill_id' IN ('consumable.hp','consumable.mp'))
    OR (receipts>0 AND stock<>1) THEN
    RAISE EXCEPTION 'AUTO_POTION_RECEIPT_STOCK_MISMATCH: receipts=% stock=%',receipts,stock; END IF;
  IF EXISTS (SELECT 1 FROM app_private.adventure_auto_potion_receipts r
    WHERE r.battle_id=b.id AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(b.events) x
      WHERE x->>'consumable_type'=r.potion_type AND (x->>'at')::timestamptz=r.event_at)) THEN
    RAISE EXCEPTION 'AUTO_POTION_RECEIPT_WITHOUT_EVENT'; END IF;
  RAISE NOTICE 'AUTO_POTIONS_WRAPPER_PASS receipts=%',receipts;
END $test$;

SET ROLE authenticated;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000b901';
SELECT public.sync_auto_adventure() AS retry_state \gset potion_
RESET ROLE;
DO $test$
BEGIN
  IF (SELECT count(*) FROM app_private.adventure_auto_potion_receipts
    WHERE user_id='a0000000-0000-0000-0000-00000000b901')>2 THEN
    RAISE EXCEPTION 'AUTO_POTION_RETRY_DUPLICATED'; END IF;
  RAISE NOTICE 'AUTO_POTIONS_RETRY_PASS';
END $test$;

-- The inactive second identity has no visible inventory or setting from user 1.
SET ROLE authenticated;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000b902';
SELECT public.get_adventure_auto_potions_state() AS other_state \gset potion_
RESET ROLE;
INSERT INTO auto_potion_capture VALUES ('other',:'potion_other_state'::jsonb);
DO $test$
BEGIN
  IF (SELECT (value->>'enabled')::boolean FROM auto_potion_capture WHERE kind='other') OR
    (SELECT jsonb_array_length(value->'stock') FROM auto_potion_capture WHERE kind='other')<>1 OR
    (SELECT value->'stock'->0->>'type' FROM auto_potion_capture WHERE kind='other')<>'hp' THEN
    RAISE EXCEPTION 'AUTO_POTION_CROSS_IDENTITY'; END IF;
  RAISE NOTICE 'AUTO_POTIONS_CROSS_IDENTITY_PASS';
END $test$;
