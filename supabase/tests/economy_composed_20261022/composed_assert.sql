\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.ok(p_condition boolean,p_label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_condition IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'COMPOSED_ASSERT: %',p_label;
  END IF;
END;
$$;

SELECT pg_temp.ok((SELECT count(*)=3 FROM app_private.economy_balance_transition),
  'three legacy balance transitions');
SELECT pg_temp.ok((SELECT count(*)=1 FROM app_private.boss_recipe_unlocks
  WHERE user_id='11111111-1111-1111-1111-111111111111' AND stage=10),
  'historical boss recipe preserved');
SELECT pg_temp.ok((SELECT count(*)=0 FROM app_private.adventure_material_receipts
  WHERE user_id='11111111-1111-1111-1111-111111111111'),
  'historical win did not fabricate materials');
SELECT pg_temp.ok((SELECT quantity=999999 FROM public.user_crafting_materials
  WHERE user_id='11111111-1111-1111-1111-111111111111'),
  'legacy client wallet retained separately');
SELECT pg_temp.ok((SELECT gold_cost=80000 FROM app_private.boss_recipe_catalog
  WHERE id=(SELECT recipe_id FROM app_private.boss_recipe_unlocks
    WHERE user_id='11111111-1111-1111-1111-111111111111' AND stage=10)),
  'economy recipe price alignment');
SELECT pg_temp.ok(app_private.class_path_matches(
  '00000002-0000-0000-0000-000000000001','guerreiro',5)
  AND NOT app_private.class_path_matches(
  '00000002-0000-0000-0000-000000000002','guerreiro',5),
  'real class ancestry');
SELECT pg_temp.ok(app_private.hero_class_key(
  '44444444-4444-4444-4444-444444444444')='novato',
  'private cleric identity');
SELECT pg_temp.ok(NOT has_function_privilege('anon','public.craft_boss_recipe(uuid,uuid)','EXECUTE')
  AND NOT has_function_privilege('authenticated',
    'app_private.credit_adventure_material(uuid,text,integer,text,uuid)','EXECUTE')
  AND NOT has_table_privilege('authenticated','app_private.adventure_battles','UPDATE')
  AND NOT has_table_privilege('authenticated','public.game_items','UPDATE'),
  'server-owned ACL');

INSERT INTO public.user_balance(user_id,balance_percent,gold)
VALUES ('44444444-4444-4444-4444-444444444444',100,100000);

-- The reduced PR70 replay has a complete v3 battle row. Copy that server
-- shape and change only this synthetic battle's identity and outcome fields.
INSERT INTO app_private.adventure_battles
SELECT (jsonb_populate_record(NULL::app_private.adventure_battles,
  to_jsonb(b) || jsonb_build_object(
    'id','00000000-0000-0000-0000-000000000044',
    'user_id','44444444-4444-4444-4444-444444444444',
    'stage',10,'kind','boss','status','fighting',
    'boss_id','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'hero_class','clerico','hero_level',5,'biome','forest',
    'started_at',clock_timestamp()-interval '2 minutes',
    'ends_at',clock_timestamp()-interval '1 minute',
    'gold_awarded',0))).*
FROM app_private.adventure_battles b LIMIT 1;
UPDATE app_private.adventure_battles SET status='won'
WHERE id='00000000-0000-0000-0000-000000000044';
SELECT pg_temp.ok((SELECT count(*)=1 FROM app_private.boss_recipe_unlocks
  WHERE user_id='44444444-4444-4444-4444-444444444444' AND stage=10)
  AND (SELECT count(*)=2 FROM app_private.adventure_material_receipts
    WHERE source_id='00000000-0000-0000-0000-000000000044')
  AND (SELECT count(*)=1 FROM app_private.adventure_chest_win_receipts
    WHERE battle_id='00000000-0000-0000-0000-000000000044'
      AND disposition='queued'),
  'one victory yielded recipe, materials and chest');

SELECT app_private.credit_adventure_material(
  '44444444-4444-4444-4444-444444444444','scrap',4,'composed_fixture',
  '00000000-0000-0000-0000-000000000045');
SELECT set_config('fixture.chest_id',id::text,true)
FROM app_private.adventure_chests
WHERE battle_id='00000000-0000-0000-0000-000000000044';
SELECT set_config('fixture.recipe_id',recipe_id::text,true)
FROM app_private.boss_recipe_unlocks
WHERE user_id='44444444-4444-4444-4444-444444444444' AND stage=10;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='44444444-4444-4444-4444-444444444444';
DO $test$
DECLARE v_recipe uuid := current_setting('fixture.recipe_id')::uuid;
        v_chest uuid := current_setting('fixture.chest_id')::uuid;
        v_result jsonb; v_inventory uuid;
BEGIN
  v_result:=public.craft_boss_recipe(v_recipe,
    '00000000-0000-0000-0000-000000000046');
  PERFORM pg_temp.ok(v_result->>'replayed'='false','first craft');
  v_result:=public.craft_boss_recipe(v_recipe,
    '00000000-0000-0000-0000-000000000046');
  PERFORM pg_temp.ok(v_result->>'replayed'='true','craft replay');
  PERFORM pg_temp.ok((SELECT gold=20000 FROM public.user_balance
    WHERE user_id='44444444-4444-4444-4444-444444444444'),
    'one 80000 gold debit');
  SELECT id INTO v_inventory FROM public.user_inventory
  WHERE user_id='44444444-4444-4444-4444-444444444444'
    AND item_id=md5('craft:item:novato:10')::uuid;
  PERFORM public.set_inventory_equipped(v_inventory,true,false);
  PERFORM pg_temp.ok((SELECT equipped FROM public.user_inventory WHERE id=v_inventory),
    'real equip RPC accepted crafted item');
END;
$test$;
SAVEPOINT before_chest_start;
DO $test$
DECLARE v_chest uuid := current_setting('fixture.chest_id')::uuid;
        v_result jsonb;
BEGIN
  v_result:=public.start_adventure_chest(v_chest);
  PERFORM pg_temp.ok(v_result->>'replayed'='false','first chest start');
  v_result:=public.start_adventure_chest(v_chest);
  PERFORM pg_temp.ok(v_result->>'replayed'='true','chest start replay');
  BEGIN
    PERFORM public.claim_adventure_chest(v_chest);
    RAISE EXCEPTION 'EARLY_CLAIM_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM<>'CHEST_NOT_READY' THEN RAISE; END IF;
  END;
END;
$test$;
ROLLBACK TO SAVEPOINT before_chest_start;

SET LOCAL request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
DO $test$ BEGIN
  BEGIN
    PERFORM public.start_adventure_chest(current_setting('fixture.chest_id')::uuid);
    RAISE EXCEPTION 'CROSS_OWNER_CHEST_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM<>'CHEST_NOT_FOUND' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.craft_boss_recipe(current_setting('fixture.recipe_id')::uuid,
      '00000000-0000-0000-0000-000000000047');
    RAISE EXCEPTION 'CROSS_OWNER_CRAFT_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM<>'RECIPE_LOCKED' THEN RAISE; END IF;
  END;
END $test$;

RESET ROLE;
-- Local clock fixture: the same awarded chest is still queued after the
-- savepoint rollback. The normal queued->opening transition permits a past
-- ready_at; the frozen trigger stays enabled throughout.
UPDATE app_private.adventure_chests
SET status='opening',
    started_at=now()-make_interval(hours=>open_hours)-interval '1 minute',
    ready_at=now()-interval '1 minute'
WHERE id=current_setting('fixture.chest_id')::uuid;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='44444444-4444-4444-4444-444444444444';
DO $test$ DECLARE v_chest uuid:=current_setting('fixture.chest_id')::uuid;
                 v_result jsonb;
BEGIN
  v_result:=public.claim_adventure_chest(v_chest);
  PERFORM pg_temp.ok(v_result->>'replayed'='false','first chest claim');
  v_result:=public.claim_adventure_chest(v_chest);
  PERFORM pg_temp.ok(v_result->>'replayed'='true','chest claim replay');
END $test$;
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*)=1 FROM app_private.adventure_chest_claim_receipts
  WHERE chest_id=current_setting('fixture.chest_id')::uuid)
  AND (SELECT count(*)=1 FROM public.gold_history
    WHERE user_id='44444444-4444-4444-4444-444444444444'
      AND type='adventure_chest'),
  'one durable claim and gold ledger');
SELECT 'COMPOSED_ASSERT_PASS';
ROLLBACK;
