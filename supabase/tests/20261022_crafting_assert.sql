\set ON_ERROR_STOP on
DO $test$
DECLARE v_user uuid := '11111111-1111-1111-1111-111111111111';
        v_other uuid := '22222222-2222-2222-2222-222222222222';
        v_apprentice uuid := '33333333-3333-3333-3333-333333333333';
        v_cleric uuid := '44444444-4444-4444-4444-444444444444';
        v_boss uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
        v_recipe uuid; v_desert uuid; v_novato_recipe uuid;
        v_item uuid; v_inventory uuid;
        v_before integer; v_after integer; v_result jsonb; v_state jsonb;
BEGIN
  IF (SELECT count(*) FROM app_private.boss_recipe_unlocks WHERE user_id=v_user)<>1
     OR (SELECT count(*) FROM app_private.boss_recipe_battle_receipts
         WHERE user_id=v_user AND historical)<>1
     OR (SELECT count(*) FROM app_private.adventure_material_receipts)<>0
     OR (SELECT quantity FROM public.user_crafting_materials WHERE user_id=v_user)<>999999 THEN
    RAISE EXCEPTION 'historical preserved without manufactured materials failed'; END IF;
  SELECT recipe_id INTO v_recipe FROM app_private.boss_recipe_unlocks
    WHERE user_id=v_user AND stage=10;
  IF (SELECT level_required FROM app_private.boss_recipe_catalog WHERE id=v_recipe)<>5 THEN
    RAISE EXCEPTION 'recipe level requirement failed'; END IF;
  v_result := app_private.credit_adventure_material(v_other,'water',3,
    'fixture_receipt','00000000-0000-0000-0000-000000007001');
  IF v_result->>'replayed'<>'false' THEN RAISE EXCEPTION 'first credit failed'; END IF;
  v_result := app_private.credit_adventure_material(v_other,'water',3,
    'fixture_receipt','00000000-0000-0000-0000-000000007001');
  IF v_result->>'replayed'<>'true' OR
     (SELECT quantity FROM app_private.adventure_material_balances
       WHERE user_id=v_other AND material='water')<>3 THEN
    RAISE EXCEPTION 'credit replay failed'; END IF;
  BEGIN
    PERFORM app_private.credit_adventure_material(v_user,'water',3,
      'fixture_receipt','00000000-0000-0000-0000-000000007001');
    RAISE EXCEPTION 'cross-owner receipt succeeded';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM<>'MATERIAL_RECEIPT_CONFLICT' THEN RAISE; END IF;
  END;

  INSERT INTO app_private.adventure_battles(id,user_id,stage,kind,status,boss_id,
    hero_class,hero_level,biome,started_at,ends_at) VALUES
    ('00000000-0000-0000-0000-000000000031',v_apprentice,10,'boss','fighting',v_boss,
      'aprendiz',1,'forest','2026-10-21 14:00+00','2026-10-21 14:01+00'),
    ('00000000-0000-0000-0000-000000000041',v_cleric,10,'boss','fighting',v_boss,
      'clerico',5,'forest','2026-10-21 14:00+00','2026-10-21 14:01+00');
  UPDATE app_private.adventure_battles SET status='won'
    WHERE user_id IN (v_apprentice,v_cleric) AND status='fighting';
  SELECT recipe_id INTO v_novato_recipe FROM app_private.boss_recipe_unlocks
    WHERE user_id=v_apprentice AND stage=10;
  IF v_novato_recipe IS NULL
     OR v_novato_recipe IS DISTINCT FROM (SELECT recipe_id
       FROM app_private.boss_recipe_unlocks WHERE user_id=v_cleric AND stage=10)
     OR (SELECT hero_class FROM app_private.boss_recipe_catalog
       WHERE id=v_novato_recipe)<>'novato' THEN
    RAISE EXCEPTION 'apprentice/cleric recipe mapping failed'; END IF;
  PERFORM set_config('request.jwt.claim.sub',v_apprentice::text,true);
  v_state := public.get_crafting_state();
  IF v_state->>'hero_class'<>'aprendiz' OR v_state->>'craft_class'<>'novato' THEN
    RAISE EXCEPTION 'apprentice RPC mapping failed'; END IF;
  BEGIN
    PERFORM public.craft_boss_recipe(v_novato_recipe,
      '00000000-0000-0000-0000-000000007002');
    RAISE EXCEPTION 'apprentice under-level craft succeeded';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM<>'RECIPE_LEVEL_REQUIRED' THEN RAISE; END IF;
  END;
  PERFORM set_config('request.jwt.claim.sub',v_cleric::text,true);
  v_state := public.get_crafting_state();
  IF v_state->>'hero_class'<>'novato' OR v_state->>'craft_class'<>'novato' THEN
    RAISE EXCEPTION 'cleric canonical class mapping failed'; END IF;

  INSERT INTO app_private.adventure_battles(id,user_id,stage,kind,status,boss_id,
    hero_class,hero_level,biome,started_at,ends_at) VALUES
    ('00000000-0000-0000-0000-000000000011',v_user,10,'boss','fighting',v_boss,
      'guerreiro',5,'forest','2026-10-21 11:00+00','2026-10-21 11:01+00'),
    ('00000000-0000-0000-0000-000000000012',v_user,10,'boss','fighting',v_boss,
      'guerreiro',5,'forest','2026-10-21 11:04+00','2026-10-21 11:06+00'),
    ('00000000-0000-0000-0000-000000000013',v_user,10,'boss','fighting',v_boss,
      'guerreiro',5,'forest','2026-10-21 11:30+00','2026-10-21 11:31+00'),
    ('00000000-0000-0000-0000-000000000014',v_user,10,'boss','fighting',v_boss,
      'guerreiro',5,'forest','2026-10-21 12:00+00','2026-10-21 12:01+00'),
    ('00000000-0000-0000-0000-000000000020',v_user,20,'boss','fighting',v_boss,
      'guerreiro',5,'desert','2026-10-21 13:00+00','2026-10-21 13:01+00');
  UPDATE app_private.adventure_battles SET status='won'
    WHERE user_id=v_user AND status='fighting';
  UPDATE app_private.adventure_battles SET gold_awarded=100 WHERE id=
    '00000000-0000-0000-0000-000000000011';
  IF (SELECT count(*) FROM app_private.boss_recipe_unlocks WHERE user_id=v_user)<>2
     OR (SELECT count(*) FROM app_private.boss_material_windows WHERE user_id=v_user)<>4
     OR (SELECT quantity FROM app_private.adventure_material_balances
         WHERE user_id=v_user AND material='scrap')<>8
     OR (SELECT quantity FROM app_private.adventure_material_balances
         WHERE user_id=v_user AND material='normal')<>3
     OR (SELECT quantity FROM app_private.adventure_material_balances
         WHERE user_id=v_user AND material='desert')<>1
     OR (SELECT count(*) FROM app_private.boss_recipe_battle_receipts WHERE user_id=v_user)<>5
     OR EXISTS (SELECT 1 FROM app_private.boss_recipe_battle_receipts WHERE battle_id=
       '00000000-0000-0000-0000-000000000012') THEN
    RAISE EXCEPTION 'first win, replay, cadence or receipt assertion failed'; END IF;
  SELECT recipe_id INTO v_desert FROM app_private.boss_recipe_unlocks
    WHERE user_id=v_user AND stage=20;
  PERFORM set_config('request.jwt.claim.sub',v_user::text,true);
  v_state := public.get_crafting_state();
  IF (v_state->>'recipe_count')::integer<>2
     OR jsonb_array_length(v_state->'recipes')<>2
     OR (v_state->'materials'->>'scrap')::integer<>8 THEN
    RAISE EXCEPTION 'crafting state RPC payload failed'; END IF;
  BEGIN
    PERFORM public.craft_boss_recipe(v_desert,
      '00000000-0000-0000-0000-000000001020');
    RAISE EXCEPTION 'above-level craft succeeded';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM<>'RECIPE_LEVEL_REQUIRED' THEN RAISE; END IF;
  END;
  v_result := public.craft_boss_recipe(v_recipe,
    '00000000-0000-0000-0000-000000001001');
  IF v_result->>'replayed'<>'false' THEN RAISE EXCEPTION 'first craft failed'; END IF;
  SELECT item_id INTO v_item FROM app_private.boss_recipe_catalog WHERE id=v_recipe;
  IF (SELECT boss_drop_level FROM public.game_items WHERE id=v_item)<>-1
     OR EXISTS (SELECT 1 FROM public.game_items WHERE id=v_item
       AND (shop_price IS NOT NULL OR rarity='comum' OR boss_drop_level IS NULL))
     OR has_table_privilege('authenticated','public.game_items','UPDATE') THEN
    RAISE EXCEPTION 'craft-only item leaked into shop/forage/normal loot'; END IF;
  SELECT id INTO v_inventory FROM public.user_inventory WHERE user_id=v_user AND item_id=v_item;
  IF (SELECT gold FROM public.user_balance WHERE user_id=v_user)<>76000
     OR (SELECT quantity FROM app_private.adventure_material_balances
         WHERE user_id=v_user AND material='scrap')<>2
     OR (SELECT quantity FROM public.user_inventory WHERE id=v_inventory)<>1 THEN
    RAISE EXCEPTION 'atomic craft failed'; END IF;
  v_result := public.craft_boss_recipe(v_recipe,
    '00000000-0000-0000-0000-000000001001');
  IF v_result->>'replayed'<>'true' OR
     (SELECT gold FROM public.user_balance WHERE user_id=v_user)<>76000 THEN
    RAISE EXCEPTION 'craft replay charged again'; END IF;
  BEGIN
    PERFORM public.craft_boss_recipe(v_recipe,
      '00000000-0000-0000-0000-000000001002');
    RAISE EXCEPTION 'insufficient material craft succeeded';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM<>'INSUFFICIENT_MATERIALS' THEN RAISE; END IF;
  END;
  IF (SELECT gold FROM public.user_balance WHERE user_id=v_user)<>76000
     OR (SELECT quantity FROM public.user_inventory WHERE id=v_inventory)<>1 THEN
    RAISE EXCEPTION 'partial debit after rejected craft'; END IF;
  PERFORM set_config('request.jwt.claim.sub',v_other::text,true);
  BEGIN
    PERFORM public.craft_boss_recipe(v_recipe,
      '00000000-0000-0000-0000-000000001003');
    RAISE EXCEPTION 'cross-owner craft succeeded';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM<>'RECIPE_LOCKED' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.salvage_inventory_duplicate(v_inventory,1,
      '00000000-0000-0000-0000-000000001004');
    RAISE EXCEPTION 'cross-owner salvage succeeded';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM<>'SALVAGE_DUPLICATE_REQUIRED' THEN RAISE; END IF;
  END;
  PERFORM set_config('request.jwt.claim.sub',v_user::text,true);
  UPDATE public.user_inventory SET quantity=3 WHERE id=v_inventory;
  v_result := public.salvage_inventory_duplicate(v_inventory,1,
    '00000000-0000-0000-0000-000000001005');
  IF v_result->>'replayed'<>'false' OR
     (SELECT quantity FROM public.user_inventory WHERE id=v_inventory)<>2
     OR (SELECT quantity FROM app_private.adventure_material_balances
         WHERE user_id=v_user AND material='scrap')<>3 THEN
    RAISE EXCEPTION 'salvage return failed'; END IF;
  v_result := public.salvage_inventory_duplicate(v_inventory,1,
    '00000000-0000-0000-0000-000000001005');
  IF v_result->>'replayed'<>'true' OR
     (SELECT quantity FROM public.user_inventory WHERE id=v_inventory)<>2 THEN
    RAISE EXCEPTION 'salvage replay failed'; END IF;
  UPDATE public.user_inventory SET equipped=true WHERE id=v_inventory;
  BEGIN
    PERFORM public.salvage_inventory_duplicate(v_inventory,1,
      '00000000-0000-0000-0000-000000001006');
    RAISE EXCEPTION 'equipped salvage succeeded';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM<>'SALVAGE_DUPLICATE_REQUIRED' THEN RAISE; END IF;
  END;
  IF (SELECT total_xp FROM public.profiles WHERE user_id=v_user)<>0
     OR (SELECT count(*) FROM public.gold_history WHERE user_id=v_user)<>1 THEN
    RAISE EXCEPTION 'XP or gold ledger changed outside craft'; END IF;
END;
$test$;
SELECT 'CRAFTING_ASSERTIONS_PASSED';
