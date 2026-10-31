\set ON_ERROR_STOP on
CREATE FUNCTION pg_temp.ok(p_condition boolean,p_label text)
RETURNS void LANGUAGE plpgsql AS $$ BEGIN
  IF p_condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'CHEST_V2_ASSERT %',p_label; END IF;
END $$;

SELECT pg_temp.ok((SELECT count(*)=4 AND sum(probability_bps)=10000
  FROM app_private.adventure_chest_loot_v2_rules),'rarity probabilities');
SELECT pg_temp.ok(app_private.adventure_chest_gear_probabilities('comum')=
  '{"incomum":10000,"raro":0,"epico":0,"lendario":0}'::jsonb,
  'gear rarity zero-weight keys for client schema');
SELECT pg_temp.ok((SELECT loot_version=1 AND gold_amount=40 AND scrap_amount=2
  FROM app_private.adventure_chests WHERE id='31000000-0000-4000-8000-000000000001'),
  'old frozen chest');
SELECT pg_temp.ok((SELECT NOT (app_private.adventure_chest_payload(c) ? 'loot_version')
  FROM app_private.adventure_chests c
  WHERE c.id='31000000-0000-4000-8000-000000000001'),
  'v1 payload shape');
SELECT pg_temp.ok((SELECT cost_percent=8000 FROM public.shop_items
  WHERE effect='streak_protector') AND
  (SELECT cost_percent=4500 FROM public.shop_items WHERE effect='double_xp'),
  'actual Time Shop catalog costs');
SELECT pg_temp.ok((SELECT count(*)=3 FROM app_private.adventure_chest_safe_gear)
  AND NOT EXISTS (SELECT 1 FROM app_private.adventure_chest_safe_gear
    WHERE item_id='31000000-0000-4000-8000-000000000104'),
  'explicit safe gear pool excludes boss flag');
SELECT pg_temp.ok(NOT has_table_privilege('authenticated',
  'app_private.adventure_chest_opening_entitlements','SELECT,INSERT,UPDATE,DELETE')
  AND NOT has_table_privilege('anon',
    'app_private.adventure_chest_cash_receipts','SELECT,INSERT,UPDATE,DELETE')
  AND NOT has_function_privilege('anon',
    'public.buy_adventure_chest_opening(integer,uuid)','EXECUTE'),
  'private ACL');

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
SELECT pg_temp.ok((public.get_adventure_chests()->>'openings_cap')::int=1,
  'initial opening cap');
SELECT pg_temp.ok((public.get_adventure_chests()->'unlocks'->>'fourth_available')::boolean=false,
  'cash unavailable');
DO $test$ DECLARE v jsonb; BEGIN
  v:=public.buy_adventure_chest_opening(2,'31000000-0000-4000-8000-000000000002');
  PERFORM pg_temp.ok(v->>'replayed'='false' AND v->>'gold_spent'='6000'
    AND v->>'target_cap'='2','first gold purchase');
  v:=public.buy_adventure_chest_opening(2,'31000000-0000-4000-8000-000000000002');
  PERFORM pg_temp.ok(v->>'replayed'='true' AND v->>'gold'='94000','purchase replay');
  PERFORM pg_temp.ok((public.get_adventure_chest_opening_receipt(
    '31000000-0000-4000-8000-000000000002')->>'gold_spent')::int=6000,
    'lost response receipt lookup');
  BEGIN
    PERFORM public.buy_adventure_chest_opening(3,'31000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'request conflict accepted';
  EXCEPTION WHEN sqlstate '22023' THEN NULL; END;
  BEGIN
    PERFORM public.buy_adventure_chest_opening(4,'31000000-0000-4000-8000-000000000004');
    RAISE EXCEPTION 'cash client purchase accepted';
  EXCEPTION WHEN sqlstate '22023' THEN NULL; END;
  v:=public.buy_adventure_chest_opening(3,'31000000-0000-4000-8000-000000000003');
  PERFORM pg_temp.ok(v->>'gold_spent'='18000' AND v->>'gold'='76000',
    'third permanent opening');
  v:=public.buy_shop_item((SELECT id FROM public.shop_items
    WHERE effect='tv_session'),current_date);
  PERFORM pg_temp.ok((v->>'cost')::int=1200,'Time Shop actual RPC debit');
END $test$;
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*)=2 FROM app_private.adventure_chest_opening_purchase_receipts
 WHERE user_id='11111111-1111-1111-1111-111111111111')
 AND (SELECT count(*)=2 FROM public.gold_history
 WHERE user_id='11111111-1111-1111-1111-111111111111' AND type='compra_bau_abertura'),
 'exactly two purchase debits and receipts');
SELECT pg_temp.ok((SELECT gold=74800 FROM public.user_balance
 WHERE user_id='11111111-1111-1111-1111-111111111111')
 AND (SELECT count(*)=1 FROM public.gold_history
 WHERE user_id='11111111-1111-1111-1111-111111111111'
 AND type='compra_loja' AND amount=-1200),
 'Time Shop one catalog-priced debit and ledger');
COMMIT;

UPDATE public.user_balance SET gold=1000
WHERE user_id='22222222-2222-2222-2222-222222222222';
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
DO $test$ BEGIN
  BEGIN
    PERFORM public.buy_adventure_chest_opening(2,
      '31000000-0000-4000-8000-000000000005');
    RAISE EXCEPTION 'insufficient purchase accepted';
  EXCEPTION WHEN sqlstate '22023' THEN NULL; END;
END $test$;
RESET ROLE;
COMMIT;
SELECT pg_temp.ok((SELECT gold=1000 FROM public.user_balance
 WHERE user_id='22222222-2222-2222-2222-222222222222')
 AND NOT EXISTS (SELECT 1 FROM app_private.adventure_chest_opening_purchase_receipts
 WHERE user_id='22222222-2222-2222-2222-222222222222'),
 'insufficient funds atomicity');

-- A private battle is the only way to award a new chest.
INSERT INTO app_private.adventure_battles
SELECT (jsonb_populate_record(NULL::app_private.adventure_battles,
 to_jsonb(b)||jsonb_build_object('id','31000000-0000-4000-8000-000000000020',
 'user_id','11111111-1111-1111-1111-111111111111',
 'stage',7,'kind','normal','status','fighting','boss_id',null,
 'hero_class','guerreiro','hero_level',5,'biome','forest',
 'started_at',clock_timestamp()-interval '2 minutes',
 'ends_at',clock_timestamp()-interval '1 minute','gold_awarded',0))).*
FROM app_private.adventure_battles b LIMIT 1;
UPDATE app_private.adventure_battles SET status='won'
WHERE id='31000000-0000-4000-8000-000000000020';
SELECT pg_temp.ok((SELECT loot_version=2
 AND scrap_amount=(SELECT scrap_amount FROM app_private.adventure_chest_loot_v2_rules
 WHERE rarity=c.rarity)
 AND essence_amount=(SELECT essence_amount FROM app_private.adventure_chest_loot_v2_rules
 WHERE rarity=c.rarity)
 AND loot_rules->>'scrap'=scrap_amount::text
 AND loot_rules->'equipment_rarity_bps' ?&
   ARRAY['incomum','raro','epico','lendario']
 AND gold_amount BETWEEN (SELECT gold_min FROM app_private.adventure_chest_loot_v2_rules
 WHERE rarity=c.rarity) AND (SELECT gold_max FROM app_private.adventure_chest_loot_v2_rules
 WHERE rarity=c.rarity)
 FROM app_private.adventure_chests c WHERE battle_id='31000000-0000-4000-8000-000000000020'),
 'v2 frozen range and materials');
DO $test$ DECLARE v_id uuid; v_n integer:=0; v_gear_roll integer;
BEGIN
  LOOP
    v_n:=v_n+1;
    v_id:=md5('legendary-gear:'||v_n)::uuid;
    v_gear_roll:=app_private.adventure_chest_roll(v_id,'equipment_rarity');
    EXIT WHEN app_private.adventure_chest_roll(v_id,'rarity')>=9900
      AND app_private.adventure_chest_roll(v_id,'equipment')<6000
      AND v_gear_roll>=8000;
    IF v_n>100000 THEN RAISE EXCEPTION 'no deterministic legendary gear seed'; END IF;
  END LOOP;
  INSERT INTO app_private.adventure_battles
  SELECT (jsonb_populate_record(NULL::app_private.adventure_battles,
    to_jsonb(b)||jsonb_build_object('id',v_id,
    'user_id','22222222-2222-2222-2222-222222222222',
    'stage',45,'kind','normal','status','fighting','boss_id',null,
    'hero_class','mago','hero_level',80,'biome','forest',
    'started_at',clock_timestamp()-interval '2 minutes',
    'ends_at',clock_timestamp()-interval '1 minute','gold_awarded',0))).*
  FROM app_private.adventure_battles b LIMIT 1;
  UPDATE app_private.adventure_battles SET status='won' WHERE id=v_id;
  PERFORM pg_temp.ok((SELECT rarity='lendario' AND
    equipment_item_id='31000000-0000-4000-8000-000000000103'
    FROM app_private.adventure_chests WHERE battle_id=v_id),
    'legendary gear roll from safe pool');
END $test$;
SELECT id AS new_chest_id FROM app_private.adventure_chests
WHERE battle_id='31000000-0000-4000-8000-000000000020' \gset
INSERT INTO app_private.adventure_chests
 (id,user_id,battle_id,rarity,hero_class,hero_level,gold_amount,scrap_amount,
  essence_material,essence_amount,potion_amount,open_hours,acquired_at)
VALUES
 ('31000000-0000-4000-8000-000000000031',
  '11111111-1111-1111-1111-111111111111',
  '31000000-0000-4000-8000-000000000032','comum','guerreiro',5,
  40,2,'normal',0,0,1,clock_timestamp()),
 ('31000000-0000-4000-8000-000000000033',
  '11111111-1111-1111-1111-111111111111',
  '31000000-0000-4000-8000-000000000034','comum','guerreiro',5,
  40,2,'normal',0,0,1,clock_timestamp());

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
SELECT pg_temp.ok((public.start_adventure_chest(
 '31000000-0000-4000-8000-000000000001')->>'replayed')='false',
 'start old chest');
SELECT pg_temp.ok((public.start_adventure_chest(:'new_chest_id'::uuid)->>'replayed')='false',
 'start second with cap 3');
SELECT pg_temp.ok((public.start_adventure_chest(
 '31000000-0000-4000-8000-000000000031')->>'replayed')='false',
 'start third with cap 3');
DO $test$ BEGIN
  BEGIN
    PERFORM public.start_adventure_chest('31000000-0000-4000-8000-000000000033');
    RAISE EXCEPTION 'fourth opening accepted before cash';
  EXCEPTION WHEN sqlstate '22023' THEN NULL; END;
END $test$;
RESET ROLE;
COMMIT;
SELECT pg_temp.ok((SELECT count(*)=3 FROM app_private.adventure_chests
 WHERE user_id='11111111-1111-1111-1111-111111111111' AND status='opening'),
 'three parallel openings and fourth denied');
ALTER TABLE app_private.adventure_chests DISABLE TRIGGER adventure_chest_frozen;
WITH test_clock AS MATERIALIZED (SELECT clock_timestamp()-interval '2 minutes' AS ready)
UPDATE app_private.adventure_chests c SET
  started_at=test_clock.ready-make_interval(hours=>c.open_hours),
  ready_at=test_clock.ready
FROM test_clock
WHERE c.user_id='11111111-1111-1111-1111-111111111111' AND c.status='opening';
ALTER TABLE app_private.adventure_chests ENABLE TRIGGER adventure_chest_frozen;
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
SELECT pg_temp.ok((public.claim_adventure_chest(
 '31000000-0000-4000-8000-000000000001')->>'replayed')='false',
 'v1 claim');
SELECT pg_temp.ok((public.claim_adventure_chest(:'new_chest_id'::uuid)->>'replayed')='false',
 'v2 claim');
SELECT pg_temp.ok((public.claim_adventure_chest(:'new_chest_id'::uuid)->>'replayed')='true',
 'v2 claim replay');
RESET ROLE;
COMMIT;
SELECT pg_temp.ok((SELECT count(*)=1 FROM app_private.adventure_material_receipts
 WHERE source='chest_claim' AND source_id='31000000-0000-4000-8000-000000000001'
   AND material='scrap' AND amount=2)
 AND (SELECT count(*)=1 FROM app_private.adventure_material_receipts
 WHERE source='chest_claim' AND source_id=:'new_chest_id'::uuid
   AND material='scrap'
   AND amount=(SELECT scrap_amount FROM app_private.adventure_chests
     WHERE id=:'new_chest_id'::uuid))
 AND (SELECT count(*)=2 FROM app_private.adventure_chest_claim_receipts
 WHERE user_id='11111111-1111-1111-1111-111111111111'),
 'old and new material claims frozen');
SELECT pg_temp.ok((SELECT NOT (payout ? 'loot_version')
 FROM app_private.adventure_chest_claim_receipts
 WHERE chest_id='31000000-0000-4000-8000-000000000001')
 AND (SELECT payout->>'loot_version'='2'
 FROM app_private.adventure_chest_claim_receipts
 WHERE chest_id=:'new_chest_id'::uuid),
 'v1 receipt shape and v2 version');

-- The one-time cash path is unavailable without an exact configured live
-- Paddle price. Simulate configuration only inside a local rolled-back tx.
SELECT pg_temp.ok(NOT has_function_privilege('anon',
 'public.grant_adventure_chest_cash_receipt(uuid,text,text,text,integer,text,text)',
 'EXECUTE') AND NOT has_function_privilege('authenticated',
 'public.grant_adventure_chest_cash_receipt(uuid,text,text,text,integer,text,text)',
 'EXECUTE') AND has_function_privilege('service_role',
 'public.grant_adventure_chest_cash_receipt(uuid,text,text,text,integer,text,text)',
 'EXECUTE'),'cash grant ACL');
BEGIN;
SET LOCAL ROLE service_role;
DO $test$ BEGIN
  BEGIN
    PERFORM public.grant_adventure_chest_cash_receipt(
      '11111111-1111-1111-1111-111111111111','txn_310000000001',
      'evt_310000000001','pri_310000000001',990,'BRL','live');
    RAISE EXCEPTION 'disabled cash gateway accepted';
  EXCEPTION WHEN sqlstate '22023' THEN NULL; END;
END $test$;
RESET ROLE;
UPDATE app_private.adventure_chest_cash_config
  SET price_id='pri_310000000001',enabled=true WHERE singleton=true;
SET LOCAL ROLE service_role;
DO $test$ DECLARE v jsonb; BEGIN
  v:=public.grant_adventure_chest_cash_receipt(
    '11111111-1111-1111-1111-111111111111','txn_310000000001',
    'evt_310000000001','pri_310000000001',990,'BRL','live');
  IF v->>'replayed'<>'false' OR v->>'openings_cap'<>'4' THEN
    RAISE EXCEPTION 'cash first grant failed %',v; END IF;
  v:=public.grant_adventure_chest_cash_receipt(
    '11111111-1111-1111-1111-111111111111','txn_310000000001',
    'evt_310000000001','pri_310000000001',990,'BRL','live');
  IF v->>'replayed'<>'true' THEN RAISE EXCEPTION 'cash replay failed'; END IF;
  BEGIN
    PERFORM public.grant_adventure_chest_cash_receipt(
      '22222222-2222-2222-2222-222222222222','txn_310000000001',
      'evt_310000000001','pri_310000000001',990,'BRL','live');
    RAISE EXCEPTION 'cash cross-user replay accepted';
  EXCEPTION WHEN sqlstate '22023' THEN NULL; END;
  BEGIN
    PERFORM public.grant_adventure_chest_cash_receipt(
      '22222222-2222-2222-2222-222222222222','txn_310000000002',
      'evt_310000000002','pri_310000000001',991,'BRL','live');
    RAISE EXCEPTION 'cash wrong amount accepted';
  EXCEPTION WHEN sqlstate '22023' THEN NULL; END;
END $test$;
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*)=1 FROM app_private.adventure_chest_cash_receipts)
  AND (SELECT count(*)=1 FROM app_private.adventure_chest_cash_receipts
    WHERE user_id='11111111-1111-1111-1111-111111111111'),
  'cash unique provider receipt');
INSERT INTO app_private.adventure_chests
 (id,user_id,battle_id,rarity,hero_class,hero_level,gold_amount,scrap_amount,
  essence_material,essence_amount,potion_amount,open_hours,acquired_at)
VALUES
 ('31000000-0000-4000-8000-000000000041',
  '11111111-1111-1111-1111-111111111111',
  '31000000-0000-4000-8000-000000000042','comum','guerreiro',5,
  40,2,'normal',0,0,1,clock_timestamp()),
 ('31000000-0000-4000-8000-000000000043',
  '11111111-1111-1111-1111-111111111111',
  '31000000-0000-4000-8000-000000000044','comum','guerreiro',5,
  40,2,'normal',0,0,1,clock_timestamp());
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
SELECT pg_temp.ok((public.get_adventure_chests()->>'openings_cap')::int=4,
  'cash fourth opening after verified receipt');
SELECT public.start_adventure_chest('31000000-0000-4000-8000-000000000041');
SELECT public.start_adventure_chest('31000000-0000-4000-8000-000000000043');
SELECT pg_temp.ok((public.start_adventure_chest(
 '31000000-0000-4000-8000-000000000033')->>'replayed')='false',
 'fourth parallel opening with cash receipt');
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*)=4 FROM app_private.adventure_chests
 WHERE user_id='11111111-1111-1111-1111-111111111111' AND status='opening'),
 'four active openings under cash cap');
ROLLBACK;
SELECT pg_temp.ok((SELECT enabled=false FROM app_private.adventure_chest_cash_config)
  AND NOT EXISTS (SELECT 1 FROM app_private.adventure_chest_cash_receipts),
  'cash gateway default remains disabled');
SELECT 'CHESTS_20261031_ASSERT_PASS';
