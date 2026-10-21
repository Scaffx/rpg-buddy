-- Independent review probe. Run only after the reduced v3 fixture/migrations.
-- All fixture mutations are rolled back; the database remains available for audit.
BEGIN;

DO $probe$
DECLARE
  base jsonb;
  boosted jsonb;
  guarded jsonb;
  ordered jsonb;
  rotated jsonb;
  resisted jsonb;
  plain jsonb;
  marking jsonb;
  healing jsonb;
  shielding jsonb;
  stunning jsonb;
  stalemate jsonb;
  e jsonb;
BEGIN
  base := app_private.adventure_simulate_v3(now(),40,20,500,100,40,1000,
    '[]'::jsonb,'{}'::jsonb,'physical',0);
  boosted := app_private.adventure_simulate_v3(now(),60,20,500,100,40,1000,
    '[]'::jsonb,'{}'::jsonb,'physical',0);
  guarded := app_private.adventure_simulate_v3(now(),40,40,500,100,40,1000,
    '[]'::jsonb,'{}'::jsonb,'physical',0);
  IF (boosted->0->>'damage')::int <= (base->0->>'damage')::int THEN
    RAISE EXCEPTION 'ATK boost did not change uncapped damage';
  END IF;
  IF (guarded->1->>'damage')::int >= (base->1->>'damage')::int THEN
    RAISE EXCEPTION 'DEF boost did not change uncapped damage';
  END IF;

  ordered := app_private.adventure_simulate_v3(now(),40,20,500,5,40,1000,
    '[{"id":"expensive","name":"Expensive","type":"dano","power":80,"effect":"fire","mp_cost":10,"cooldown":2},
      {"id":"free","name":"Free","type":"dano","power":20,"effect":"arcane","mp_cost":0,"cooldown":2}]'::jsonb,
    '{}'::jsonb,'physical',0);
  rotated := app_private.adventure_simulate_v3(now(),40,20,500,5,40,1000,
    '[{"id":"a","name":"A","type":"dano","power":20,"effect":"fire","mp_cost":0,"cooldown":2},
      {"id":"b","name":"B","type":"dano","power":20,"effect":"arcane","mp_cost":0,"cooldown":2}]'::jsonb,
    '{}'::jsonb,'physical',1);
  IF ordered->0->>'skill_id' <> 'free' OR rotated->0->>'skill_id' <> 'b' THEN
    RAISE EXCEPTION 'readiness or initial rotation wrong';
  END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(ordered) LOOP
    IF (e->>'hero_mp')::int < 0 OR (e->>'mp_cost')::int < 0 THEN
      RAISE EXCEPTION 'negative MP/cost';
    END IF;
  END LOOP;

  plain := app_private.adventure_simulate_v3(now(),40,20,500,100,40,1000,
    '[{"id":"fire","name":"Fire","type":"dano","power":40,"effect":"fire","mp_cost":5,"cooldown":2}]'::jsonb,
    '{}'::jsonb,'physical',0);
  resisted := app_private.adventure_simulate_v3(now(),40,20,500,100,40,1000,
    '[{"id":"fire","name":"Fire","type":"dano","power":40,"effect":"fire","mp_cost":5,"cooldown":2}]'::jsonb,
    '{"fire":0.5}'::jsonb,'physical',0);
  IF (resisted->0->>'damage')::int >= (plain->0->>'damage')::int
     OR (resisted->0->>'damage_multiplier')::numeric <> 0.5 THEN
    RAISE EXCEPTION 'element resistance did not affect fire damage';
  END IF;
  marking := app_private.adventure_simulate_v3(now(),40,20,500,100,40,1000,
    '[{"id":"gt_furtivo","name":"Golpe Furtivo","type":"debuff","power":46,"effect":"physical","mp_cost":5,"cooldown":2,"strike":true}]'::jsonb,
    '{}'::jsonb,'physical',0);
  IF (marking->0->>'damage')::int<=0 OR marking->0->>'effect_note'<>'vulnerable' THEN
    RAISE EXCEPTION 'canonical strike/debuff missing';
  END IF;
  healing := app_private.adventure_simulate_v3(now(),40,0,100,100,40,1000,
    '[{"id":"n_cura","name":"Cura Menor","type":"heal","power":40,"effect":"light","mp_cost":8,"cooldown":3}]'::jsonb,
    '{}'::jsonb,'physical',0);
  IF healing->0->>'skill_id' IS NOT NULL
    OR healing->2->>'skill_id'<>'n_cura'
    OR (healing->2->>'healing')::int<=0
    OR (healing->2->>'hero_mp')::int<>92 THEN
    RAISE EXCEPTION 'healing/readiness semantics wrong';
  END IF;
  shielding := app_private.adventure_simulate_v3(now(),40,0,500,100,40,1000,
    '[{"id":"n_escudo","name":"Escudo","type":"buff","power":50,"effect":"light","mp_cost":7,"cooldown":3}]'::jsonb,
    '{}'::jsonb,'physical',0);
  IF shielding->0->>'effect_note'<>'guard'
    OR (shielding->1->>'damage')::int >= (shielding->1->>'raw_damage')::int
    OR (shielding->3->>'damage')::int<>(shielding->3->>'raw_damage')::int THEN
    RAISE EXCEPTION 'buff did not reduce enemy damage';
  END IF;
  stunning := app_private.adventure_simulate_v3(now(),40,20,500,100,40,1000,
    '[{"id":"ferreiro_t1_pancada_atordoante","name":"Pancada Atordoante","type":"cc","power":48,"effect":"physical","mp_cost":7,"cooldown":3,"strike":true}]'::jsonb,
    '{}'::jsonb,'physical',0);
  IF stunning->0->>'effect_note'<>'stunned'
    OR (stunning->0->>'damage')::int<=0
    OR (stunning->1->>'damage')::int<>0
    OR (stunning->0->>'hero_mp')::int<>93 THEN
    RAISE EXCEPTION 'cc stun/cost semantics wrong';
  END IF;
  stalemate := app_private.adventure_simulate_v3(now(),1,500,1000,0,400,1000,
    '[]'::jsonb,'{}'::jsonb,'physical',0);
  IF jsonb_array_length(stalemate)<>320
    OR (stalemate->-1->>'hero_hp')::int<=0
    OR (stalemate->-1->>'enemy_hp')::int<=0 THEN
    RAISE EXCEPTION 'bounded stalemate wrong';
  END IF;
  RAISE NOTICE 'independent simulator ATK/DEF, readiness, rotation, MP, heal/buff/debuff/cc and resistance PASS';
END;
$probe$;

DO $probe$
DECLARE
  first_battle jsonb;
  original_atk integer;
  original_id uuid;
  original_skills jsonb;
  original_rules jsonb;
  original_events jsonb;
  old_xp integer;
  new_battle app_private.adventure_battles%ROWTYPE;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',
    '22222222-2222-2222-2222-222222222222', true);
  SELECT total_xp INTO old_xp FROM public.profiles
    WHERE user_id='22222222-2222-2222-2222-222222222222';
  first_battle := public.sync_auto_adventure()->'battle';
  original_id := (first_battle->>'id')::uuid;
  original_atk := (first_battle->>'hero_attack')::integer;
  SELECT skills,rules_snapshot,events INTO original_skills,original_rules,original_events
    FROM app_private.adventure_battles WHERE id=original_id;
  UPDATE public.profiles SET combat_skill_loadout='[]'::jsonb, level=1
    WHERE user_id='22222222-2222-2222-2222-222222222222';
  UPDATE public.attributes SET level=50
    WHERE user_id='22222222-2222-2222-2222-222222222222';
  SELECT * INTO new_battle FROM app_private.adventure_battles WHERE id=original_id;
  IF new_battle.hero_attack <> original_atk
    OR new_battle.skills<>original_skills
    OR new_battle.rules_snapshot<>original_rules
    OR new_battle.events<>original_events THEN
    RAISE EXCEPTION 'active battle snapshot changed';
  END IF;
  IF (SELECT total_xp FROM public.profiles
      WHERE user_id='22222222-2222-2222-2222-222222222222') <> old_xp THEN
    RAISE EXCEPTION 'adventure changed XP';
  END IF;
  RAISE NOTICE 'independent active snapshot and XP PASS battle_id=%',original_id;
END;
$probe$;

DO $probe$
BEGIN
  IF has_function_privilege('authenticated',
       'app_private.adventure_simulate_v3(timestamptz,integer,integer,integer,integer,integer,integer,jsonb,jsonb,text,integer)',
       'EXECUTE')
    OR has_function_privilege('anon',
       'app_private.adventure_simulate_v3(timestamptz,integer,integer,integer,integer,integer,integer,jsonb,jsonb,text,integer)',
       'EXECUTE') THEN
    RAISE EXCEPTION 'private simulator has client EXECUTE grant';
  END IF;
  RAISE NOTICE 'independent simulator ACL PASS';
END;
$probe$;

-- The boss needs more than eight turns, but the tank must reach a real result
-- rather than being falsely defeated while still alive.
DO $probe$
DECLARE
  battle_id uuid;
  fight app_private.adventure_battles%ROWTYPE;
  final_event jsonb;
  state public.adventure_state%ROWTYPE;
  delta interval;
BEGIN
  UPDATE public.profiles SET level=10
    WHERE user_id='11111111-1111-1111-1111-111111111111';
  UPDATE public.game_items SET def_bonus=20,hp_bonus=100
    WHERE id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  INSERT INTO public.user_inventory(user_id,item_id,quantity,equipped)
    VALUES('11111111-1111-1111-1111-111111111111',
           'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',1,true);
  INSERT INTO public.adventure_state(user_id,stage,attempt,last_tick_at)
    VALUES('11111111-1111-1111-1111-111111111111',10,0,clock_timestamp());
  PERFORM set_config('request.jwt.claim.sub',
    '11111111-1111-1111-1111-111111111111', true);
  battle_id := (public.sync_auto_adventure()->'battle'->>'id')::uuid;
  SELECT * INTO fight FROM app_private.adventure_battles WHERE id=battle_id;
  final_event := fight.events->-1;
  IF jsonb_array_length(fight.events)<=16
    OR (final_event->>'hero_hp')::int<=0 OR (final_event->>'enemy_hp')::int<>0 THEN
    RAISE EXCEPTION 'boss should resolve after prior 16-event boundary: event=%',final_event;
  END IF;
  delta := clock_timestamp()-interval '2 seconds'-fight.ends_at;
  UPDATE app_private.adventure_battles b
    SET started_at=b.started_at+delta,
        ends_at=b.ends_at+delta,
        events=(SELECT jsonb_agg(jsonb_set(e,'{at}',
          to_jsonb((e->>'at')::timestamptz+delta)) ORDER BY ord)
          FROM jsonb_array_elements(b.events) WITH ORDINALITY x(e,ord))
    WHERE b.id=battle_id;
  PERFORM public.sync_auto_adventure();
  SELECT * INTO fight FROM app_private.adventure_battles WHERE id=battle_id;
  SELECT * INTO state FROM public.adventure_state
    WHERE user_id='11111111-1111-1111-1111-111111111111';
  RAISE NOTICE 'boss settlement status=% stage=% mode=% bosswins=%',
    fight.status,state.stage,state.adventure_mode,
    (SELECT count(*) FROM public.boss_battles
      WHERE user_id='11111111-1111-1111-1111-111111111111'
        AND boss_id=fight.boss_id AND won);
  IF fight.status<>'won' OR state.stage<>11 OR state.adventure_mode<>'progressing'
    OR (SELECT count(*) FROM public.boss_battles
      WHERE user_id='11111111-1111-1111-1111-111111111111'
        AND boss_id=fight.boss_id AND won)<>1 THEN
    RAISE EXCEPTION 'boss10 true victory/entitlement failed';
  END IF;
  RAISE NOTICE 'BOSS10_RESOLVED_AFTER_16 battle=% hero_hp=% enemy_hp=% stage=%',
    battle_id,final_event->>'hero_hp',final_event->>'enemy_hp',state.stage;
END;
$probe$;

DO $probe$
DECLARE
  battle_id uuid;
  old_xp integer;
  gold_rows integer;
  gold_sum integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',
    '22222222-2222-2222-2222-222222222222', true);
  SELECT current_battle_id INTO battle_id FROM public.adventure_state
    WHERE user_id='22222222-2222-2222-2222-222222222222';
  SELECT total_xp INTO old_xp FROM public.profiles
    WHERE user_id='22222222-2222-2222-2222-222222222222';
  UPDATE app_private.adventure_battles b
    SET started_at=b.started_at-interval '30 seconds',
        ends_at=b.ends_at-interval '30 seconds',
        events=(SELECT jsonb_agg(jsonb_set(e,'{at}',
          to_jsonb((e->>'at')::timestamptz-interval '30 seconds')) ORDER BY ord)
          FROM jsonb_array_elements(b.events) WITH ORDINALITY x(e,ord))
    WHERE b.id=battle_id;
  PERFORM public.sync_auto_adventure();
  SELECT count(*),coalesce(sum(amount),0) INTO gold_rows,gold_sum
    FROM public.gold_history WHERE user_id='22222222-2222-2222-2222-222222222222'
      AND type='adventure';
  PERFORM public.sync_auto_adventure();
  IF gold_rows<>1 OR gold_sum<>4 OR
    (SELECT count(*) FROM public.gold_history
      WHERE user_id='22222222-2222-2222-2222-222222222222' AND type='adventure')<>1
    OR (SELECT total_xp FROM public.profiles
      WHERE user_id='22222222-2222-2222-2222-222222222222')<>old_xp THEN
    RAISE EXCEPTION 'economic or XP duplicate after retry';
  END IF;
  RAISE NOTICE 'independent one-time gold and no-XP retry PASS';
END;
$probe$;

DO $probe$
DECLARE
  battle_id uuid;
  prior app_private.adventure_battles%ROWTYPE;
  state public.adventure_state%ROWTYPE;
  older_count integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',
    '33333333-3333-3333-3333-333333333333', true);
  battle_id := (public.sync_auto_adventure()->'battle'->>'id')::uuid;
  SELECT * INTO prior FROM app_private.adventure_battles WHERE id=battle_id;
  UPDATE public.profiles SET level=50,combat_skill_loadout='[]'::jsonb
    WHERE user_id='33333333-3333-3333-3333-333333333333';
  UPDATE public.attributes SET level=50
    WHERE user_id='33333333-3333-3333-3333-333333333333';
  UPDATE app_private.adventure_battles b
    SET started_at=b.started_at-interval '1 hour',
        ends_at=b.ends_at-interval '1 hour',
        events=(SELECT jsonb_agg(jsonb_set(e,'{at}',
          to_jsonb((e->>'at')::timestamptz-interval '1 hour')) ORDER BY ord)
          FROM jsonb_array_elements(b.events) WITH ORDINALITY x(e,ord))
    WHERE b.id=battle_id;
  PERFORM public.sync_auto_adventure();
  SELECT * INTO state FROM public.adventure_state
    WHERE user_id='33333333-3333-3333-3333-333333333333';
  SELECT count(*) INTO older_count FROM app_private.adventure_battles b
    WHERE b.user_id='33333333-3333-3333-3333-333333333333'
      AND b.id<>battle_id AND b.started_at<clock_timestamp()-interval '30 seconds';
  IF older_count<2 OR EXISTS (
    SELECT 1 FROM app_private.adventure_battles b
    WHERE b.user_id='33333333-3333-3333-3333-333333333333'
      AND b.id<>battle_id AND b.started_at<clock_timestamp()-interval '30 seconds'
      AND (b.hero_attack IS DISTINCT FROM prior.hero_attack
        OR b.hero_defense IS DISTINCT FROM prior.hero_defense
        OR b.hero_max_hp IS DISTINCT FROM prior.hero_max_hp
        OR b.hero_max_mp IS DISTINCT FROM prior.hero_max_mp
        OR b.skills IS DISTINCT FROM prior.skills
        OR b.rules_snapshot IS DISTINCT FROM prior.rules_snapshot)) THEN
    RAISE EXCEPTION 'offline battle used current build';
  END IF;
  IF state.gold_today>120 OR state.loot_today>2
    OR state.last_tick_at>clock_timestamp()-interval '30 minutes' THEN
    RAISE EXCEPTION 'offline economy cap/cursor changed';
  END IF;
  RAISE NOTICE 'independent offline frozen build/caps/cursor PASS battles=%',older_count;
END;
$probe$;

DO $probe$
DECLARE
  battle_id uuid;
  fight app_private.adventure_battles%ROWTYPE;
  state public.adventure_state%ROWTYPE;
  step integer;
BEGIN
  INSERT INTO auth.users(id) VALUES('44444444-4444-4444-4444-444444444444');
  INSERT INTO public.profiles(user_id,level,starter_class)
    VALUES('44444444-4444-4444-4444-444444444444',1,'guerreiro');
  INSERT INTO public.adventure_state(user_id,stage,attempt,last_tick_at)
    VALUES('44444444-4444-4444-4444-444444444444',10,0,clock_timestamp());
  PERFORM set_config('request.jwt.claim.sub',
    '44444444-4444-4444-4444-444444444444', true);
  PERFORM public.sync_auto_adventure();
  FOR step IN 1..2 LOOP
    SELECT * INTO state FROM public.adventure_state
      WHERE user_id='44444444-4444-4444-4444-444444444444';
    battle_id := state.current_battle_id;
    SELECT * INTO fight FROM app_private.adventure_battles WHERE id=battle_id;
    IF (fight.events->-1->>'hero_hp')::int<>0 THEN
      RAISE EXCEPTION 'cascade fixture lacked real hero death stage=%',state.stage;
    END IF;
    UPDATE app_private.adventure_battles b
      SET started_at=b.started_at-interval '30 seconds',
          ends_at=b.ends_at-interval '30 seconds',
          events=(SELECT jsonb_agg(jsonb_set(e,'{at}',
            to_jsonb((e->>'at')::timestamptz-interval '30 seconds')) ORDER BY ord)
            FROM jsonb_array_elements(b.events) WITH ORDINALITY x(e,ord))
      WHERE b.id=battle_id;
    PERFORM public.sync_auto_adventure();
    SELECT * INTO state FROM public.adventure_state
      WHERE user_id='44444444-4444-4444-4444-444444444444';
    IF state.stage<>9 OR state.adventure_mode<>'holding' THEN
      RAISE EXCEPTION 'unexpected retreat result stage=% mode=%',
        state.stage,state.adventure_mode;
    END IF;
  END LOOP;
  RAISE NOTICE 'HOLDING_STABLE two true deaths ended at stage 9 without advance';
END;
$probe$;

DO $probe$
DECLARE
  battle_id uuid;
  fight app_private.adventure_battles%ROWTYPE;
  final_event jsonb;
  state public.adventure_state%ROWTYPE;
  delta interval;
  response jsonb;
BEGIN
  INSERT INTO auth.users(id) VALUES('55555555-5555-5555-5555-555555555555');
  INSERT INTO public.profiles(user_id,level,starter_class,combat_skill_loadout)
    VALUES('55555555-5555-5555-5555-555555555555',1,'guerreiro',
           '[{"id":"aprendiz-cura"}]'::jsonb);
  INSERT INTO public.player_skill_nodes(user_id,node_id,rank)
    VALUES('55555555-5555-5555-5555-555555555555','aprendiz-cura',1);
  INSERT INTO public.game_items(id,category,rarity,is_consumable,effect,
      level_required,def_bonus,hp_bonus,mp_bonus)
    VALUES('dddddddd-dddd-dddd-dddd-dddddddddddd','armor','comum',false,NULL,
      1,500,1000,1000);
  INSERT INTO public.user_inventory(user_id,item_id,quantity,equipped)
    VALUES('55555555-5555-5555-5555-555555555555',
           'dddddddd-dddd-dddd-dddd-dddddddddddd',1,true);
  INSERT INTO public.adventure_state(user_id,stage,attempt,last_tick_at)
    VALUES('55555555-5555-5555-5555-555555555555',250,0,clock_timestamp());
  PERFORM set_config('request.jwt.claim.sub',
    '55555555-5555-5555-5555-555555555555', true);
  battle_id := (public.sync_auto_adventure()->'battle'->>'id')::uuid;
  SELECT * INTO fight FROM app_private.adventure_battles WHERE id=battle_id;
  final_event := fight.events->-1;
  IF jsonb_array_length(fight.events)<>320
    OR (final_event->>'hero_hp')::int<=0 OR (final_event->>'enemy_hp')::int<=0 THEN
    RAISE EXCEPTION 'draw fixture did not reach living turn limit';
  END IF;
  delta := clock_timestamp()-interval '2 seconds'-fight.ends_at;
  UPDATE app_private.adventure_battles b
    SET started_at=b.started_at+delta,
        ends_at=b.ends_at+delta,
        events=(SELECT jsonb_agg(jsonb_set(e,'{at}',
          to_jsonb((e->>'at')::timestamptz+delta)) ORDER BY ord)
          FROM jsonb_array_elements(b.events) WITH ORDINALITY x(e,ord))
    WHERE b.id=battle_id;
  response := public.sync_auto_adventure();
  SELECT * INTO fight FROM app_private.adventure_battles WHERE id=battle_id;
  SELECT * INTO state FROM public.adventure_state
    WHERE user_id='55555555-5555-5555-5555-555555555555';
  IF fight.status<>'draw' OR state.stage<>250
    OR state.last_result->>'status'<>'draw'
    OR state.last_result->>'end_reason'<>'turn_limit'
    OR (response->'catchup'->>'draws')::int<>1
    OR EXISTS (SELECT 1 FROM public.gold_history
      WHERE user_id='55555555-5555-5555-5555-555555555555')
    OR EXISTS (SELECT 1 FROM public.boss_battles
      WHERE user_id='55555555-5555-5555-5555-555555555555' AND won) THEN
    RAISE EXCEPTION 'living draw paid or retreated';
  END IF;
  RAISE NOTICE 'DRAW_320_LIVING no gold, boss entitlement or retreat';
END;
$probe$;

DO $probe$
DECLARE
  battle app_private.adventure_battles%ROWTYPE;
BEGIN
  INSERT INTO auth.users(id) VALUES('66666666-6666-6666-6666-666666666666');
  INSERT INTO public.profiles(user_id,level,starter_class,current_class_id,combat_skill_loadout)
    VALUES('66666666-6666-6666-6666-666666666666',10,'gatuno',
           '00000002-0000-0000-0000-000000000003',
           '[{"id":"gt_furtivo","strike":false,"power":99999}]'::jsonb);
  INSERT INTO public.player_skill_nodes(user_id,node_id,rank)
    VALUES('66666666-6666-6666-6666-666666666666','gt_furtivo',1);
  PERFORM set_config('request.jwt.claim.sub',
    '66666666-6666-6666-6666-666666666666', true);
  PERFORM public.sync_auto_adventure();
  SELECT * INTO battle FROM app_private.adventure_battles
    WHERE user_id='66666666-6666-6666-6666-666666666666';
  IF battle.skills->0->>'strike'<>'true'
    OR (battle.skills->0->>'power')::int<>46
    OR battle.skills->0->>'type'<>'debuff'
    OR (battle.events->0->>'damage')::int<=0
    OR battle.events->0->>'effect_note'<>'vulnerable' THEN
    RAISE EXCEPTION 'cataloged strike did not override forged loadout';
  END IF;
  RAISE NOTICE 'independent canonical strike ignores forged loadout PASS';
END;
$probe$;

DO $probe$
DECLARE
  base app_private.adventure_battles%ROWTYPE;
  magic app_private.adventure_battles%ROWTYPE;
  invalid app_private.adventure_battles%ROWTYPE;
  uid uuid;
BEGIN
  INSERT INTO auth.users(id) VALUES
    ('77777777-7777-7777-7777-777777777777'),
    ('88888888-8888-8888-8888-888888888888'),
    ('99999999-9999-9999-9999-999999999999');
  INSERT INTO public.profiles(user_id,level,starter_class,current_class_id)
    VALUES
    ('77777777-7777-7777-7777-777777777777',10,'mago','00000002-0000-0000-0000-000000000002'),
    ('88888888-8888-8888-8888-888888888888',10,'mago','00000002-0000-0000-0000-000000000002'),
    ('99999999-9999-9999-9999-999999999999',10,'mago','00000002-0000-0000-0000-000000000002');
  INSERT INTO public.game_items(id,category,rarity,is_consumable,effect,
      level_required,atk_bonus,matk_bonus,def_bonus)
    VALUES
    ('aaaaaaaa-0000-0000-0000-000000000001','armor','comum',false,NULL,1,0,20,0),
    ('aaaaaaaa-0000-0000-0000-000000000002','armor','comum',false,NULL,99,999,0,999),
    ('aaaaaaaa-0000-0000-0000-000000000003','armor','comum',false,NULL,1,999,0,999);
  INSERT INTO public.user_inventory(user_id,item_id,quantity,equipped)
    VALUES
    ('88888888-8888-8888-8888-888888888888','aaaaaaaa-0000-0000-0000-000000000001',1,true),
    ('99999999-9999-9999-9999-999999999999','aaaaaaaa-0000-0000-0000-000000000002',1,true),
    ('99999999-9999-9999-9999-999999999999','aaaaaaaa-0000-0000-0000-000000000003',0,true);
  FOR uid IN SELECT unnest(ARRAY[
      '77777777-7777-7777-7777-777777777777'::uuid,
      '88888888-8888-8888-8888-888888888888'::uuid,
      '99999999-9999-9999-9999-999999999999'::uuid]) LOOP
    PERFORM set_config('request.jwt.claim.sub',uid::text,true);
    PERFORM public.sync_auto_adventure();
  END LOOP;
  SELECT * INTO base FROM app_private.adventure_battles
    WHERE user_id='77777777-7777-7777-7777-777777777777';
  SELECT * INTO magic FROM app_private.adventure_battles
    WHERE user_id='88888888-8888-8888-8888-888888888888';
  SELECT * INTO invalid FROM app_private.adventure_battles
    WHERE user_id='99999999-9999-9999-9999-999999999999';
  IF magic.hero_attack<>base.hero_attack+10
    OR (magic.events->0->>'damage')::int<=(base.events->0->>'damage')::int
    OR invalid.hero_attack<>base.hero_attack
    OR invalid.hero_defense<>base.hero_defense THEN
    RAISE EXCEPTION 'MATK parity or invalid gear filter failed';
  END IF;
  RAISE NOTICE 'independent MATK +20 => attack +10 and damage rises; overlevel/quantity0 ignored PASS';
END;
$probe$;

DO $probe$
DECLARE
  battle_id uuid;
  state public.adventure_state%ROWTYPE;
BEGIN
  INSERT INTO auth.users(id) VALUES('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab');
  INSERT INTO public.profiles(user_id,level,starter_class)
    VALUES('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab',50,'guerreiro');
  INSERT INTO public.adventure_state(user_id,stage,attempt,last_tick_at,adventure_mode)
    VALUES('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab',9,0,clock_timestamp(),'holding');
  PERFORM set_config('request.jwt.claim.sub',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab', true);
  battle_id := (public.sync_auto_adventure()->'battle'->>'id')::uuid;
  PERFORM public.advance_auto_adventure(battle_id);
  SELECT * INTO state FROM public.adventure_state
    WHERE user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab';
  IF NOT state.advance_requested OR state.stage<>9
    OR state.current_battle_id<>battle_id
    OR (SELECT status FROM app_private.adventure_battles WHERE id=battle_id)<>'fighting'
    OR EXISTS(SELECT 1 FROM public.gold_history
      WHERE user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab') THEN
    RAISE EXCEPTION 'advance crossed current-battle clock guard';
  END IF;
  BEGIN
    PERFORM public.advance_auto_adventure('00000000-0000-0000-0000-000000000000');
    RAISE EXCEPTION 'stale battle id accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  RAISE NOTICE 'independent advance current-id/clock guard and stale-id PASS';
END;
$probe$;

-- Final SHA contract: authenticated RPC limit matches this payload's battle timeline.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab';
DO $probe$
DECLARE
  payload jsonb;
  battle jsonb;
  limit_seconds numeric;
  timeline_seconds numeric;
BEGIN
  IF current_user <> 'authenticated' THEN
    RAISE EXCEPTION 'duration probe did not run as authenticated';
  END IF;
  payload := public.sync_auto_adventure();
  battle := payload->'battle';
  IF battle IS NULL OR battle = 'null'::jsonb THEN
    RAISE EXCEPTION 'duration probe requires a current battle in the RPC payload';
  END IF;
  limit_seconds := (payload->'limits'->>'interval_minutes')::numeric * 60;
  timeline_seconds := EXTRACT(EPOCH FROM
    ((battle->>'ends_at')::timestamptz - (battle->>'started_at')::timestamptz));
  IF limit_seconds IS NULL OR timeline_seconds IS NULL
    OR abs(limit_seconds - timeline_seconds) > 0.003 THEN
    RAISE EXCEPTION 'RPC limit/timeline mismatch: limit_seconds=%, timeline_seconds=%',
      limit_seconds, timeline_seconds;
  END IF;
  RAISE NOTICE 'independent authenticated limit/timeline PASS: limit_seconds=%, timeline_seconds=%',
    limit_seconds, timeline_seconds;
END;
$probe$;
RESET ROLE;

ROLLBACK;
