-- Full new migration chain on the reduced composed local fixture only.
-- The transaction is rolled back; no production API or remote writes.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '30s';
CREATE FUNCTION pg_temp.assert_true(ok boolean,msg text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'integration: %',msg; END IF; END $$;

SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','public.attributes','INSERT'),
  'attributes INSERT remains closed');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','public.boss_battles','INSERT'),
  'boss win INSERT remains closed');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','public.user_inventory','INSERT'),
  'inventory INSERT remains closed');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','public.user_balance','UPDATE'),
  'wallet UPDATE remains closed');
SELECT pg_temp.assert_true(NOT has_function_privilege('anon','public.sync_auto_adventure()','EXECUTE'),
  'anonymous adventure remains closed');
SELECT pg_temp.assert_true(has_function_privilege('authenticated','public.sync_auto_adventure()','EXECUTE'),
  'authenticated adventure RPC remains available');
SELECT pg_temp.assert_true((SELECT count(*)=1 AND min(source)='TRANSICAO'
  FROM app_private.legacy_boss_unlocks
  WHERE user_id='11111111-1111-1111-1111-111111111111'
    AND boss_id='00000000-0000-0000-0000-000000000023'),
  'historical boss entitlement kept with transition provenance');

-- The captured signup trigger still initializes a legitimate profile and attribute.
INSERT INTO auth.users(id,email) VALUES
  ('66666666-6666-6666-6666-666666666666','integration-signup@example.invalid');
SELECT pg_temp.assert_true((SELECT count(*)=1 AND min(total_xp)=0
  FROM public.profiles WHERE user_id='66666666-6666-6666-6666-666666666666'),
  'signup profile is legitimate');
SELECT pg_temp.assert_true((SELECT count(*)=1 AND min(xp)=0 AND min(level)=1
  FROM public.attributes WHERE user_id='66666666-6666-6666-6666-666666666666'),
  'signup attribute is legitimate');

-- A legacy win unlocks its exact pet, but cannot be used to mint a different one.
SET ROLE authenticated;
SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SELECT pg_temp.assert_true((SELECT unlocked AND NOT owned FROM public.get_pet_catalog()
  WHERE pet_type='mini_relampago'), 'legacy entitlement is visible only for exact pet');
SELECT pg_temp.assert_true((SELECT NOT unlocked FROM public.get_pet_catalog()
  WHERE pet_type='mini_leviata'), 'unrelated pet remains locked');
SELECT public.buy_pet('mini_relampago');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT gold=0 FROM public.user_balance
  WHERE user_id='11111111-1111-1111-1111-111111111111'), 'pet purchase debited once');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.companions
  WHERE user_id='11111111-1111-1111-1111-111111111111'
    AND companion_type='mini_relampago' AND origin='shop'), 'pet created once');

-- Shop and adventure share one server-owned wallet and inventory.
INSERT INTO public.game_items(id,name,category,rarity,shop_price,stackable,
  is_consumable,level_required,atk_bonus)
VALUES('10000000-0000-0000-0000-000000000091','Integration sword',
  'weapon','comum',30,false,false,1,1);
SET ROLE authenticated;
SET request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
SELECT public.purchase_game_item('10000000-0000-0000-0000-000000000091',
  '20000000-0000-0000-0000-000000000091');
SELECT public.purchase_game_item('10000000-0000-0000-0000-000000000091',
  '20000000-0000-0000-0000-000000000091');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT gold=70 FROM public.user_balance
  WHERE user_id='22222222-2222-2222-2222-222222222222'),
  'purchase replay did not double debit');
SELECT pg_temp.assert_true((SELECT count(*)=1 AND min(quantity)=1
  FROM public.user_inventory WHERE user_id='22222222-2222-2222-2222-222222222222'
    AND item_id='10000000-0000-0000-0000-000000000091'),
  'purchase replay did not duplicate inventory');

SET ROLE authenticated;
SET request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
SELECT public.sync_auto_adventure();
-- Opening the panel and observing the same query again cannot mint rewards.
SELECT public.sync_auto_adventure();
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.assert_true((SELECT stage=2 FROM public.adventure_state
  WHERE user_id='22222222-2222-2222-2222-222222222222'),
  'stage one advanced');
SELECT pg_temp.assert_true((SELECT gold=74 FROM public.user_balance
  WHERE user_id='22222222-2222-2222-2222-222222222222'),
  'adventure paid four gold into the same wallet');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.adventure_encounters
  WHERE user_id='22222222-2222-2222-2222-222222222222' AND stage=1),
  'two additional observations duplicated the encounter');

UPDATE public.adventure_state SET stage=10,attempt=0,
  last_tick_at=now()-interval '30 minutes'
WHERE user_id='22222222-2222-2222-2222-222222222222';
SET ROLE authenticated;
SET request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.assert_true((SELECT won AND kind='boss' AND
  boss_id='00000000-0000-0000-0000-000000000001'::uuid
  FROM public.adventure_encounters
  WHERE user_id='22222222-2222-2222-2222-222222222222' AND stage=10),
  'stage 10 names and credits first regular boss');
UPDATE public.adventure_state SET stage=11,attempt=0,
  last_tick_at=now()-interval '30 minutes'
WHERE user_id='22222222-2222-2222-2222-222222222222';
SET ROLE authenticated;
SET request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.assert_true((SELECT won AND kind='normal' AND boss_id IS NULL
  FROM public.adventure_encounters
  WHERE user_id='22222222-2222-2222-2222-222222222222' AND stage=11),
  'stage 11 remains normal');
UPDATE public.adventure_state SET stage=20,attempt=0,
  last_tick_at=now()-interval '30 minutes'
WHERE user_id='22222222-2222-2222-2222-222222222222';
SET ROLE authenticated;
SET request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
SELECT public.sync_auto_adventure();
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.adventure_state),
  'RLS exposes only own adventure state');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT won AND kind='boss' AND
  boss_id='00000000-0000-0000-0000-000000000002'::uuid
  FROM public.adventure_encounters
  WHERE user_id='22222222-2222-2222-2222-222222222222' AND stage=20),
  'stage 20 names next regular boss');
SELECT pg_temp.assert_true((SELECT total_xp=0 AND level=1 FROM public.profiles
  WHERE user_id='22222222-2222-2222-2222-222222222222'),
  'shop and combat never wrote permanent profile XP');
SELECT pg_temp.assert_true((SELECT xp=0 AND level=1 FROM public.attributes
  WHERE user_id='22222222-2222-2222-2222-222222222222' AND name='Disciplina'),
  'shop and combat never trained an attribute');

SELECT 'composed inventory/adventure/entitlement assertions passed' AS result;
ROLLBACK;
