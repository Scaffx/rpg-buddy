\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.ok(v boolean,m text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'MAGE_AREA_ASSERT: %',m; END IF; END $$;
DO $test$
DECLARE
  enemies jsonb;
  area_skill jsonb:='[{"id":"m_fogo_var","name":"Meteoro","power":60,"effect":"fire","type":"dano","mp_cost":8,"cooldown":1,"target_mode":"all_enemies"}]';
  events jsonb; first_hit jsonb; second_hit jsonb; single_events jsonb;
  marked jsonb; boss jsonb; heal_events jsonb; buff_events jsonb;
BEGIN
  enemies:=jsonb_build_array(
    jsonb_build_object('slot',0,'power',10,'max_hp',1000,'max_mp',0,'resistances',jsonb_build_object('fire',0.5),'skill',NULL),
    jsonb_build_object('slot',1,'power',20,'max_hp',1000,'max_mp',0,'resistances',jsonb_build_object('fire',1),'skill',NULL),
    jsonb_build_object('slot',2,'power',30,'max_hp',1000,'max_mp',0,'resistances',jsonb_build_object('fire',1.5),'skill',NULL));
  events:=app_private.adventure_simulate_horde('2026-10-29 12:00Z',35,20,1000,50,
    enemies,area_skill,'physical',0,NULL);
  first_hit:=events->2;
  PERFORM pg_temp.ok(events->0->>'actor'='enemy' AND events->1->>'actor'='enemy'
    AND first_hit->>'actor'='hero' AND (first_hit->>'at')::timestamptz='2026-10-29 12:00:01.5Z',
    'four independent clocks and first hero time');
  PERFORM pg_temp.ok(NOT (events->0 ? 'hits') AND NOT (events->0 ? 'target_slots'),
    'enemy events omit hero target arrays');
  PERFORM pg_temp.ok(first_hit->'target_slots'='[0,1,2]'::jsonb
    AND jsonb_array_length(first_hit->'hits')=3 AND (first_hit->>'target_slot')::integer=0,
    'three ordered unique slots in one event');
  PERFORM pg_temp.ok((first_hit->>'damage')::integer=
    (SELECT sum((hit->>'damage')::integer) FROM jsonb_array_elements(first_hit->'hits') hit)
    AND (first_hit->>'hero_mp')::integer=42 AND (first_hit->>'mp_cost')::integer=8,
    'aggregate damage and one MP cost');
  PERFORM pg_temp.ok(NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(first_hit->'hits') hit
    WHERE (hit->>'damage')::integer<=0 OR
      (first_hit->'enemies_hp'->>(hit->>'target_slot')::integer)::integer<>
        1000-(hit->>'damage')::integer),
    'each HP bar changes in the same event');
  PERFORM pg_temp.ok((first_hit->'hits'->0->>'raw_damage')::integer>
      (first_hit->'hits'->2->>'raw_damage')::integer
    AND (first_hit->'hits'->0->>'damage_multiplier')::numeric=0.5
    AND (first_hit->'hits'->1->>'damage_multiplier')::numeric=1
    AND (first_hit->'hits'->2->>'damage_multiplier')::numeric=1.5,
    'per-target power and resistance');
  PERFORM pg_temp.ok(NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(events) WITH ORDINALITY e(x,n)
    WHERE n<=8 AND (x->>'at')::timestamptz IS DISTINCT FROM
      (app_private.adventure_simulate_horde('2026-10-29 12:00Z',35,20,1000,50,
        enemies,'[]'::jsonb,'physical',0,NULL)->((n-1)::integer)->>'at')::timestamptz),
    'AoE does not postpone or accelerate any clock');
  SELECT x INTO second_hit FROM jsonb_array_elements(events) x
    WHERE x->>'skill_id'='m_fogo_var' AND x<>first_hit ORDER BY (x->>'at')::timestamptz LIMIT 1;
  PERFORM pg_temp.ok(second_hit IS NOT NULL AND
    (second_hit->>'at')::timestamptz-(first_hit->>'at')::timestamptz>=interval '5.6 seconds',
    'one cooldown per cast');
  single_events:=app_private.adventure_simulate_horde('2026-10-29 12:00Z',35,20,1000,50,
    enemies,jsonb_set(area_skill,'{0,id}','"m_bola_fogo"'::jsonb),'physical',0,NULL);
  PERFORM pg_temp.ok(single_events->2->'target_slots'='[0]'::jsonb
    AND jsonb_array_length(single_events->2->'hits')=1,
    'base fireball is single even if a forged snapshot requests area');
  single_events:=app_private.adventure_simulate_horde('2026-10-29 12:00Z',35,20,1000,50,
    enemies,jsonb_set(area_skill,'{0,id}','"m_arc_var"'::jsonb),'physical',0,NULL);
  PERFORM pg_temp.ok(single_events->2->'target_slots'='[0]'::jsonb,
    'Singularidade is single');
  single_events:=app_private.adventure_simulate_horde('2026-10-29 12:00Z',35,20,1000,50,
    enemies,jsonb_set(area_skill,'{0,target_mode}','"single"'::jsonb),'physical',0,NULL);
  PERFORM pg_temp.ok(single_events->2->'target_slots'='[0]'::jsonb,
    'variant without server area mode stays single');
  events:=app_private.adventure_simulate_horde('2026-10-29 12:00Z',35,20,1000,100,
    jsonb_set(enemies,'{0,max_hp}','1'::jsonb),area_skill,'physical',0,NULL);
  SELECT x INTO first_hit FROM jsonb_array_elements(events) x
    WHERE x->>'skill_id'='m_fogo_var' ORDER BY (x->>'at')::timestamptz LIMIT 1;
  SELECT x INTO second_hit FROM jsonb_array_elements(events) x
    WHERE x->>'skill_id'='m_fogo_var' AND x<>first_hit ORDER BY (x->>'at')::timestamptz LIMIT 1;
  PERFORM pg_temp.ok(first_hit->'target_slots'='[0,1,2]'::jsonb
    AND second_hit->'target_slots'='[1,2]'::jsonb
    AND (second_hit->>'target_slot')::integer=1
    AND (second_hit->'enemies_hp'->>0)::integer=0,
    'dead slot skipped in later area cast');
  marked:=app_private.adventure_simulate_horde('2026-10-29 12:00Z',35,20,1000,50,
    enemies,jsonb_build_array(jsonb_build_object('id','mark','name','mark','power',50,
      'effect','fire','type','debuff','mp_cost',0,'cooldown',1),area_skill->0),
    'physical',0,NULL);
  PERFORM pg_temp.ok(marked->2->'target_slots'='[0]'::jsonb
    AND marked->2->'hits'='[{"target_slot":0,"damage":0,"raw_damage":0,"damage_multiplier":1}]'::jsonb
    AND (marked->2->>'target_slot')::integer=0
    AND (marked->2->>'damage')::integer=0
    AND marked->2->'enemies_hp'='[1000,1000,1000]'::jsonb,
    'non-strike debuff exposes zero-damage hit without changing HP');
  SELECT x INTO first_hit FROM jsonb_array_elements(marked) x
    WHERE x->>'skill_id'='m_fogo_var' ORDER BY (x->>'at')::timestamptz LIMIT 1;
  PERFORM pg_temp.ok((first_hit->'hits'->0->>'damage_multiplier')::numeric=0.625
    AND (first_hit->'hits'->1->>'damage_multiplier')::numeric=1,
    'vulnerability applies to marked slot only');
  marked:=app_private.adventure_simulate_horde('2026-10-29 12:00Z',35,20,1000,50,
    enemies,'[{"id":"stun","name":"Stun","power":20,"effect":"physical","type":"cc","mp_cost":0,"cooldown":1}]',
    'physical',0,NULL);
  PERFORM pg_temp.ok(marked->2->'target_slots'='[0]'::jsonb
    AND marked->2->'hits'='[{"target_slot":0,"damage":0,"raw_damage":0,"damage_multiplier":1}]'::jsonb
    AND (marked->2->>'damage')::integer=0
    AND marked->2->'enemies_hp'='[1000,1000,1000]'::jsonb,
    'non-strike control exposes zero-damage hit without changing HP');
  boss:=app_private.adventure_simulate_horde('2026-10-29 12:00Z',35,20,1000,50,
    jsonb_build_array(enemies->0),area_skill,'physical',0,NULL);
  PERFORM pg_temp.ok(boss->1->'target_slots'='[0]'::jsonb
    AND jsonb_array_length(boss->1->'hits')=1,'boss remains one target');
  heal_events:=app_private.adventure_simulate_horde('2026-10-29 12:00Z',35,20,1000,50,
    enemies,'[{"id":"heal","name":"Heal","power":40,"effect":"light","type":"heal","mp_cost":4,"cooldown":1}]',
    'physical',0,NULL);
  buff_events:=app_private.adventure_simulate_horde('2026-10-29 12:00Z',35,20,1000,50,
    enemies,'[{"id":"buff","name":"Buff","power":40,"effect":"light","type":"buff","mp_cost":4,"cooldown":1}]',
    'physical',0,NULL);
  PERFORM pg_temp.ok(heal_events->2->>'skill_id'='heal'
    AND heal_events->2->'hits'='[]'::jsonb AND heal_events->2->'target_slots'='[]'::jsonb
    AND heal_events->2->>'target_slot' IS NULL AND (heal_events->2->>'damage')::integer=0
    AND buff_events->2->>'skill_id'='buff'
    AND buff_events->2->'hits'='[]'::jsonb AND buff_events->2->'target_slots'='[]'::jsonb
    AND buff_events->2->>'target_slot' IS NULL AND (buff_events->2->>'damage')::integer=0,
    'heal and buff have empty hit arrays');
  RAISE NOTICE 'MAGE_AREA_SIMULATE_PASS';
END $test$;
ROLLBACK;
