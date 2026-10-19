-- Run after fixture and migration with psql -v ON_ERROR_STOP=1.
CREATE FUNCTION pg_temp.assert_true(ok boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'assertion failed: %', msg; END IF; END $$;

SELECT pg_temp.assert_true(NOT has_function_privilege('anon','public.sync_auto_adventure()','EXECUTE'), 'anon cannot execute RPC');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','public.adventure_state','INSERT'), 'state write closed');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','public.adventure_encounters','INSERT'), 'encounter write closed');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','public.user_balance','UPDATE'), 'wallet client update closed in fixture');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','public.user_inventory','INSERT'), 'inventory client insert closed in fixture');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','public.attributes','INSERT'), 'client cannot forge trained attribute row');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','public.attributes','DELETE'), 'client cannot erase trained attribute row');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','public.portal_runs','INSERT'), 'client cannot forge portal completion');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','public.player_portal_fragments','UPDATE'), 'client cannot mint fragments');
SELECT pg_temp.assert_true(NOT has_function_privilege('authenticated','public.complete_portal_run(uuid,text,integer,integer,boolean)','EXECUTE'), 'old arbitrary-fragment portal overload closed');

SET ROLE authenticated;
SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SELECT public.complete_portal_run('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',99999,99999);
SELECT public.complete_portal_run('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',99999,99999);
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=1 AND max(xp_earned)=0 AND max(gold_earned)=0 AND max(fragments_received)=0
  FROM public.portal_runs WHERE user_id='11111111-1111-1111-1111-111111111111'), 'declared portal result pays nothing and is idempotent');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.player_portal_fragments), 'portal cannot create fragments from client result');

SET ROLE authenticated;
SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.assert_true((SELECT stage=2 FROM public.adventure_state WHERE user_id='11111111-1111-1111-1111-111111111111'), 'default hero clears stage 1');
SELECT pg_temp.assert_true((SELECT gold=104 FROM public.user_balance WHERE user_id='11111111-1111-1111-1111-111111111111'), 'first win credits four gold');
SELECT pg_temp.assert_true((SELECT level=1 AND total_xp=0 FROM public.profiles WHERE user_id='11111111-1111-1111-1111-111111111111'), 'combat gives no level or XP');
SELECT pg_temp.assert_true((SELECT level=1 AND xp=0 FROM public.attributes WHERE user_id='11111111-1111-1111-1111-111111111111' AND name='forca'), 'combat gives no attribute');

SET ROLE authenticated;
SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.adventure_encounters WHERE user_id='11111111-1111-1111-1111-111111111111'), 'repeat call cannot replay');

UPDATE public.adventure_state SET stage=9, attempt=0, last_tick_at=now()-interval '1 hour' WHERE user_id='11111111-1111-1111-1111-111111111111';
SET ROLE authenticated;
SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.assert_true((SELECT stage=10 FROM public.adventure_state WHERE user_id='11111111-1111-1111-1111-111111111111'), 'stage 9 normal then stage 10 boss defeat');
SELECT pg_temp.assert_true((SELECT kind='boss' AND NOT won AND gold=0 FROM public.adventure_encounters WHERE user_id='11111111-1111-1111-1111-111111111111' AND stage=10 AND attempt=0), 'boss 10 defeat neutral');

-- Same hero level and empty equipment, but trained Strength from routine changes power and result.
INSERT INTO public.adventure_state(user_id,stage,attempt,last_tick_at)
VALUES ('33333333-3333-3333-3333-333333333333',10,0,now()-interval '30 minutes');
SET ROLE authenticated;
SET request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.assert_true((SELECT NOT won AND hero_power=74 FROM public.adventure_encounters WHERE user_id='33333333-3333-3333-3333-333333333333' AND stage=10 AND attempt=0), 'magic class does not use physical attack branch');
UPDATE public.profiles SET starter_class='guerreiro' WHERE user_id='33333333-3333-3333-3333-333333333333';
UPDATE public.adventure_state SET last_tick_at=now()-interval '30 minutes' WHERE user_id='33333333-3333-3333-3333-333333333333';
SET ROLE authenticated;
SET request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.assert_true((SELECT won AND hero_power=86 FROM public.adventure_encounters WHERE user_id='33333333-3333-3333-3333-333333333333' AND stage=10 AND attempt=1), 'trained Strength wins with physical class at level 1');
SELECT pg_temp.assert_true((SELECT hero_power=73 AND NOT won FROM public.adventure_encounters WHERE user_id='11111111-1111-1111-1111-111111111111' AND stage=10 AND attempt=0), 'untrained equal-level hero loses boss 10');
SELECT pg_temp.assert_true((SELECT level=1 AND total_xp=0 FROM public.profiles WHERE user_id='33333333-3333-3333-3333-333333333333'), 'trained hero battle grants no XP');
SELECT pg_temp.assert_true((SELECT level=3 AND xp=0 FROM public.attributes WHERE user_id='33333333-3333-3333-3333-333333333333' AND name='Força'), 'battle does not train Strength');

UPDATE public.profiles SET level=4 WHERE user_id='11111111-1111-1111-1111-111111111111';
UPDATE public.adventure_state SET last_tick_at=now()-interval '1 hour' WHERE user_id='11111111-1111-1111-1111-111111111111';
SET ROLE authenticated;
SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.assert_true((SELECT stage=12 FROM public.adventure_state WHERE user_id='11111111-1111-1111-1111-111111111111'), 'boss 10 then normal 11');
SELECT pg_temp.assert_true((SELECT kind='boss' AND won AND gold=12 FROM public.adventure_encounters WHERE user_id='11111111-1111-1111-1111-111111111111' AND stage=10 AND attempt=1), 'boss 10 victory one reward');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.gold_history WHERE user_id='11111111-1111-1111-1111-111111111111' AND reason='Aventura etapa 10'), 'one boss 10 gold ledger');
SELECT pg_temp.assert_true((SELECT quantity=1 FROM public.user_inventory WHERE user_id='11111111-1111-1111-1111-111111111111' AND item_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 'boss 10 loot credited once');
SELECT pg_temp.assert_true((SELECT level=4 AND total_xp=0 FROM public.profiles WHERE user_id='11111111-1111-1111-1111-111111111111'), 'no XP after boss');

UPDATE public.adventure_state SET stage=20,attempt=0,last_tick_at=now()-interval '30 minutes' WHERE user_id='11111111-1111-1111-1111-111111111111';
SET ROLE authenticated;
SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.assert_true((SELECT stage=20 FROM public.adventure_state WHERE user_id='11111111-1111-1111-1111-111111111111'), 'boss 20 defeat');
INSERT INTO public.user_inventory(user_id,item_id,quantity,equipped) VALUES ('11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',1,true)
ON CONFLICT(user_id,item_id) DO UPDATE SET equipped=true;
UPDATE public.adventure_state SET last_tick_at=now()-interval '30 minutes' WHERE user_id='11111111-1111-1111-1111-111111111111';
SET ROLE authenticated;
SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.assert_true((SELECT stage=21 FROM public.adventure_state WHERE user_id='11111111-1111-1111-1111-111111111111'), 'equipment enables boss 20 win');
SELECT pg_temp.assert_true((SELECT quantity=2 FROM public.user_inventory WHERE user_id='11111111-1111-1111-1111-111111111111' AND item_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 'existing equipped item preserved and stack increased once');

INSERT INTO public.adventure_state(user_id,stage,attempt,last_tick_at,gold_today,loot_today)
VALUES ('22222222-2222-2222-2222-222222222222',1,0,now()-interval '30 days',118,2);
SET ROLE authenticated;
SET request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.assert_true((SELECT stage=49 AND gold_today=120 AND loot_today=2 FROM public.adventure_state WHERE user_id='22222222-2222-2222-2222-222222222222'), 'offline 24 hour and daily caps');
SELECT pg_temp.assert_true((SELECT count(*)=48 FROM public.adventure_encounters WHERE user_id='22222222-2222-2222-2222-222222222222'), 'offline max 48 encounters');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.user_inventory WHERE user_id='22222222-2222-2222-2222-222222222222'), 'loot cap blocks drops');
SELECT pg_temp.assert_true((SELECT total_xp=0 FROM public.profiles WHERE user_id='22222222-2222-2222-2222-222222222222'), 'offline gives no XP');
SELECT pg_temp.assert_true((SELECT level=5 AND xp=0 FROM public.attributes WHERE user_id='22222222-2222-2222-2222-222222222222' AND name='forca'), 'offline gives no attribute');

SET ROLE authenticated;
SET request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=48 FROM public.adventure_encounters WHERE user_id='22222222-2222-2222-2222-222222222222'), 'repeat request cannot harvest discarded offline time');

UPDATE public.adventure_state SET reward_day=(timezone('America/Sao_Paulo',now())::date - 1),
  gold_today=120,loot_today=2,last_tick_at=now()-interval '30 minutes'
  WHERE user_id='22222222-2222-2222-2222-222222222222';
SET ROLE authenticated;
SET request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.assert_true((SELECT stage=50 AND gold_today=4 AND loot_today=1 FROM public.adventure_state WHERE user_id='22222222-2222-2222-2222-222222222222'), 'Sao Paulo day rollover resets budgets and allows a stage 49 drop');

SELECT 'auto adventure SQL assertions passed' AS result;
