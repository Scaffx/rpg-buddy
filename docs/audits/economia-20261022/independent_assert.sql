-- Independent transaction-only probes against the composed PG17 fixture.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.ok(p_check boolean,p_label text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  IF p_check IS DISTINCT FROM true THEN RAISE EXCEPTION 'REVIEW_ASSERT: %',p_label; END IF;
END $$;

SELECT pg_temp.ok((SELECT count(*)=2 FROM pg_trigger t
  WHERE t.tgrelid='app_private.adventure_battles'::regclass
    AND t.tgname IN ('adventure_boss_recipe_victory','adventure_00_chest_win')
    AND t.tgenabled='O'
    AND ((t.tgname='adventure_boss_recipe_victory'
          AND t.tgfoid='app_private.on_boss_victory_recipe()'::regprocedure)
      OR (t.tgname='adventure_00_chest_win'
          AND t.tgfoid='app_private.on_adventure_chest_win()'::regprocedure))
    AND position('AFTER UPDATE OF status' IN pg_get_triggerdef(t.oid))>0
    AND position('old.status = ''fighting''::text' IN pg_get_triggerdef(t.oid))>0
    AND position('new.status = ''won''::text' IN pg_get_triggerdef(t.oid))>0),
  'battle trigger binding and WHEN');
SELECT pg_temp.ok((SELECT bool_and(p.proowner='postgres'::regrole AND p.prosecdef
    AND p.proconfig=ARRAY['search_path=""']::text[])
  FROM pg_proc p WHERE p.oid IN (
    'app_private.credit_adventure_material(uuid,text,integer,text,uuid)'::regprocedure,
    'public.craft_boss_recipe(uuid,uuid)'::regprocedure,
    'public.claim_adventure_chest(uuid)'::regprocedure)),
  'function owner and hardened body metadata');
SELECT pg_temp.ok(NOT has_function_privilege('anon','public.get_crafting_state()','EXECUTE')
  AND NOT has_function_privilege('anon','public.get_adventure_chests()','EXECUTE')
  AND NOT has_function_privilege('authenticated',
    'app_private.credit_adventure_material(uuid,text,integer,text,uuid)','EXECUTE')
  AND NOT has_function_privilege('authenticated',
    'app_private.on_adventure_chest_win()','EXECUTE')
  AND has_function_privilege('authenticated','public.craft_boss_recipe(uuid,uuid)','EXECUTE')
  AND has_function_privilege('authenticated','public.claim_adventure_chest(uuid)','EXECUTE'),
  'RPC and private helper ACL');
SELECT pg_temp.ok(NOT has_table_privilege('authenticated',
    'app_private.adventure_battles','INSERT,UPDATE,DELETE,TRUNCATE')
  AND NOT has_table_privilege('authenticated',
    'app_private.adventure_chests','INSERT,UPDATE,DELETE,TRUNCATE')
  AND NOT has_table_privilege('authenticated',
    'public.user_crafting_materials','INSERT,UPDATE,DELETE,TRUNCATE')
  AND NOT has_column_privilege('authenticated',
    'public.game_items','shop_price','UPDATE'),
  'client DML revoked');
SELECT pg_temp.ok((SELECT count(*)=3 FROM app_private.economy_balance_transition)
  AND (SELECT quantity=999999 FROM public.user_crafting_materials
       WHERE user_id='11111111-1111-1111-1111-111111111111')
  AND (SELECT count(*)=0 FROM app_private.adventure_material_receipts
       WHERE user_id='11111111-1111-1111-1111-111111111111'),
  'legitimate balances and legacy material isolation');

SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN
    PERFORM public.get_adventure_chests();
    RAISE EXCEPTION 'ANON_CHEST_RPC_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.get_crafting_state();
    RAISE EXCEPTION 'ANON_CRAFT_RPC_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

-- Autocommit behavior is covered by the composed runner; these failures are
-- caught inside a transaction so balances, inventory and receipts can be read.
UPDATE public.user_balance SET gold=0
WHERE user_id='11111111-1111-1111-1111-111111111111';
-- The historical fixture user predates the recipe's routine-level gate.
UPDATE public.profiles SET level=5
WHERE user_id='11111111-1111-1111-1111-111111111111';
SELECT set_config('review.recipe_id',recipe_id::text,true)
FROM app_private.boss_recipe_unlocks
WHERE user_id='11111111-1111-1111-1111-111111111111' AND stage=10;
SELECT set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);
SELECT set_config('review.item_id',(SELECT id::text FROM public.get_economy_shop()
  WHERE category='weapon' AND level_required=5 LIMIT 1),true);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
DO $$ BEGIN
  BEGIN
    PERFORM public.purchase_game_item(current_setting('review.item_id')::uuid,
      '11111111-0000-0000-0000-000000000011');
    RAISE EXCEPTION 'PURCHASE_WITHOUT_GOLD_ALLOWED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'INSUFFICIENT_GOLD' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.craft_boss_recipe(current_setting('review.recipe_id')::uuid,
      '11111111-0000-0000-0000-000000000012');
    RAISE EXCEPTION 'CRAFT_WITHOUT_GOLD_ALLOWED';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM <> 'INSUFFICIENT_GOLD' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;
SELECT pg_temp.ok((SELECT gold=0 FROM public.user_balance
    WHERE user_id='11111111-1111-1111-1111-111111111111')
  AND (SELECT count(*)=0 FROM public.inventory_purchase_requests
    WHERE user_id='11111111-1111-1111-1111-111111111111')
  AND (SELECT count(*)=0 FROM app_private.craft_requests
    WHERE user_id='11111111-1111-1111-1111-111111111111'),
  'insufficient funds left no receipts or debit');

UPDATE public.user_balance SET gold=100000
WHERE user_id='11111111-1111-1111-1111-111111111111';
SELECT app_private.credit_adventure_material(
  '11111111-1111-1111-1111-111111111111','scrap',10,'review_fixture',
  '11111111-0000-0000-0000-000000000013');
SELECT app_private.credit_adventure_material(
  '11111111-1111-1111-1111-111111111111','normal',10,'review_fixture',
  '11111111-0000-0000-0000-000000000013');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
DO $$ DECLARE v_result jsonb; BEGIN
  v_result:=public.purchase_game_item(current_setting('review.item_id')::uuid,
    '11111111-0000-0000-0000-000000000014');
  PERFORM pg_temp.ok(v_result->>'replayed'='false','first purchase');
  v_result:=public.purchase_game_item(current_setting('review.item_id')::uuid,
    '11111111-0000-0000-0000-000000000014');
  PERFORM pg_temp.ok(v_result->>'replayed'='true','purchase replay');
  BEGIN
    PERFORM public.purchase_game_item('00000000-0000-0000-0000-000000000099',
      '11111111-0000-0000-0000-000000000014');
    RAISE EXCEPTION 'PURCHASE_CONFLICT_ALLOWED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'PURCHASE_REQUEST_CONFLICT' THEN RAISE; END IF;
  END;
  v_result:=public.craft_boss_recipe(current_setting('review.recipe_id')::uuid,
    '11111111-0000-0000-0000-000000000015');
  PERFORM pg_temp.ok(v_result->>'replayed'='false','first craft');
  v_result:=public.craft_boss_recipe(current_setting('review.recipe_id')::uuid,
    '11111111-0000-0000-0000-000000000015');
  PERFORM pg_temp.ok(v_result->>'replayed'='true','craft replay');
  BEGIN
    PERFORM public.craft_boss_recipe('00000000-0000-0000-0000-000000000099',
      '11111111-0000-0000-0000-000000000015');
    RAISE EXCEPTION 'CRAFT_CONFLICT_ALLOWED';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM <> 'CRAFT_REQUEST_CONFLICT' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.inventory_purchase_requests
    WHERE user_id='11111111-1111-1111-1111-111111111111')
  AND (SELECT count(*)=1 FROM app_private.craft_requests
    WHERE user_id='11111111-1111-1111-1111-111111111111')
  AND (SELECT count(*)=1 FROM public.gold_history
    WHERE user_id='11111111-1111-1111-1111-111111111111' AND type='craft')
  AND (SELECT count(*)=1 FROM public.gold_history
    WHERE user_id='11111111-1111-1111-1111-111111111111' AND type='compra_equipamento'),
  'single debit and receipt for each action');
SELECT 'INDEPENDENT_ASSERT_PASS';
ROLLBACK;
