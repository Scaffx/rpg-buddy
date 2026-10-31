\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.ok(v boolean,m text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'AUTO_POTION_SIM: %',m; END IF; END $$;
DO $test$
DECLARE enemies jsonb; skill jsonb; events jsonb; hp_event jsonb; mp_event jsonb;
  first_hp timestamptz; first_mp timestamptz; at_exact timestamptz;
BEGIN
  enemies:=jsonb_build_array(jsonb_build_object('slot',0,'power',12,'max_hp',1000,
    'max_mp',0,'resistances','{}'::jsonb,'skill',NULL));
  events:=app_private.adventure_simulate_horde_potions('2026-10-29 12:00Z',1,0,100,0,
    enemies,'[]'::jsonb,'physical',0,NULL,
    jsonb_build_object('id','36aa16a5-153d-4c08-941e-ae3ee51d54d4','name','Poção de HP Menor','amount',30),NULL);
  SELECT x INTO STRICT hp_event FROM jsonb_array_elements(events) x WHERE x->>'skill_id'='consumable.hp';
  SELECT (x->>'at')::timestamptz INTO STRICT at_exact FROM jsonb_array_elements(events) x
    WHERE x->>'actor'='enemy' AND (x->>'hero_hp')::integer=25 LIMIT 1;
  PERFORM pg_temp.ok((hp_event->>'at')::timestamptz>at_exact AND
    (hp_event->>'healing')::integer=30 AND (hp_event->>'hero_hp')::integer=40,
    'strict HP threshold and healing');
  PERFORM pg_temp.ok(hp_event->>'kind'='skill' AND hp_event->>'skill_type'='heal'
    AND hp_event->>'effect'='light' AND hp_event->'target_slots'='[]'::jsonb
    AND hp_event->'hits'='[]'::jsonb AND hp_event->>'target_slot' IS NULL
    AND (hp_event->>'damage')::integer=0 AND (hp_event->>'mp_cost')::integer=0,
    'visual event is non-attack');
  PERFORM pg_temp.ok((SELECT count(*) FROM jsonb_array_elements(events) x
    WHERE x->>'skill_id'='consumable.hp')=1 AND jsonb_array_length(events)<=1200,
    'one HP and bounded events');
  PERFORM pg_temp.ok((hp_event->>'at')::timestamptz=(SELECT (x->>'at')::timestamptz
    FROM jsonb_array_elements(events) x WHERE x->>'actor'='enemy'
      AND (x->>'hero_hp')::integer=10 LIMIT 1), 'HP event uses crossing timestamp');

  skill:='[{"id":"test","name":"Test","power":1,"effect":"physical","type":"buff","mp_cost":4,"cooldown":0}]';
  events:=app_private.adventure_simulate_horde_potions('2026-10-29 12:00Z',1,100,1000,20,
    enemies,skill,'physical',0,NULL,NULL,
    jsonb_build_object('id','ea63052e-8530-4c4e-98ed-9d62a9cbf781','name','Poção de MP Menor','amount',20));
  SELECT x INTO STRICT mp_event FROM jsonb_array_elements(events) x WHERE x->>'skill_id'='consumable.mp';
  SELECT (x->>'at')::timestamptz INTO STRICT at_exact FROM jsonb_array_elements(events) x
    WHERE x->>'actor'='hero' AND (x->>'hero_mp')::integer=4 LIMIT 1;
  PERFORM pg_temp.ok((mp_event->>'at')::timestamptz>at_exact AND
    (mp_event->>'mp_restored')::integer=20 AND (mp_event->>'hero_mp')::integer=20,
    'strict MP threshold and capped recovery');
  PERFORM pg_temp.ok((SELECT count(*) FROM jsonb_array_elements(events) x
    WHERE x->>'skill_id'='consumable.mp')=1 AND (mp_event->>'healing')::integer=0,
    'one MP and no HP healing');

  enemies:=jsonb_set(enemies,'{0,power}','200'::jsonb);
  events:=app_private.adventure_simulate_horde_potions('2026-10-29 12:00Z',1,0,100,0,
    enemies,'[]'::jsonb,'physical',0,NULL,
    jsonb_build_object('id','36aa16a5-153d-4c08-941e-ae3ee51d54d4','name','Poção','amount',30),NULL);
  PERFORM pg_temp.ok((events->-1->>'hero_hp')::integer=0 AND NOT EXISTS
    (SELECT 1 FROM jsonb_array_elements(events) x WHERE x->>'skill_id'='consumable.hp'),
    'dead hero never drinks');
  RAISE NOTICE 'AUTO_POTIONS_SIMULATE_PASS';
END $test$;
ROLLBACK;
