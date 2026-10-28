\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.ok(v boolean,m text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'HORDE_ASSERT: %',m; END IF; END $$;

DO $sim$
DECLARE v_enemies jsonb; v_events jsonb; v_first timestamptz;
  v_base jsonb; v_variant jsonb;
BEGIN
  v_enemies:=jsonb_build_array(
    jsonb_build_object('slot',0,'id','a','name','A','icon',NULL,'boss_id',NULL,
      'power',10,'max_hp',100,'max_mp',20,'resistances',jsonb_build_object(),
      'skill',jsonb_build_object('id','a_skill','name','A skill','effect','physical',
        'power',10,'mp_cost',6,'cooldown_ms',6000)),
    jsonb_build_object('slot',1,'id','b','name','B','icon',NULL,'boss_id',NULL,
      'power',10,'max_hp',100,'max_mp',20,'resistances',jsonb_build_object(),
      'skill',jsonb_build_object('id','b_skill','name','B skill','effect','physical',
        'power',10,'mp_cost',6,'cooldown_ms',6000)),
    jsonb_build_object('slot',2,'id','c','name','C','icon',NULL,'boss_id',NULL,
      'power',10,'max_hp',100,'max_mp',20,'resistances',jsonb_build_object(),
      'skill',jsonb_build_object('id','c_skill','name','C skill','effect','arcane',
        'power',10,'mp_cost',6,'cooldown_ms',6000)));
  v_events:=app_private.adventure_simulate_horde('2026-10-28 12:00Z',
    35,20,1000,50,v_enemies,
    '[{"id":"hero_spell","name":"Spell","power":20,"effect":"fire","type":"dano","mp_cost":8,"cooldown":2}]'::jsonb,
    'physical',0,NULL);
  PERFORM pg_temp.ok(jsonb_array_length(v_events)>6 AND jsonb_array_length(v_events)<=1200,
    'bounded event timeline');
  v_first:=(v_events->0->>'at')::timestamptz;
  PERFORM pg_temp.ok(v_events->0->>'actor'='enemy'
    AND v_events->1->>'actor'='enemy'
    AND (v_events->0->>'actor_slot')::integer=0
    AND (v_events->1->>'actor_slot')::integer=1
    AND (v_events->2->>'actor')='hero'
    AND (v_events->3->>'actor_slot')::integer=2,
    'three independent clocks, two enemy attacks before first hero action');
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM jsonb_array_elements(v_events) WITH ORDINALITY x(e,n)
    WHERE n>3 AND e->>'actor'='enemy' AND
      (e->>'at')::timestamptz <
      (SELECT (z.e->>'at')::timestamptz FROM jsonb_array_elements(v_events)
        WITH ORDINALITY z(e,n) WHERE z.n>3 AND z.e->>'actor'='hero' ORDER BY z.n LIMIT 1)),
    'enemy acts before next hero clock');
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM jsonb_array_elements(v_events) e
    WHERE e->>'skill_id'='hero_spell' AND (e->>'hero_mp')::integer<50),
    'hero skill consumes own MP');
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM jsonb_array_elements(v_events) e
    WHERE e->>'skill_id'='a_skill' AND (e->>'enemy_mp')::integer<20),
    'enemy skill consumes own MP');
  PERFORM pg_temp.ok(NOT EXISTS (
    SELECT 1 FROM (
      SELECT e->>'skill_id' id,(e->>'at')::timestamptz at,
        lag((e->>'at')::timestamptz) OVER
          (PARTITION BY e->>'skill_id' ORDER BY (e->>'at')::timestamptz) prior
      FROM jsonb_array_elements(v_events) e WHERE e->>'skill_id' IN
        ('hero_spell','a_skill','b_skill','c_skill')) casts
    WHERE prior IS NOT NULL AND
      at-prior<CASE WHEN id='hero_spell' THEN interval '8.4 seconds'
        ELSE interval '6 seconds' END),
    'skill cooldowns expire by actor clock time');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_events) e
    WHERE (e->>'hero_mp')::integer<0
      OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(e->'enemies_mp') m WHERE m::integer<0)),
    'all MP balances remain nonnegative');
  PERFORM pg_temp.ok((v_events->-1->>'enemy_hp')::integer=0,
    'win requires all three enemy HP bars at zero');
  v_base:=app_private.adventure_simulate_horde('2026-10-28 12:00Z',
    35,0,1000,50,v_enemies,'[]'::jsonb,'physical',0,NULL);
  v_variant:=app_private.adventure_simulate_horde('2026-10-28 12:00Z',
    35,0,1000,50,
    jsonb_set(v_enemies,'{0,resistances}',jsonb_build_object('fire',0.5)),
    '[]'::jsonb,'fire',0,NULL);
  PERFORM pg_temp.ok((v_variant->2->>'damage')::integer<
    (v_base->2->>'damage')::integer,
    'target-specific elemental resistance reduces damage');
  v_variant:=app_private.adventure_simulate_horde('2026-10-28 12:00Z',
    35,0,1000,50,v_enemies,'[]'::jsonb,'physical',0,
    '{"kind":"regen_hp","pct":0.05}'::jsonb);
  PERFORM pg_temp.ok((v_variant->2->>'hero_hp')::integer>
    (v_base->2->>'hero_hp')::integer,
    'pet HP sustain runs on hero clock');
  v_variant:=app_private.adventure_simulate_horde('2026-10-28 12:00Z',
    35,0,1000,50,v_enemies,
    '[{"id":"spell","name":"Spell","power":20,"effect":"fire","type":"dano","mp_cost":8,"cooldown":2}]'::jsonb,
    'physical',0,'{"kind":"mp_cost","pct":0.20}'::jsonb);
  PERFORM pg_temp.ok((v_variant->2->>'mp_cost')::integer=6,
    'pet MP discount applies to actual hero skill cost');
  v_variant:=app_private.adventure_simulate_horde('2026-10-28 12:00Z',
    35,0,1000,50,v_enemies,
    '[{"id":"guard","name":"Guard","power":50,"effect":"light","type":"buff","mp_cost":0,"cooldown":2}]'::jsonb,
    'physical',0,NULL);
  PERFORM pg_temp.ok((v_variant->3->>'damage')::integer <
    (v_base->3->>'damage')::integer
    AND (v_variant->4->>'damage')::integer=(v_base->4->>'damage')::integer,
    'guard applies to one enemy hit, not to the entire horde');
  v_variant:=app_private.adventure_simulate_horde('2026-10-28 12:00Z',
    35,0,1000,50,v_enemies,
    '[{"id":"stun","name":"Stun","power":20,"effect":"physical","type":"cc","mp_cost":0,"cooldown":2}]'::jsonb,
    'physical',0,NULL);
  PERFORM pg_temp.ok((v_variant->3->>'damage')::integer>0
    AND (v_variant->4->>'actor_slot')::integer=0
    AND (v_variant->4->>'damage')::integer=0
    AND v_variant->4->>'effect_note'='stunned',
    'CC blocks the selected enemy clock only');
  v_variant:=app_private.adventure_simulate_horde('2026-10-28 12:00Z',
    35,0,1000,50,v_enemies,
    '[{"id":"mark","name":"Mark","power":50,"effect":"physical","type":"debuff","mp_cost":0,"cooldown":2}]'::jsonb,
    'physical',0,NULL);
  PERFORM pg_temp.ok((v_variant->5->>'damage')::integer >
    (v_base->5->>'damage')::integer,
    'debuff increases damage to its selected living target');
  v_events:=app_private.adventure_simulate_horde('2026-10-28 12:00Z',
    1,100000,100000,0,
    (SELECT jsonb_agg(e||jsonb_build_object('max_hp',10000,'power',1)
      ORDER BY (e->>'slot')::integer) FROM jsonb_array_elements(v_enemies) e),
    '[]'::jsonb,'physical',0,NULL);
  PERFORM pg_temp.ok(jsonb_array_length(v_events)>192
    AND jsonb_array_length(v_events)<=1200
    AND (v_events->-1->>'at')::timestamptz <= '2026-10-28 12:15Z'::timestamptz
    AND (v_events->-1->>'hero_hp')::integer>0
    AND (v_events->-1->>'enemy_hp')::integer>0,
    'bounded draw has neither fake death nor fake victory');
  v_events:=app_private.adventure_simulate_horde('2026-10-28 12:00Z',
    1,0,1,0,v_enemies,'[]'::jsonb,'physical',0,NULL);
  PERFORM pg_temp.ok(jsonb_array_length(v_events)=1
    AND (v_events->-1->>'hero_hp')::integer=0,
    'enemy clock can defeat hero before any hero action');
  v_events:=app_private.adventure_simulate_horde('2026-10-28 12:00Z',
    1,0,80,0,
    (SELECT jsonb_agg(e||jsonb_build_object('max_hp',
      CASE WHEN (e->>'slot')::integer=0 THEN 1 ELSE 500 END,'power',20)
      ORDER BY (e->>'slot')::integer) FROM jsonb_array_elements(v_enemies) e),
    '[]'::jsonb,'physical',0,NULL);
  PERFORM pg_temp.ok((v_events->2->'enemies_hp'->>0)::integer=0
    AND (v_events->2->>'enemy_hp')::integer>0
    AND (v_events->-1->>'hero_hp')::integer=0
    AND (v_events->-1->>'enemy_hp')::integer>0,
    'killing slot zero is not victory while other enemies survive');
END $sim$;

INSERT INTO auth.users(id) VALUES
  ('a0000000-0000-0000-0000-00000000a401'),
  ('a0000000-0000-0000-0000-00000000a402'),
  ('a0000000-0000-0000-0000-00000000a403');
INSERT INTO public.profiles(user_id,level,starter_class) VALUES
  ('a0000000-0000-0000-0000-00000000a401',100,'guerreiro'),
  ('a0000000-0000-0000-0000-00000000a402',100,'guerreiro'),
  ('a0000000-0000-0000-0000-00000000a403',100,'guerreiro');
INSERT INTO public.attributes(user_id,name,xp,level)
  VALUES('a0000000-0000-0000-0000-00000000a401','Força',20,10);
INSERT INTO public.adventure_state(user_id,last_tick_at,stage)
  VALUES('a0000000-0000-0000-0000-00000000a401',clock_timestamp(),10);
INSERT INTO public.adventure_state(user_id,last_tick_at,stage)
  VALUES('a0000000-0000-0000-0000-00000000a402',clock_timestamp(),1);

SET ROLE authenticated;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000a401';
DO $$ BEGIN PERFORM public.sync_auto_adventure(); END $$;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000a403';
DO $$ BEGIN PERFORM public.sync_auto_adventure(); END $$;
RESET ROLE;
SELECT pg_temp.ok((SELECT kind='boss' AND engine_version='v4_horde'
  AND jsonb_array_length(rules_snapshot->'enemies')=1
  AND (rules_snapshot->'enemies'->0->>'boss_id')::uuid=boss_id
  AND enemy_max_hp=150
  AND (events->-1->>'enemy_hp')::integer=0
  FROM app_private.adventure_battles WHERE user_id='a0000000-0000-0000-0000-00000000a401'),
  'stage 10 singular boss');
SELECT pg_temp.ok((SELECT jsonb_array_length(
  app_private.adventure_battle_payload(b,clock_timestamp())->'enemies')=1
  FROM app_private.adventure_battles b WHERE user_id='a0000000-0000-0000-0000-00000000a401'),
  'boss payload contains one enemy');
SELECT pg_temp.ok((SELECT kind='normal' AND engine_version='v4_horde'
  AND jsonb_array_length(rules_snapshot->'enemies')=3
  AND enemy_max_hp=102
  AND (SELECT count(DISTINCT enemy->>'name')=3
    FROM jsonb_array_elements(rules_snapshot->'enemies') enemy)
  AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(rules_snapshot->'enemies') enemy
    WHERE enemy->'skill'<>'null'::jsonb OR (enemy->>'max_mp')::integer<>0)
  FROM app_private.adventure_battles WHERE user_id='a0000000-0000-0000-0000-00000000a403'),
  'normal horde has three catalog enemies, conserved HP pool and no invented skill');
SELECT pg_temp.ok((SELECT total_xp=0 AND level=100 FROM public.profiles
  WHERE user_id='a0000000-0000-0000-0000-00000000a401'),
  'battle creation does not mutate progression');
UPDATE app_private.adventure_battles SET status='draw'
  WHERE user_id='a0000000-0000-0000-0000-00000000a403';
SELECT pg_temp.ok((SELECT app_private.adventure_battle_payload(b,clock_timestamp())
  ->>'end_reason'='event_limit' FROM app_private.adventure_battles b
  WHERE user_id='a0000000-0000-0000-0000-00000000a403'),
  'v4 draw reason names event limit, without turns');

UPDATE app_private.adventure_battles b
  SET started_at=b.started_at-make_interval(secs=>s.seconds),
      ends_at=b.ends_at-make_interval(secs=>s.seconds),
      events=(SELECT jsonb_agg(jsonb_set(e,'{at}',
        to_jsonb((e->>'at')::timestamptz-make_interval(secs=>s.seconds))) ORDER BY ord)
        FROM jsonb_array_elements(b.events) WITH ORDINALITY x(e,ord))
  FROM (SELECT greatest(1,ceil(extract(epoch FROM max(ends_at)-clock_timestamp()))::integer) seconds
    FROM app_private.adventure_battles
    WHERE user_id='a0000000-0000-0000-0000-00000000a401') s
  WHERE b.user_id='a0000000-0000-0000-0000-00000000a401';
SET ROLE authenticated;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000a401';
DO $$ BEGIN PERFORM public.sync_auto_adventure(); PERFORM public.sync_auto_adventure(); END $$;
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.adventure_encounters
  WHERE user_id='a0000000-0000-0000-0000-00000000a401' AND stage=10 AND won),
  'one first-clear receipt for whole horde');
SELECT pg_temp.ok((SELECT count(*)=1 AND sum(amount) BETWEEN 1 AND 48
  FROM public.gold_history WHERE user_id='a0000000-0000-0000-0000-00000000a401'
    AND type='adventure'), 'one gold ledger for whole horde');
SELECT pg_temp.ok((SELECT count(*)=1 FROM app_private.adventure_chest_win_receipts
  WHERE user_id='a0000000-0000-0000-0000-00000000a401')
  AND (SELECT count(*)=1 FROM app_private.boss_recipe_battle_receipts
    WHERE user_id='a0000000-0000-0000-0000-00000000a401')
  AND (SELECT count(*)=1 FROM app_private.boss_material_windows
    WHERE user_id='a0000000-0000-0000-0000-00000000a401'),
  'one chest, recipe and material window per boss battle');
SELECT pg_temp.ok((SELECT total_xp=0 AND level=100 FROM public.profiles
  WHERE user_id='a0000000-0000-0000-0000-00000000a401'),
  'settlement leaves XP and level unchanged');
SELECT pg_temp.ok((SELECT xp=20 AND level=10 FROM public.attributes
  WHERE user_id='a0000000-0000-0000-0000-00000000a401' AND name='Força'),
  'settlement leaves permanent attributes unchanged');
SELECT pg_temp.ok((SELECT count(*)=1 FROM app_private.adventure_battles
  WHERE user_id='a0000000-0000-0000-0000-00000000a401' AND stage=10),
  'retries do not duplicate battle');

SELECT pg_temp.ok(NOT has_function_privilege('anon',
  'app_private.adventure_simulate_horde(timestamptz,integer,integer,integer,integer,jsonb,jsonb,text,integer,jsonb)',
  'EXECUTE') AND NOT has_function_privilege('authenticated',
  'app_private.adventure_simulate_horde(timestamptz,integer,integer,integer,integer,jsonb,jsonb,text,integer,jsonb)',
  'EXECUTE') AND has_function_privilege('authenticated','public.sync_auto_adventure()','EXECUTE')
  AND NOT has_function_privilege('anon','public.sync_auto_adventure()','EXECUTE'),
  'private simulator and public wrapper ACL');
SELECT pg_temp.ok((SELECT p.proowner='postgres'::regrole AND p.prosecdef
    AND p.proacl::text='{postgres=X/postgres,authenticated=X/postgres}'
    FROM pg_proc p WHERE p.oid='app_private.sync_auto_adventure()'::regprocedure)
  AND (SELECT p.proowner='postgres'::regrole AND p.prosecdef
    AND p.proacl::text='{postgres=X/postgres}'
    FROM pg_proc p WHERE p.oid=
      'app_private.adventure_battle_payload(app_private.adventure_battles,timestamptz)'::regprocedure)
  AND (SELECT c.relrowsecurity AND NOT c.relforcerowsecurity
    AND c.relacl::text='{postgres=arwdDxtm/postgres}'
    FROM pg_class c WHERE c.oid='app_private.adventure_battles'::regclass),
  'replaced functions and protected battle table retain owner ACL RLS');

SELECT set_config('horde.test_battle_id',id::text,true)
  FROM app_private.adventure_battles
  WHERE user_id='a0000000-0000-0000-0000-00000000a401' AND stage=10 LIMIT 1;

SET ROLE authenticated;
RESET request.jwt.claim.sub;
DO $$ BEGIN
  BEGIN PERFORM public.sync_auto_adventure();
    RAISE EXCEPTION 'anonymous identity accepted';
  EXCEPTION WHEN SQLSTATE '28000' THEN NULL; END;
END $$;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000a402';
DO $$ BEGIN
  BEGIN PERFORM public.advance_auto_adventure(
    current_setting('horde.test_battle_id')::uuid);
    RAISE EXCEPTION 'cross identity advance accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
END $$;
RESET ROLE;
SELECT pg_temp.ok((SELECT NOT advance_requested AND current_battle_id IS NULL
  FROM public.adventure_state
  WHERE user_id='a0000000-0000-0000-0000-00000000a402')
  AND (SELECT count(*)=1 FROM public.gold_history
    WHERE user_id='a0000000-0000-0000-0000-00000000a401' AND type='adventure'),
  'cross-identity rejection is atomic for both identities');
ROLLBACK;
