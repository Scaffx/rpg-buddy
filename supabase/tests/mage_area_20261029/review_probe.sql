\set ON_ERROR_STOP on
BEGIN;
DO $probe$
DECLARE
  enemies jsonb := jsonb_build_array(
    jsonb_build_object('slot',0,'power',10,'max_hp',1000,'max_mp',0,'resistances','{}'::jsonb),
    jsonb_build_object('slot',1,'power',20,'max_hp',1000,'max_mp',0,'resistances','{}'::jsonb),
    jsonb_build_object('slot',2,'power',30,'max_hp',1000,'max_mp',0,'resistances','{}'::jsonb));
  skill jsonb := '[{"id":"m_fogo_var","name":"Meteoro","power":60,"effect":"fire","type":"dano","mp_cost":30,"cooldown":0,"target_mode":"all_enemies"}]'::jsonb;
  events jsonb;
  first_cast jsonb;
  second_cast jsonb;
BEGIN
  events := app_private.adventure_simulate_horde('2026-10-29 12:00Z',35,20,1000,100,
    enemies,skill,'physical',0,'{"kind":"regen_mp","pct":0.1}'::jsonb);
  SELECT event INTO STRICT first_cast FROM jsonb_array_elements(events) event
    WHERE event->>'actor'='hero' LIMIT 1;
  IF first_cast->'target_slots' <> '[0,1,2]'::jsonb
     OR (first_cast->>'hero_mp')::integer <> 80
     OR (first_cast->>'mp_cost')::integer <> 30 THEN
    RAISE EXCEPTION 'REVIEW_PROBE_MP_PER_CAST: %',first_cast;
  END IF;

  enemies := jsonb_set(jsonb_set(enemies,'{0,max_hp}','1'::jsonb),'{1,max_hp}','1'::jsonb);
  skill := jsonb_set(skill,'{0,mp_cost}','0'::jsonb);
  events := app_private.adventure_simulate_horde('2026-10-29 12:00Z',35,20,1000,100,
    enemies,skill,'physical',0,NULL);
  SELECT event INTO STRICT first_cast FROM jsonb_array_elements(events) event
    WHERE event->>'actor'='hero' LIMIT 1;
  SELECT event INTO STRICT second_cast FROM jsonb_array_elements(events) event
    WHERE event->>'actor'='hero' OFFSET 1 LIMIT 1;
  IF first_cast->'target_slots' <> '[0,1,2]'::jsonb
     OR second_cast->'target_slots' <> '[2]'::jsonb
     OR (second_cast->>'target_slot')::integer <> 2
     OR jsonb_array_length(second_cast->'hits') <> 1
     OR (second_cast->'damage')::integer <> (second_cast->'hits'->0->>'damage')::integer
     OR second_cast->'enemies_hp'->0 <> '0'::jsonb
     OR second_cast->'enemies_hp'->1 <> '0'::jsonb THEN
    RAISE EXCEPTION 'REVIEW_PROBE_ONE_SURVIVOR: first=% second=%',first_cast,second_cast;
  END IF;
  RAISE NOTICE 'MAGE_AREA_REVIEW_PROBE_PASS';
END $probe$;
ROLLBACK;
