-- Apply after the 20261019 fixtures/migrations and continuous engine.
CREATE FUNCTION pg_temp.ok(v boolean,m text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'assertion: %',m; END IF; END $$;
CREATE FUNCTION pg_temp.forward(u uuid,s integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 UPDATE app_private.adventure_battles b SET started_at=b.started_at-make_interval(secs=>s),
 ends_at=b.ends_at-make_interval(secs=>s),events=(SELECT jsonb_agg(jsonb_set(e,'{at}',
 to_jsonb((e->>'at')::timestamptz-make_interval(secs=>s))) ORDER BY ord)
 FROM jsonb_array_elements(b.events) WITH ORDINALITY x(e,ord))
 WHERE b.id=(SELECT current_battle_id FROM public.adventure_state WHERE user_id=u);
END $$;
SELECT pg_temp.ok(NOT has_function_privilege('anon','public.sync_auto_adventure()','EXECUTE'),'anon sync');
SELECT pg_temp.ok(NOT has_function_privilege('anon','public.advance_auto_adventure(uuid)','EXECUTE'),'anon advance');
SELECT pg_temp.ok(NOT has_table_privilege('authenticated','app_private.adventure_battles','INSERT'),'private table');
SET ROLE anon;
DO $$ BEGIN BEGIN PERFORM public.sync_auto_adventure(); RAISE EXCEPTION 'anon accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
RESET ROLE;
SET ROLE authenticated;
RESET request.jwt.claim.sub;
DO $$ BEGIN BEGIN PERFORM public.sync_auto_adventure(); RAISE EXCEPTION 'missing auth accepted';
 EXCEPTION WHEN SQLSTATE '28000' THEN NULL; END; END $$;
RESET ROLE;

UPDATE public.skill_tree_nodes SET effect=effect||'{"element":"fogo"}'::jsonb WHERE id='aprendiz-golpe';
INSERT INTO public.skill_tree_nodes(id,tree,node_type,name,effect) VALUES
 ('aprendiz-raio','aprendiz','skill','Raio','{"power":50,"effectType":"dano","element":"raio"}');
INSERT INTO public.player_skill_nodes(user_id,node_id,rank) VALUES
 ('22222222-2222-2222-2222-222222222222','aprendiz-raio',1);
UPDATE public.profiles SET combat_skill_loadout='[{"id":"aprendiz-golpe","power":99999,"element":"sagrado"},{"id":"aprendiz-raio"},{"id":"aprendiz-cura"},{"id":"mago-roubado"}]'::jsonb
 WHERE user_id='22222222-2222-2222-2222-222222222222';
SET ROLE authenticated;
SET request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.ok((SELECT skill_id='aprendiz-golpe' AND skill_effect='fire' AND
 (events->2->>'effect')='fire' AND hero_power<300 FROM app_private.adventure_battles
 WHERE user_id='22222222-2222-2222-2222-222222222222'),'validated skill VFX and power');
SET ROLE authenticated;
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*)=1 FROM app_private.adventure_battles
 WHERE user_id='22222222-2222-2222-2222-222222222222'),'idempotent sync');
SELECT pg_temp.forward('22222222-2222-2222-2222-222222222222',17);
SET ROLE authenticated;
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.adventure_encounters
 WHERE user_id='22222222-2222-2222-2222-222222222222' AND stage=1 AND won),'first clear');
SELECT pg_temp.ok((SELECT gold=104 FROM public.user_balance
 WHERE user_id='22222222-2222-2222-2222-222222222222'),'reward once');
SELECT pg_temp.ok((SELECT skill_id='aprendiz-raio' AND skill_effect='lightning'
 FROM app_private.adventure_battles WHERE id=(SELECT current_battle_id FROM public.adventure_state
 WHERE user_id='22222222-2222-2222-2222-222222222222')),'skill rotation');
SELECT pg_temp.ok((SELECT total_xp=0 AND level=50 FROM public.profiles
 WHERE user_id='22222222-2222-2222-2222-222222222222'),'no XP level');
SELECT pg_temp.ok((SELECT level=5 FROM public.attributes
 WHERE user_id='22222222-2222-2222-2222-222222222222'),'no attribute changes');
SELECT pg_temp.forward('22222222-2222-2222-2222-222222222222',600);
SET ROLE authenticated;
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*)=25 FROM public.adventure_encounters
 WHERE user_id='22222222-2222-2222-2222-222222222222'),'batch bound');
SELECT pg_temp.ok((SELECT count(*)=2 FROM public.adventure_encounters
 WHERE user_id='22222222-2222-2222-2222-222222222222' AND stage IN (10,20)
 AND kind='boss' AND won),'boss 10 and 20');
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.boss_battles
 WHERE user_id='22222222-2222-2222-2222-222222222222' AND boss_id='00000000-0000-0000-0000-000000000001' AND won),'boss entitlement once');
SELECT pg_temp.ok((SELECT gold_today<=120 AND loot_today<=2 FROM public.adventure_state
 WHERE user_id='22222222-2222-2222-2222-222222222222'),'caps');

INSERT INTO public.adventure_state(user_id,stage,attempt,last_tick_at)
VALUES('11111111-1111-1111-1111-111111111111',250,0,clock_timestamp());
SET ROLE authenticated;
SET request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
SELECT public.sync_auto_adventure();
DO $$ BEGIN BEGIN PERFORM public.advance_auto_adventure((SELECT current_battle_id
 FROM public.adventure_state WHERE user_id=auth.uid())); RAISE EXCEPTION 'progressing advance';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END; END $$;
RESET ROLE;
SELECT pg_temp.forward('11111111-1111-1111-1111-111111111111',17);
SET ROLE authenticated;
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.ok((SELECT adventure_mode='holding' AND stage=249 FROM public.adventure_state
 WHERE user_id='11111111-1111-1111-1111-111111111111'),'defeat retreats');
SET ROLE authenticated;
SELECT pg_temp.ok((public.sync_auto_adventure()->'last_battle'->>'status')='defeated',
 'defeated timeline accompanies new fight');
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.gold_history
 WHERE user_id='11111111-1111-1111-1111-111111111111' AND type='adventure'),'defeat no reward');
SELECT pg_temp.forward('11111111-1111-1111-1111-111111111111',600);
SET ROLE authenticated;
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*)>=2 FROM app_private.adventure_battles
 WHERE user_id='11111111-1111-1111-1111-111111111111' AND status='defeated'),'offline continues after death');
SELECT pg_temp.ok((SELECT adventure_mode='holding' AND stage>=1 FROM public.adventure_state
 WHERE user_id='11111111-1111-1111-1111-111111111111'),'holding min one');

INSERT INTO public.adventure_state(user_id,stage,attempt,last_tick_at,adventure_mode)
VALUES('33333333-3333-3333-3333-333333333333',9,0,clock_timestamp(),'holding');
SET ROLE authenticated;
SET request.jwt.claim.sub='33333333-3333-3333-3333-333333333333';
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.forward('33333333-3333-3333-3333-333333333333',17);
SET ROLE authenticated;
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.ok((SELECT stage=9 AND adventure_mode='holding' FROM public.adventure_state
 WHERE user_id='33333333-3333-3333-3333-333333333333'),'holding win stays');
UPDATE public.adventure_state SET next_reward_at=clock_timestamp()-interval '1 minute'
 WHERE user_id='33333333-3333-3333-3333-333333333333';
SELECT pg_temp.forward('33333333-3333-3333-3333-333333333333',17);
SET ROLE authenticated;
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.adventure_encounters
 WHERE user_id='33333333-3333-3333-3333-333333333333' AND stage=9 AND won),'one first clear');
SELECT pg_temp.ok((SELECT count(*)=2 FROM public.gold_history
 WHERE user_id='33333333-3333-3333-3333-333333333333' AND type='adventure'),'farm pays slots');
SELECT pg_temp.ok((SELECT total_xp=1234 FROM public.profiles
 WHERE user_id='33333333-3333-3333-3333-333333333333'),'farm no XP');
SET ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.advance_auto_adventure(gen_random_uuid()); RAISE EXCEPTION 'stale id';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
 BEGIN PERFORM public.advance_auto_adventure((SELECT current_battle_id
 FROM public.adventure_state WHERE user_id='22222222-2222-2222-2222-222222222222'));
 RAISE EXCEPTION 'other user id'; EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
END $$;
SELECT public.advance_auto_adventure((SELECT current_battle_id FROM public.adventure_state WHERE user_id=auth.uid()));
DO $$ BEGIN BEGIN PERFORM public.advance_auto_adventure((SELECT current_battle_id
 FROM public.adventure_state WHERE user_id=auth.uid())); RAISE EXCEPTION 'duplicate advance';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END; END $$;
RESET ROLE;
SELECT pg_temp.ok((SELECT advance_requested AND stage=9 FROM public.adventure_state
 WHERE user_id='33333333-3333-3333-3333-333333333333'),'advance pending');
SELECT pg_temp.forward('33333333-3333-3333-3333-333333333333',17);
SET ROLE authenticated;
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.ok((SELECT stage=10 AND adventure_mode='progressing' AND NOT advance_requested
 FROM public.adventure_state WHERE user_id='33333333-3333-3333-3333-333333333333'),'advance to boss');
SELECT pg_temp.ok((SELECT kind='boss' AND biome='forest' FROM app_private.adventure_battles
 WHERE id=(SELECT current_battle_id FROM public.adventure_state
 WHERE user_id='33333333-3333-3333-3333-333333333333')),'boss and biome');
-- A forced low-stage defeat as fixture administrator proves the lower bound.
UPDATE app_private.adventure_battles SET stage=1 WHERE id=(SELECT current_battle_id
 FROM public.adventure_state WHERE user_id='11111111-1111-1111-1111-111111111111');
UPDATE public.adventure_state SET stage=1 WHERE user_id='11111111-1111-1111-1111-111111111111';
SELECT pg_temp.forward('11111111-1111-1111-1111-111111111111',17);
SET ROLE authenticated;
SET request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.ok((SELECT stage=1 AND adventure_mode='holding' FROM public.adventure_state
 WHERE user_id='11111111-1111-1111-1111-111111111111'),'retreat minimum one');

-- The seventh eligible slot can drop loot in a repeated, non-boss stage.
SELECT pg_temp.forward('33333333-3333-3333-3333-333333333333',17);
SET ROLE authenticated;
SET request.jwt.claim.sub='33333333-3333-3333-3333-333333333333';
SELECT public.sync_auto_adventure();
RESET ROLE;
UPDATE public.adventure_state SET adventure_mode='holding',reward_slot_count=6,
 gold_today=119,loot_today=0,next_reward_at=clock_timestamp()-interval '1 minute'
 WHERE user_id='33333333-3333-3333-3333-333333333333';
SELECT pg_temp.forward('33333333-3333-3333-3333-333333333333',17);
SET ROLE authenticated;
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.ok((SELECT stage=11 AND adventure_mode='holding' AND gold_today=120 AND loot_today=1
 FROM public.adventure_state WHERE user_id='33333333-3333-3333-3333-333333333333'),'farm cap and item');
SELECT pg_temp.ok((SELECT item_id IS NOT NULL AND gold_awarded=1 FROM app_private.adventure_battles
 WHERE user_id='33333333-3333-3333-3333-333333333333' AND stage=11 AND status='won'
 ORDER BY ends_at DESC LIMIT 1),'non-boss farm loot');
SELECT pg_temp.ok((SELECT biome='aquatic' FROM app_private.adventure_battles
 WHERE id=(SELECT current_battle_id FROM public.adventure_state
 WHERE user_id='33333333-3333-3333-3333-333333333333')),'aquatic biome');
UPDATE public.adventure_state SET reward_day=timezone('America/Sao_Paulo',clock_timestamp())::date-1,
 gold_today=120,loot_today=2,next_reward_at=clock_timestamp()-interval '1 minute'
 WHERE user_id='33333333-3333-3333-3333-333333333333';
SELECT pg_temp.forward('33333333-3333-3333-3333-333333333333',17);
SET ROLE authenticated;
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.ok((SELECT reward_day=timezone('America/Sao_Paulo',clock_timestamp())::date
 AND gold_today=4 AND loot_today=0 FROM public.adventure_state
 WHERE user_id='33333333-3333-3333-3333-333333333333'),'Sao Paulo day reset');

INSERT INTO auth.users(id) VALUES('44444444-4444-4444-4444-444444444444');
INSERT INTO public.profiles(user_id,level,starter_class)
 VALUES('44444444-4444-4444-4444-444444444444',50,'mago');
INSERT INTO public.adventure_state(user_id,stage,attempt,last_tick_at)
 VALUES('44444444-4444-4444-4444-444444444444',31,0,clock_timestamp());
SET ROLE authenticated;
SET request.jwt.claim.sub='44444444-4444-4444-4444-444444444444';
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.ok((SELECT biome='volcanic' AND enemy_name='Criatura de fogo'
 AND hero_class='mago' AND events->0->>'effect'='arcane'
 FROM app_private.adventure_battles WHERE user_id='44444444-4444-4444-4444-444444444444'),
 'volcanic biome catalog');
INSERT INTO auth.users(id) VALUES('55555555-5555-5555-5555-555555555555');
SET ROLE authenticated;
SET request.jwt.claim.sub='55555555-5555-5555-5555-555555555555';
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.ok((SELECT hero_class='novato' FROM app_private.adventure_battles
 WHERE user_id='55555555-5555-5555-5555-555555555555'),'new auth without profile');

-- Timeline retention never removes durable first-clear/history receipts.
SELECT pg_temp.forward('22222222-2222-2222-2222-222222222222',2400);
SET ROLE authenticated;
SET request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
DO $$ BEGIN FOR i IN 1..6 LOOP PERFORM public.sync_auto_adventure(); END LOOP; END $$;
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*)<=128 FROM app_private.adventure_battles
 WHERE user_id='22222222-2222-2222-2222-222222222222'),'timeline retention');
SELECT pg_temp.ok((SELECT count(*)>=100 FROM public.adventure_encounters
 WHERE user_id='22222222-2222-2222-2222-222222222222'),'first clears retained');
SELECT pg_temp.ok((SELECT gold_today<=120 AND loot_today<=2 FROM public.adventure_state
 WHERE user_id='22222222-2222-2222-2222-222222222222'),'extended offline caps');
SELECT 'continuous adventure assertions passed' AS result;
