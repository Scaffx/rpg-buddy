\set ON_ERROR_STOP on
INSERT INTO public.skill_tree_nodes(id,tree,node_type,name,effect) VALUES
  ('auto_potion_mp_probe','mago','skill','Selo de Teste',
   '{"kind":"skill","element":"arcano","power":1,"mpCost":60,"effectType":"debuff","cooldown":1}');
INSERT INTO auth.users(id) VALUES
  ('a0000000-0000-0000-0000-00000000b903'),
  ('a0000000-0000-0000-0000-00000000b904');
INSERT INTO public.profiles(user_id,level,starter_class,current_class_id,combat_skill_loadout) VALUES
  ('a0000000-0000-0000-0000-00000000b903',1,'mago',
   '00000002-0000-0000-0000-000000000002','[{"id":"auto_potion_mp_probe"}]'),
  ('a0000000-0000-0000-0000-00000000b904',1,'novato',NULL,'[]');
INSERT INTO public.player_skill_nodes(user_id,node_id,rank) VALUES
  ('a0000000-0000-0000-0000-00000000b903','auto_potion_mp_probe',1);
INSERT INTO public.adventure_state(user_id,stage,last_tick_at) VALUES
  ('a0000000-0000-0000-0000-00000000b903',15,clock_timestamp()),
  ('a0000000-0000-0000-0000-00000000b904',15,clock_timestamp());
INSERT INTO public.user_inventory(user_id,item_id,quantity,equipped) VALUES
  ('a0000000-0000-0000-0000-00000000b903','ea63052e-8530-4c4e-98ed-9d62a9cbf781',1,false);

SET ROLE authenticated;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000b903';
SELECT public.set_adventure_auto_potions_enabled(true) AS enabled \gset potion_
SELECT public.sync_auto_adventure() AS battle \gset potion_
RESET ROLE;
DO $test$
DECLARE b app_private.adventure_battles%ROWTYPE;
BEGIN
  SELECT * INTO STRICT b FROM app_private.adventure_battles
    WHERE user_id='a0000000-0000-0000-0000-00000000b903' LIMIT 1;
  IF (SELECT count(*) FROM app_private.adventure_auto_potion_receipts WHERE battle_id=b.id AND potion_type='mp')<>1
    OR EXISTS (SELECT 1 FROM public.user_inventory WHERE user_id=b.user_id
      AND item_id='ea63052e-8530-4c4e-98ed-9d62a9cbf781')
    OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(b.events) x
      WHERE x->>'skill_id'='consumable.mp' AND (x->>'mp_restored')::integer>0) THEN
    RAISE EXCEPTION 'AUTO_POTION_MP_WRAPPER'; END IF;
  RAISE NOTICE 'AUTO_POTIONS_MP_WRAPPER_PASS';
END $test$;

SET ROLE authenticated;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000b904';
SELECT public.sync_auto_adventure() AS prior \gset potion_
RESET ROLE;
-- A pre-existing fight makes the bounded catch-up use its frozen snapshot.
-- Move this fixture fight to the past while preserving every event interval.
UPDATE app_private.adventure_battles b SET
  started_at=b.started_at-interval '4 minutes',
  ends_at=b.ends_at-interval '4 minutes',
  events=(SELECT jsonb_agg(jsonb_set(e.x,'{at}',
    to_jsonb((e.x->>'at')::timestamptz-interval '4 minutes')) ORDER BY e.n)
    FROM jsonb_array_elements(b.events) WITH ORDINALITY e(x,n))
  WHERE b.user_id='a0000000-0000-0000-0000-00000000b904';
INSERT INTO public.user_inventory(user_id,item_id,quantity,equipped) VALUES
  ('a0000000-0000-0000-0000-00000000b904','36aa16a5-153d-4c08-941e-ae3ee51d54d4',2,false);
INSERT INTO app_private.adventure_auto_potion_selection(user_id,enabled,effective_at) VALUES
  ('a0000000-0000-0000-0000-00000000b904',true,clock_timestamp()-interval '5 minutes');
SET ROLE authenticated;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000b904';
SELECT public.sync_auto_adventure() AS offline \gset potion_
RESET ROLE;
DO $test$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM app_private.adventure_auto_potion_receipts
    WHERE user_id='a0000000-0000-0000-0000-00000000b904';
  IF n<1 OR coalesce((SELECT quantity FROM public.user_inventory WHERE
    user_id='a0000000-0000-0000-0000-00000000b904'
    AND item_id='36aa16a5-153d-4c08-941e-ae3ee51d54d4'),0)<>2-n THEN
    RAISE EXCEPTION 'AUTO_POTION_OFFLINE_RECEIPTS: %',n; END IF;
  IF NOT EXISTS (SELECT 1 FROM app_private.adventure_auto_potion_receipts r
    JOIN app_private.adventure_battles b ON b.id=r.battle_id
    WHERE r.user_id='a0000000-0000-0000-0000-00000000b904'
      AND b.started_at<clock_timestamp()-interval '1 minute') THEN
    RAISE EXCEPTION 'AUTO_POTION_NOT_OFFLINE'; END IF;
  RAISE NOTICE 'AUTO_POTIONS_OFFLINE_PASS receipts=%',n;
END $test$;
