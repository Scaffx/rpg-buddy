\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.ok(p_ok boolean,p_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF p_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'PET_CARE_TEST: %',p_label; END IF; END $$;

DO $test$
DECLARE u uuid:='c0000000-0000-0000-0000-000000000101';
  dog uuid; cat uuid; skeleton uuid; item uuid; inv uuid;
  r jsonb; before_xp integer; before_gold integer; at_now timestamptz;
BEGIN
  PERFORM pg_temp.ok((SELECT count(*)=13 FROM app_private.pet_food_catalog),'13 SKUs');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM app_private.pet_food_catalog f
    JOIN public.game_items i ON i.id=f.item_id WHERE i.category<>'consumable'
      OR NOT i.stackable OR NOT i.is_consumable OR i.shop_price IS NOT NULL
      OR f.unit_price<>25),'SKU fields');
  INSERT INTO auth.users(id) VALUES(u);
  INSERT INTO public.profiles(user_id,level,starter_class,total_xp) VALUES(u,10,'guerreiro',700);
  INSERT INTO public.user_balance(user_id,balance_percent,gold) VALUES(u,100,1000)
    ON CONFLICT (user_id) DO UPDATE SET gold=1000;
  PERFORM set_config('request.jwt.claim.sub',u::text,true);
  PERFORM pg_temp.ok(public.get_pet_food_catalog()='[]'::jsonb,'unowned catalog');
  SELECT gold INTO before_gold FROM public.user_balance WHERE user_id=u;
  BEGIN
    PERFORM public.buy_pet_food('dog',1,'d0000000-0000-0000-0000-000000000101');
    RAISE EXCEPTION 'unowned buy accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  PERFORM pg_temp.ok((SELECT gold=before_gold FROM public.user_balance WHERE user_id=u),'unowned no debit');
  INSERT INTO public.companions(user_id,companion_type,origin,name)
    VALUES(u,'dog','lvl3_choice','Dog') RETURNING id INTO dog;
  INSERT INTO public.companions(user_id,companion_type,origin,name)
    VALUES(u,'cat','shop','Cat') RETURNING id INTO cat;
  INSERT INTO public.companions(user_id,companion_type,origin,name)
    VALUES(u,'skeleton_pup','boss_story','Pup') RETURNING id INTO skeleton;
  PERFORM pg_temp.ok(jsonb_array_length(public.get_pet_food_catalog())=3,'owned catalog');
  r:=public.interact_pet_care(cat,'care','d0000000-0000-0000-0000-000000000106');
  PERFORM pg_temp.ok(r->>'effective'='true','new pet can receive immediate care');
  SELECT item_id INTO item FROM app_private.pet_food_catalog WHERE pet_type='dog';
  SELECT total_xp INTO before_xp FROM public.profiles WHERE user_id=u;
  r:=public.buy_pet_food('dog',7,'d0000000-0000-0000-0000-000000000102');
  PERFORM pg_temp.ok(r->>'total'='175' AND r->>'stock'='7'
    AND (SELECT gold=825 FROM public.user_balance WHERE user_id=u),'buy seven');
  r:=public.buy_pet_food('dog',7,'d0000000-0000-0000-0000-000000000102');
  PERFORM pg_temp.ok(r->>'replayed'='true' AND r->>'stock'='7'
    AND (SELECT count(*)=1 FROM app_private.pet_food_purchase_requests WHERE user_id=u)
    AND (SELECT count(*)=1 FROM public.gold_history
      WHERE user_id=u AND type='compra_alimento_pet'),'buy replay');
  BEGIN
    PERFORM public.buy_pet_food('dog',8,'d0000000-0000-0000-0000-000000000102');
    RAISE EXCEPTION 'UUID conflict accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  BEGIN
    PERFORM public.buy_pet_food('cat',7,'d0000000-0000-0000-0000-000000000102');
    RAISE EXCEPTION 'UUID species conflict accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  PERFORM pg_temp.ok(public.get_pet_food_purchase_receipt('d0000000-0000-0000-0000-000000000102')->>'total'='175'
    AND public.get_pet_food_purchase_receipt('d0000000-0000-0000-0000-000000000199')->>'found'='false',
    'receipt resolution');
  SELECT id INTO inv FROM public.user_inventory WHERE user_id=u AND item_id=item;
  BEGIN
    PERFORM public.consume_inventory_item(inv);
    RAISE EXCEPTION 'generic food consume accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  PERFORM pg_temp.ok((SELECT quantity=7 FROM public.user_inventory WHERE id=inv),'generic food unchanged');

  -- Five elapsed slots, two units: two dated meals and three missed days.
  UPDATE public.user_inventory SET quantity=2 WHERE id=inv;
  at_now:=clock_timestamp();
  UPDATE app_private.pet_care_state SET baseline_at=at_now-interval '120 hours',
    last_feed_at=at_now-interval '120 hours',last_care_at=at_now-interval '120 hours',
    next_feed_at=at_now-interval '96 hours',settled_through_at=at_now-interval '120 hours'
    WHERE companion_id=dog;
  PERFORM public.get_pet_care_state();
  PERFORM pg_temp.ok((SELECT count(*)=2 FROM app_private.pet_feed_receipts WHERE companion_id=dog)
    AND NOT EXISTS (SELECT 1 FROM public.user_inventory WHERE id=inv),'offline two meals');
  PERFORM pg_temp.ok((SELECT min(event_at)<at_now-interval '95 hours'
      AND max(event_at)<at_now-interval '71 hours'
      FROM app_private.pet_feed_receipts WHERE companion_id=dog),'dated meals');
  PERFORM pg_temp.ok(app_private.pet_care_participation(dog,at_now)=0.5,
    'three missed days cap food axis at half');
  PERFORM public.get_pet_care_state();
  PERFORM pg_temp.ok((SELECT count(*)=2 FROM app_private.pet_feed_receipts WHERE companion_id=dog),
    'idempotent settle');
  r:=public.buy_pet_food('dog',3,'d0000000-0000-0000-0000-000000000103');
  PERFORM pg_temp.ok(r->>'stock'='2' AND
    (SELECT count(*)=3 FROM app_private.pet_feed_receipts WHERE companion_id=dog)
    AND (SELECT max(event_at)>at_now FROM app_private.pet_feed_receipts WHERE companion_id=dog),
    'late lot one immediate meal');
  PERFORM pg_temp.ok((SELECT count(*)=0 FROM app_private.pet_feed_receipts
    WHERE companion_id=dog AND event_at>at_now-interval '71 hours' AND event_at<at_now),
    'late stock did not fill gap');
  -- Baseline alone gives 100/75/50 percent at 24/48/72 hours.
  UPDATE app_private.pet_care_state SET baseline_at=at_now-interval '72 hours',
    last_feed_at=at_now-interval '72 hours',last_care_at=at_now-interval '72 hours'
    WHERE companion_id=skeleton;
  PERFORM pg_temp.ok(app_private.pet_care_participation(skeleton,at_now-interval '48 hours')=1
    AND app_private.pet_care_participation(skeleton,at_now-interval '24 hours')=0.75
    AND app_private.pet_care_participation(skeleton,at_now)=0.5,'24/48/72 potency');
  r:=public.interact_pet_care(dog,'care','d0000000-0000-0000-0000-000000000104');
  PERFORM pg_temp.ok(r->>'effective'='true','first care effective');
  r:=public.interact_pet_care(dog,'play','d0000000-0000-0000-0000-000000000105');
  PERFORM pg_temp.ok(r->>'effective'='false','shared 12h cooldown');
  r:=public.interact_pet_care(dog,'care','d0000000-0000-0000-0000-000000000104');
  PERFORM pg_temp.ok(r->>'replayed'='true' AND
    (SELECT count(*)=1 FROM app_private.pet_care_events WHERE companion_id=dog AND effective),
    'care replay');
  BEGIN
    PERFORM public.interact_pet_care(dog,'play','d0000000-0000-0000-0000-000000000104');
    RAISE EXCEPTION 'care UUID action conflict accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  BEGIN
    PERFORM public.buy_pet_food('dog',31,'d0000000-0000-0000-0000-000000000107');
    RAISE EXCEPTION 'oversized lot accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  r:=public.buy_pet_food('dog',30,'d0000000-0000-0000-0000-000000000108');
  PERFORM pg_temp.ok(r->>'total'='750' AND r->>'gold'='0','max lot and exact balance');
  BEGIN
    PERFORM public.buy_pet_food('dog',1,'d0000000-0000-0000-0000-000000000109');
    RAISE EXCEPTION 'insufficient gold accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  PERFORM pg_temp.ok((SELECT gold=0 FROM public.user_balance WHERE user_id=u)
    AND (SELECT count(*)=3 FROM app_private.pet_food_purchase_requests WHERE user_id=u),
    'insufficient gold atomic');
  PERFORM pg_temp.ok((SELECT total_xp=before_xp FROM public.profiles WHERE user_id=u),
    'food and care no XP');
  RAISE NOTICE 'PET_CARE_FUNCTIONAL_PASS';
END $test$;
ROLLBACK;
