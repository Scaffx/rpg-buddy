\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.ok(p_ok boolean,p_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF p_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'PET_CARE_BATTLE: %',p_label; END IF; END $$;
DO $test$
DECLARE u uuid:='c0000000-0000-0000-0000-000000000201';
  pet uuid; other_pet uuid; food uuid; before_xp integer; b app_private.adventure_battles%ROWTYPE;
  after_b app_private.adventure_battles%ROWTYPE; snap jsonb; events jsonb; r jsonb;
BEGIN
  INSERT INTO auth.users(id) VALUES(u);
  INSERT INTO public.profiles(user_id,level,starter_class,total_xp) VALUES(u,20,'novato',700);
  INSERT INTO public.user_balance(user_id,balance_percent,gold) VALUES(u,100,1000)
    ON CONFLICT (user_id) DO UPDATE SET gold=1000;
  INSERT INTO public.companions(user_id,companion_type,origin,name)
    VALUES(u,'mini_kraken','shop','Kraken') RETURNING id INTO pet;
  INSERT INTO public.companions(user_id,companion_type,origin,name)
    VALUES(u,'dog','lvl3_choice','Dog') RETURNING id INTO other_pet;
  INSERT INTO app_private.adventure_pet_allowlist(user_id) VALUES(u);
  PERFORM set_config('request.jwt.claim.sub',u::text,true);
  PERFORM public.set_active_adventure_pet(pet);
  PERFORM public.set_adventure_auto_potions_enabled(true);
  INSERT INTO public.user_inventory(user_id,item_id,quantity,equipped) VALUES
    (u,'36aa16a5-153d-4c08-941e-ae3ee51d54d4',1,false);
  SELECT item_id INTO food FROM app_private.pet_food_catalog WHERE pet_type='mini_kraken';
  UPDATE app_private.pet_care_state SET baseline_at=clock_timestamp()-interval '72 hours',
    last_care_at=clock_timestamp()-interval '72 hours',
    last_feed_at=clock_timestamp()-interval '5 minutes',
    next_feed_at=clock_timestamp()+interval '23 hours',
    settled_through_at=clock_timestamp()-interval '5 minutes'
    WHERE companion_id=pet;
  INSERT INTO app_private.pet_feed_receipts(companion_id,user_id,item_id,event_at)
    VALUES(pet,u,food,clock_timestamp()-interval '5 minutes');
  SELECT total_xp INTO before_xp FROM public.profiles WHERE user_id=u;
  r:=public.sync_auto_adventure();
  SELECT * INTO STRICT b FROM app_private.adventure_battles
    WHERE user_id=u ORDER BY started_at DESC LIMIT 1;
  PERFORM pg_temp.ok(b.engine_version='v4_horde'
    AND b.rules_snapshot->'auto_potions'->>'enabled'='true'
    AND jsonb_array_length(b.rules_snapshot->'enemies')=3,
    'horde and auto potions retained');
  PERFORM pg_temp.ok(b.rules_snapshot->'pet'->>'participation'='0.500000'
    AND b.rules_snapshot->'pet'->'effective_bonus'->>'pct'='0.050000'
    AND b.rules_snapshot->'pet'->'effective_sustain'->>'pct'='0.025000',
    'effective potency frozen');
  PERFORM pg_temp.ok(b.hero_max_hp=round((b.rules_snapshot->'pet'->'base_stats'->>'hp')::numeric*1.05)::integer
    AND b.rules_snapshot->'pet'->'effective_stats'->>'hp'=b.hero_max_hp::text,
    'effective attribute used');
  PERFORM pg_temp.ok(r->'battle'->'pet'=b.rules_snapshot->'pet',
    'public battle pet uses snapshot');
  PERFORM pg_temp.ok((SELECT total_xp=before_xp FROM public.profiles WHERE user_id=u),
    'battle creation no XP');
  snap:=b.rules_snapshot; events:=b.events;
  PERFORM public.interact_pet_care(pet,'care','d0000000-0000-0000-0000-000000000201');
  PERFORM public.buy_pet_food('mini_kraken',1,'d0000000-0000-0000-0000-000000000202');
  PERFORM public.set_active_adventure_pet(other_pet);
  PERFORM public.sync_auto_adventure();
  SELECT * INTO STRICT after_b FROM app_private.adventure_battles WHERE id=b.id;
  PERFORM pg_temp.ok(after_b.rules_snapshot=snap AND after_b.events=events,
    'late care buy and switch cannot rewrite battle');
  -- A subsequent battle is allowed to reflect the new selection and care.
  UPDATE app_private.adventure_battles SET status='draw' WHERE id=b.id;
  UPDATE public.adventure_state SET current_battle_id=NULL,
    last_tick_at=clock_timestamp() WHERE user_id=u;
  PERFORM public.sync_auto_adventure();
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM app_private.adventure_battles x
    WHERE x.user_id=u AND x.id<>b.id AND x.rules_snapshot->'pet'->>'companion_id'=other_pet::text),
    'next battle uses new selection');
  RAISE NOTICE 'PET_CARE_BATTLE_PASS';
END $test$;
ROLLBACK;
