-- Reduced PG17 fixture after the economic migration. All mutations roll back.
BEGIN;
CREATE FUNCTION pg_temp.ok(p_condition boolean,p_message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'ECONOMY_ASSERT: %',p_message; END IF;
END;
$$;

SELECT pg_temp.ok((SELECT count(*)=3 FROM app_private.economy_balance_transition
                   WHERE (old_gold,new_gold) IN ((100,3800),(321,12198),(848,32224))),
                  'one transition receipt for every legacy balance');
SELECT pg_temp.ok((SELECT count(*)=3 FROM public.gold_history
                   WHERE type='economy_transition'), 'three credit history rows');
SELECT pg_temp.ok((SELECT price=600000 AND unlock_boss_id IS NOT NULL
                   FROM public.pet_catalog WHERE pet_type='golem_guardian')
                 AND (SELECT price=700000 FROM public.pet_catalog
                   WHERE pet_type='mini_leviata')
                 AND (SELECT price=4000000 FROM public.pet_catalog
                      WHERE pet_type='mini_demonio_fome'), 'pet price endpoints');
SELECT pg_temp.ok((SELECT cost_percent=570 FROM public.shop_items
                   WHERE name='Protetor'), 'time shop ratio retained');
SELECT pg_temp.ok(NOT has_table_privilege('authenticated',
                   'app_private.economy_shop_offers','SELECT')
                 AND NOT has_column_privilege('authenticated',
                   'public.game_items','shop_price','UPDATE')
                 AND NOT has_column_privilege('authenticated',
                   'public.pet_catalog','price','UPDATE'), 'catalog ACL');
-- An otherwise priced item outside the curated offer must be rejected.
UPDATE public.game_items SET shop_price=99
WHERE id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
DO $$
DECLARE v_result jsonb; v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.get_economy_shop();
  PERFORM pg_temp.ok(v_count=6,'five current offers and next weapon preview');
  PERFORM pg_temp.ok((SELECT count(*)=1 FROM public.get_economy_shop()
                      WHERE category='weapon' AND level_required=5),
                     'next-level requirement visible');
  v_result:=public.purchase_game_item('dc3bb3be-1d81-41ab-ab0e-32ddad07a9a1',
                                      '11111111-0000-0000-0000-000000000001');
  PERFORM pg_temp.ok(v_result->>'price'='1300' AND v_result->>'replayed'='false',
                     'first purchase charges server price');
  v_result:=public.purchase_game_item('dc3bb3be-1d81-41ab-ab0e-32ddad07a9a1',
                                      '11111111-0000-0000-0000-000000000001');
  PERFORM pg_temp.ok(v_result->>'replayed'='true','purchase request replay');
  BEGIN
    PERFORM public.buy_pet('golem_guardian');
    RAISE EXCEPTION 'LOCKED_STARTER_PET_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'Derrote %' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.purchase_game_item('ec000000-0000-4000-8000-000000000001',
                                      '11111111-0000-0000-0000-000000000002');
    RAISE EXCEPTION 'PREVIEW_PURCHASE_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'ITEM_NOT_FOR_SALE' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.purchase_game_item('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
                                      '11111111-0000-0000-0000-000000000003');
    RAISE EXCEPTION 'HIDDEN_PURCHASE_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'ITEM_NOT_FOR_SALE' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.buy_pet('mini_leviata');
    RAISE EXCEPTION 'LOCKED_PET_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'Derrote %' THEN RAISE; END IF;
  END;
  v_result:=public.get_adventure_income_7d();
  PERFORM pg_temp.ok(v_result->>'gold'='0' AND v_result->>'days'='7',
                     'transition credit is excluded from observed win income');
  v_result:=public.buy_shop_item('12345678-0000-0000-0000-000000000001',CURRENT_DATE);
  PERFORM pg_temp.ok(v_result->>'cost'='570','time shop charges new price');
END;
$$;
RESET ROLE;

-- A new Aprendiz inherits the chosen starter's shop role. Contradictory
-- protected identity fails closed for direct purchase and the public listing.
UPDATE public.profiles SET current_class_id='00000001-0000-0000-0000-000000000001'
WHERE user_id='11111111-1111-1111-1111-111111111111';
UPDATE app_private.hero_class_identity
SET current_class_id='00000001-0000-0000-0000-000000000001'
WHERE user_id='11111111-1111-1111-1111-111111111111';
SELECT pg_temp.ok(app_private.hero_class_key('11111111-1111-1111-1111-111111111111')='aprendiz',
                  'canonical class recognizes Aprendiz');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.get_economy_shop()
       WHERE id='dc3bb3be-1d81-41ab-ab0e-32ddad07a9a1'),
  'Aprendiz uses the starter physical shop');
RESET ROLE;
UPDATE public.profiles SET current_class_id=NULL
WHERE user_id='11111111-1111-1111-1111-111111111111';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
DO $$
BEGIN
  PERFORM pg_temp.ok((SELECT count(*)=0 FROM public.get_economy_shop()),
                     'contradictory class cannot list gear');
  BEGIN
    PERFORM public.purchase_game_item('cab90bce-5b79-408a-b2b5-ae86deb098a1',
                                      '11111111-0000-0000-0000-000000000099');
    RAISE EXCEPTION 'DRIFTED_CLASS_PURCHASE_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'INVALID_CANONICAL_CLASS' THEN RAISE; END IF;
  END;
END;
$$;
RESET ROLE;

SELECT pg_temp.ok((SELECT gold=1930 FROM public.user_balance
                   WHERE user_id='11111111-1111-1111-1111-111111111111'),
                  'purchase and time-shop debit are atomic');
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.inventory_purchase_requests
                   WHERE user_id='11111111-1111-1111-1111-111111111111'),
                  'one purchase receipt');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
DO $$
BEGIN
  PERFORM pg_temp.ok((SELECT count(*)=5 FROM public.get_economy_shop()
                      WHERE level_required<=50),'higher-level five current offers');
  PERFORM pg_temp.ok((SELECT count(*)=1 FROM public.get_economy_shop()
                      WHERE name='Lâmina do Veterano'),'physical weapon selected');
END;
$$;
RESET ROLE;

SELECT 'ECONOMY_ASSERT_PASS' AS result;
ROLLBACK;
