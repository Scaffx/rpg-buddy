-- Run after fixture and migration with psql -v ON_ERROR_STOP=1.
CREATE FUNCTION pg_temp.assert_true(ok boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'assertion failed: %', msg; END IF; END $$;

SELECT pg_temp.assert_true(NOT has_function_privilege('anon','public.sync_auto_adventure()','EXECUTE'), 'anon cannot execute RPC');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','public.adventure_state','INSERT'), 'state write closed');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','public.adventure_encounters','INSERT'), 'encounter write closed');

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
SELECT pg_temp.assert_true((SELECT stage=17 AND gold_today=120 AND loot_today=2 FROM public.adventure_state WHERE user_id='22222222-2222-2222-2222-222222222222'), 'offline eight hour and daily caps');
SELECT pg_temp.assert_true((SELECT count(*)=16 FROM public.adventure_encounters WHERE user_id='22222222-2222-2222-2222-222222222222'), 'offline max sixteen encounters');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.user_inventory WHERE user_id='22222222-2222-2222-2222-222222222222'), 'loot cap blocks drops');
SELECT pg_temp.assert_true((SELECT total_xp=0 FROM public.profiles WHERE user_id='22222222-2222-2222-2222-222222222222'), 'offline gives no XP');
SELECT pg_temp.assert_true((SELECT level=1 AND xp=0 FROM public.attributes WHERE user_id='22222222-2222-2222-2222-222222222222' AND name='forca'), 'offline gives no attribute');

SET ROLE authenticated;
SET request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=16 FROM public.adventure_encounters WHERE user_id='22222222-2222-2222-2222-222222222222'), 'repeat request cannot harvest discarded offline time');

UPDATE public.adventure_state SET reward_day=(timezone('America/Sao_Paulo',now())::date - 1),
  gold_today=120,loot_today=2,last_tick_at=now()-interval '30 minutes'
  WHERE user_id='22222222-2222-2222-2222-222222222222';
SET ROLE authenticated;
SET request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.assert_true((SELECT stage=18 AND gold_today=4 AND loot_today=0 FROM public.adventure_state WHERE user_id='22222222-2222-2222-2222-222222222222'), 'Sao Paulo day rollover resets budgets');

SELECT 'auto adventure SQL assertions passed' AS result;
