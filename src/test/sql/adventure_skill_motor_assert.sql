-- Apply after the reduced fixture chain and v3 migration, in an isolated DB.
CREATE FUNCTION pg_temp.ok(v boolean,m text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'assertion: %',m; END IF; END $$;
CREATE FUNCTION pg_temp.sim(a integer,d integer,h integer,m integer,
  skills jsonb DEFAULT '[]'::jsonb,resist jsonb DEFAULT '{}'::jsonb,
  element text DEFAULT 'physical') RETURNS jsonb LANGUAGE sql AS $$
  SELECT app_private.adventure_simulate_v3('2026-10-21 12:00Z',a,d,h,m,35,1000,
    skills,resist,element,0)
$$;

SELECT pg_temp.ok(((pg_temp.sim(65,20,500,20)->0->>'damage')::integer >
                   (pg_temp.sim(45,20,500,20)->0->>'damage')::integer),
  'ATK changes damage for same enemy');
SELECT pg_temp.ok(((pg_temp.sim(45,50,500,20)->1->>'damage')::integer <
                   (pg_temp.sim(45,20,500,20)->1->>'damage')::integer),
  'DEF reduces incoming damage for same enemy');
SELECT pg_temp.ok(((pg_temp.sim(45,22,500,20)->1->>'damage')::integer <
                   (pg_temp.sim(45,20,500,20)->1->>'damage')::integer),
  'two defense points alter a real hit');
SELECT pg_temp.ok(((pg_temp.sim(45,20,530,20)->1->>'hero_hp')::integer -
                   (pg_temp.sim(45,20,500,20)->1->>'hero_hp')::integer)=30,
  'HP bonus changes battle HP');
SELECT pg_temp.ok((pg_temp.sim(45,20,500,20)->0->>'hero_mp')::integer=20,
  'MP initializes at full capacity');

WITH casts AS (
  SELECT mp, (SELECT count(*) FROM jsonb_array_elements(pg_temp.sim(45,20,500,mp,
    '[{"id":"spell","name":"Spell","power":10,"effect":"physical","type":"dano","mp_cost":8,"cooldown":1}]'::jsonb)) e
    WHERE e->>'skill_id'='spell') AS n
  FROM (VALUES (8),(16)) x(mp)
)
SELECT pg_temp.ok((SELECT n FROM casts WHERE mp=16) > (SELECT n FROM casts WHERE mp=8),
  'MP capacity changes affordable casts');
SELECT pg_temp.ok(NOT EXISTS (
  SELECT 1 FROM jsonb_array_elements(pg_temp.sim(45,20,500,8,
    '[{"id":"spell","name":"Spell","power":10,"effect":"physical","type":"dano","mp_cost":8,"cooldown":1}]'::jsonb)) e
  WHERE (e->>'hero_mp')::integer<0), 'MP never negative');

WITH timeline AS (
  SELECT pg_temp.sim(45,20,500,50,
    '[{"id":"first","name":"First","power":20,"effect":"fire","type":"dano","mp_cost":8,"cooldown":2},
      {"id":"second","name":"Second","power":20,"effect":"ice","type":"dano","mp_cost":8,"cooldown":2}]'::jsonb) AS e
)
SELECT pg_temp.ok((e->0->>'skill_id')='first' AND (e->2->>'skill_id')='second'
  AND (e->4->>'skill_id') IS NULL AND (e->0->>'mp_cost')::integer=8
  AND (e->0->>'effect')='fire' AND (e->2->>'effect')='ice',
  'ordered rotation, costs, cooldown and VFX') FROM timeline;

SELECT pg_temp.ok((pg_temp.sim(45,20,500,50,
  '[{"id":"heal","name":"Heal","power":40,"effect":"light","type":"heal","mp_cost":8,"cooldown":2}]'::jsonb)
  ->2->>'healing')::integer>0, 'heal restores missing HP');
SELECT pg_temp.ok((pg_temp.sim(45,20,500,50,
  '[{"id":"buff","name":"Buff","power":45,"effect":"light","type":"buff","mp_cost":7,"cooldown":2}]'::jsonb)
  ->1->>'damage')::integer < (pg_temp.sim(45,20,500,50)->1->>'damage')::integer,
  'buff reduces incoming damage');
SELECT pg_temp.ok((pg_temp.sim(45,20,500,50,
  '[{"id":"n_escudo","name":"Shield","power":45,"effect":"light","type":"buff","mp_cost":7,"cooldown":3}]'::jsonb)
  ->3->>'damage')::integer = (pg_temp.sim(45,20,500,50)->3->>'damage')::integer,
  'shield covers exactly the next enemy hit');
SELECT pg_temp.ok((pg_temp.sim(45,20,500,50,
  '[{"id":"debuff","name":"Debuff","power":46,"effect":"physical","type":"debuff","mp_cost":5,"cooldown":2}]'::jsonb)
  ->2->>'damage')::integer > (pg_temp.sim(45,20,500,50)->2->>'damage')::integer,
  'debuff increases subsequent damage');
SELECT pg_temp.ok((pg_temp.sim(45,20,500,50,
  '[{"id":"gt_furtivo","name":"Strike","power":46,"effect":"physical","type":"debuff","strike":true,"mp_cost":5,"cooldown":2}]'::jsonb)
  ->0->>'damage')::integer > 0, 'canonical debuff strike deals damage');
SELECT pg_temp.ok((pg_temp.sim(45,20,500,50,
  '[{"id":"cc","name":"CC","power":48,"effect":"physical","type":"cc","mp_cost":7,"cooldown":2}]'::jsonb)
  ->1->>'damage')::integer=0, 'CC skips enemy attack');
SELECT pg_temp.ok((pg_temp.sim(45,20,500,50,
  '[{"id":"ferreiro_t1_pancada_atordoante","name":"Stun strike","power":48,"effect":"physical","type":"cc","strike":true,"mp_cost":7,"cooldown":3}]'::jsonb)
  ->0->>'damage')::integer > 0, 'canonical CC strike deals damage');
SELECT pg_temp.ok((pg_temp.sim(45,20,500,50,'[]'::jsonb,
  '{"fire":0.5}'::jsonb,'fire')->0->>'damage')::integer <
  (pg_temp.sim(45,20,500,50,'[]'::jsonb,'{}'::jsonb,'physical')->0->>'damage')::integer,
  'Asa fire resistance is creature specific');

SELECT pg_temp.ok(NOT has_function_privilege('anon',
  'app_private.adventure_simulate_v3(timestamptz,integer,integer,integer,integer,integer,integer,jsonb,jsonb,text,integer)',
  'EXECUTE') AND NOT has_function_privilege('authenticated',
  'app_private.adventure_simulate_v3(timestamptz,integer,integer,integer,integer,integer,integer,jsonb,jsonb,text,integer)',
  'EXECUTE'), 'private simulator ACL');
SELECT pg_temp.ok(NOT has_function_privilege('authenticated',
  'app_private.adventure_skill_tree_allowed(text,text,boolean)','EXECUTE'),
  'private class gate ACL');
SELECT pg_temp.ok((SELECT resistances->>'fire'='0.5' FROM app_private.adventure_enemy_catalog
  WHERE biome=3 AND slot=1), 'Asa catalog fire resistance');
SELECT pg_temp.ok((SELECT count(*)=1 FROM app_private.adventure_enemy_catalog
  WHERE resistances<>'{}'::jsonb), 'no global biome resistance');

INSERT INTO auth.users(id) VALUES
  ('44444444-4444-4444-4444-444444444444'),
  ('66666666-6666-6666-6666-666666666666'),
  ('77777777-7777-7777-7777-777777777777'),
  ('55555555-5555-5555-5555-555555555555'),
  ('88888888-8888-8888-8888-888888888888');
INSERT INTO public.profiles(user_id,level,starter_class,current_class_id) VALUES
  ('44444444-4444-4444-4444-444444444444',50,'guerreiro',NULL),
  ('66666666-6666-6666-6666-666666666666',50,'mago','00000002-0000-0000-0000-000000000002'),
  ('77777777-7777-7777-7777-777777777777',50,'mago','00000002-0000-0000-0000-000000000002'),
  ('55555555-5555-5555-5555-555555555555',50,'mago','00000002-0000-0000-0000-000000000002'),
  ('88888888-8888-8888-8888-888888888888',50,'guerreiro',NULL);
INSERT INTO public.attributes(user_id,name,level) VALUES
  ('44444444-4444-4444-4444-444444444444','forca',5),
  ('66666666-6666-6666-6666-666666666666','inteligencia',5),
  ('77777777-7777-7777-7777-777777777777','inteligencia',6),
  ('55555555-5555-5555-5555-555555555555','inteligencia',5),
  ('88888888-8888-8888-8888-888888888888','forca',5);
INSERT INTO public.game_items(id,category,rarity,is_consumable,effect,level_required,
  atk_bonus,matk_bonus,def_bonus,hp_bonus,mp_bonus,weapon_element)
VALUES('dddddddd-dddd-dddd-dddd-dddddddddddd','armor','comum',false,NULL,1,0,0,20,30,40,NULL);
INSERT INTO public.game_items(id,category,rarity,is_consumable,effect,level_required,
  atk_bonus,matk_bonus,def_bonus,hp_bonus,mp_bonus)
VALUES('cccccccc-cccc-cccc-cccc-cccccccccccc','weapon','comum',false,NULL,1,0,20,0,0,0),
      ('ffffffff-0000-0000-0000-000000000001','armor','comum',false,NULL,100,100,0,0,0,0),
      ('ffffffff-0000-0000-0000-000000000002','armor','comum',false,NULL,1,100,0,0,0,0);
UPDATE public.game_items SET weapon_element='fogo' WHERE id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
INSERT INTO public.user_inventory(user_id,item_id,quantity,equipped,sintonizado) VALUES
  ('44444444-4444-4444-4444-444444444444','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',1,true,false),
  ('44444444-4444-4444-4444-444444444444','dddddddd-dddd-dddd-dddd-dddddddddddd',1,true,false),
  ('55555555-5555-5555-5555-555555555555','cccccccc-cccc-cccc-cccc-cccccccccccc',1,true,false),
  ('55555555-5555-5555-5555-555555555555','ffffffff-0000-0000-0000-000000000001',1,true,false),
  ('55555555-5555-5555-5555-555555555555','ffffffff-0000-0000-0000-000000000002',0,true,false);
UPDATE public.profiles SET current_class_id=NULL WHERE user_id='33333333-3333-3333-3333-333333333333';
UPDATE public.profiles SET combat_skill_loadout='[{"id":"aprendiz-golpe","power":99999,"mpCost":0,"cooldown":0,"element":"sagrado"}]'::jsonb
WHERE user_id='22222222-2222-2222-2222-222222222222';

SET ROLE authenticated;
SET request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
SELECT public.sync_auto_adventure();
SET request.jwt.claim.sub='44444444-4444-4444-4444-444444444444';
SELECT public.sync_auto_adventure();
SET request.jwt.claim.sub='66666666-6666-6666-6666-666666666666';
SELECT public.sync_auto_adventure();
SET request.jwt.claim.sub='77777777-7777-7777-7777-777777777777';
SELECT public.sync_auto_adventure();
SET request.jwt.claim.sub='55555555-5555-5555-5555-555555555555';
SELECT public.sync_auto_adventure();
SET request.jwt.claim.sub='33333333-3333-3333-3333-333333333333';
SELECT public.sync_auto_adventure();
RESET ROLE;

SELECT pg_temp.ok((SELECT b.engine_version='v3' AND b.hero_max_mp>0 AND
  b.rules_snapshot->>'version'='v3' AND b.skills->0->>'name'='Golpe aprendido' AND
  (b.skills->0->>'power')::integer=40 AND (b.skills->0->>'mp_cost')::integer=5 AND
  (b.skills->0->>'cooldown')::integer=2 AND b.skills->0->>'effect'='fire'
  FROM app_private.adventure_battles b WHERE b.user_id='22222222-2222-2222-2222-222222222222'),
  'server catalog overrides forged loadout metadata');
SELECT pg_temp.ok((SELECT p ? 'hero_max_mp' AND p ? 'hero_mp' AND p ? 'hero_attack'
  AND p ? 'hero_defense' AND p ? 'enemy_resistances' AND p->'events'->0 ? 'mp_cost'
  AND (p->>'hero_mp')::integer=(p->>'hero_max_mp')::integer
  FROM app_private.adventure_battles b
  CROSS JOIN LATERAL app_private.adventure_battle_payload(b,b.started_at) p
  WHERE b.user_id='22222222-2222-2222-2222-222222222222'),
  'RPC payload v3 fields and full pre-event mana');
SET ROLE authenticated;
SET request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
WITH response AS (SELECT public.sync_auto_adventure() AS payload)
SELECT pg_temp.ok((payload->'limits'->>'interval_minutes')::numeric =
  round(extract(epoch FROM
    (payload->'battle'->>'ends_at')::timestamptz-
    (payload->'battle'->>'started_at')::timestamptz)/60,4),
  'public RPC advertises actual current battle duration') FROM response;
RESET ROLE;
SELECT pg_temp.ok((SELECT equipped.hero_attack>plain.hero_attack AND
  equipped.hero_defense>plain.hero_defense AND equipped.hero_max_hp>plain.hero_max_hp AND
  equipped.hero_max_mp>plain.hero_max_mp AND equipped.events->0->>'effect'='fire'
  FROM app_private.adventure_battles equipped,app_private.adventure_battles plain
  WHERE equipped.user_id='44444444-4444-4444-4444-444444444444'
    AND plain.user_id='22222222-2222-2222-2222-222222222222'),
  'owned gear affects ATK DEF HP MP and basic element');
SELECT pg_temp.ok((SELECT strong.hero_attack>base.hero_attack AND
  (strong.events->0->>'damage')::integer>(base.events->0->>'damage')::integer AND
  strong.hero_max_mp>base.hero_max_mp FROM app_private.adventure_battles strong,
  app_private.adventure_battles base WHERE strong.user_id='77777777-7777-7777-7777-777777777777'
  AND base.user_id='66666666-6666-6666-6666-666666666666'),
  'MATK and MP change from trained intelligence');
SELECT pg_temp.ok((SELECT geared.hero_attack=base.hero_attack+10 AND
  (geared.events->0->>'damage')::integer>(base.events->0->>'damage')::integer
  FROM app_private.adventure_battles geared,app_private.adventure_battles base
  WHERE geared.user_id='55555555-5555-5555-5555-555555555555'
    AND base.user_id='66666666-6666-6666-6666-666666666666'),
  'MATK gear uses half bonus; overlevel and zero-quantity items ignored');
SELECT pg_temp.ok((SELECT b.skills='[]'::jsonb FROM app_private.adventure_battles b
  WHERE b.user_id='33333333-3333-3333-3333-333333333333'),
  'editable starter alone cannot bypass current-class gate');
SELECT pg_temp.ok((SELECT p.total_xp=0 AND p.level=50 FROM public.profiles p
  WHERE p.user_id='22222222-2222-2222-2222-222222222222'),
  'combat does not grant XP or level');
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.gold_history
  WHERE type='adventure' AND user_id='22222222-2222-2222-2222-222222222222'),
  'battle start has no economic award');

INSERT INTO public.adventure_state(user_id,stage,attempt,last_tick_at)
VALUES('88888888-8888-8888-8888-888888888888',32,0,clock_timestamp());
SET ROLE authenticated;
SET request.jwt.claim.sub='88888888-8888-8888-8888-888888888888';
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.ok((SELECT enemy_name='Asa de brasa' AND
  enemy_resistances->>'fire'='0.5' FROM app_private.adventure_battles
  WHERE user_id='88888888-8888-8888-8888-888888888888'),
  'stage 32 Asa resistance snapshot');

-- The published five-node subset flows through allocation/class ownership
-- before its server-owned snapshot reaches the simulator.
INSERT INTO auth.users(id) VALUES
  ('90909090-0000-0000-0000-000000000001'),
  ('90909090-0000-0000-0000-000000000002'),
  ('90909090-0000-0000-0000-000000000003'),
  ('90909090-0000-0000-0000-000000000004');
INSERT INTO public.profiles(user_id,level,starter_class,current_class_id,combat_skill_loadout) VALUES
  ('90909090-0000-0000-0000-000000000001',10,'gatuno',
   '00000002-0000-0000-0000-000000000003','[{"id":"gt_furtivo","strike":false,"power":0}]'),
  ('90909090-0000-0000-0000-000000000002',10,'arqueiro',
   '00000002-0000-0000-0000-000000000006','[{"id":"a_vetor","strike":false,"power":0}]'),
  ('90909090-0000-0000-0000-000000000003',10,'ferreiro',
   '00000002-0000-0000-0000-000000000004','[{"id":"ferreiro_t1_pancada_atordoante","strike":false,"power":0}]'),
  ('90909090-0000-0000-0000-000000000004',10,'clerico',
   '00000002-0000-0000-0000-000000000005','[{"id":"n_escudo","strike":true,"power":9999}]');
INSERT INTO public.player_skill_nodes(user_id,node_id,rank) VALUES
  ('90909090-0000-0000-0000-000000000001','gt_furtivo',1),
  ('90909090-0000-0000-0000-000000000002','a_vetor',1),
  ('90909090-0000-0000-0000-000000000003','ferreiro_t1_pancada_atordoante',1),
  ('90909090-0000-0000-0000-000000000004','n_escudo',1);
SET ROLE authenticated;
SET request.jwt.claim.sub='90909090-0000-0000-0000-000000000001';
SELECT public.sync_auto_adventure();
SET request.jwt.claim.sub='90909090-0000-0000-0000-000000000002';
SELECT public.sync_auto_adventure();
SET request.jwt.claim.sub='90909090-0000-0000-0000-000000000003';
SELECT public.sync_auto_adventure();
SET request.jwt.claim.sub='90909090-0000-0000-0000-000000000004';
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.ok((SELECT bool_and(skills->0->>'strike'='true' AND
  (events->0->>'damage')::integer>0 AND events->0->>'effect_note' IN ('vulnerable','stunned'))
  FROM app_private.adventure_battles
  WHERE user_id IN ('90909090-0000-0000-0000-000000000001',
    '90909090-0000-0000-0000-000000000002',
    '90909090-0000-0000-0000-000000000003')),
  'three canonical debuff/CC nodes strike despite forged profile flags');
SELECT pg_temp.ok((SELECT skills->0->>'strike'='false' AND
  (events->0->>'damage')::integer=0 AND (events->1->>'damage')::integer>0 AND
  (events->3->>'damage')::integer>(events->1->>'damage')::integer
  FROM app_private.adventure_battles
  WHERE user_id='90909090-0000-0000-0000-000000000004'),
  'canonical n_escudo protects only the next hit despite forged profile flags');
