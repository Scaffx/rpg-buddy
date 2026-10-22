\set ON_ERROR_STOP on
BEGIN;
\ir recipe_class_transition_setup.sql
DO $test$
DECLARE v_user uuid := '33333333-3333-3333-3333-333333333333';
        v_novato uuid := md5('craft:recipe:novato:10')::uuid;
        v_boss uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
BEGIN
  IF (SELECT count(*) FROM app_private.boss_recipe_unlocks
      WHERE user_id='11111111-1111-1111-1111-111111111111' AND stage=10) <> 1 THEN
    RAISE EXCEPTION 'PK transition deleted historical right'; END IF;
  IF app_private.hero_class_key(v_user) <> 'aprendiz' THEN
    RAISE EXCEPTION 'invalid Aprendiz fixture'; END IF;
  INSERT INTO app_private.adventure_battles
    (id,user_id,stage,kind,status,boss_id,hero_class,hero_level,biome,started_at,ends_at)
  VALUES ('00000000-0000-0000-0000-000000000331',v_user,10,'boss','fighting',
    v_boss,'aprendiz',1,'forest','2026-10-22 10:00+00','2026-10-22 10:01+00');
  UPDATE app_private.adventure_battles SET status='won'
    WHERE id='00000000-0000-0000-0000-000000000331';
  IF NOT EXISTS (SELECT 1 FROM app_private.boss_recipe_unlocks
      WHERE user_id=v_user AND stage=10 AND recipe_id=v_novato)
     OR (SELECT quantity FROM app_private.adventure_material_balances
         WHERE user_id=v_user AND material='scrap') <> 2
     OR (SELECT quantity FROM app_private.adventure_material_balances
         WHERE user_id=v_user AND material='normal') <> 1 THEN
    RAISE EXCEPTION 'Aprendiz right or initial material failed'; END IF;
  UPDATE public.profiles SET level=5 WHERE user_id=v_user;
  INSERT INTO app_private.adventure_battles
    (id,user_id,stage,kind,status,boss_id,hero_class,hero_level,biome,started_at,ends_at)
  VALUES ('00000000-0000-0000-0000-000000000334',
    '44444444-4444-4444-4444-444444444444',10,'boss','fighting',v_boss,
    'clerico',5,'forest','2026-10-22 10:00+00','2026-10-22 10:01+00');
  UPDATE app_private.adventure_battles SET status='won'
    WHERE id='00000000-0000-0000-0000-000000000334';
  IF NOT EXISTS (SELECT 1 FROM app_private.boss_recipe_unlocks
      WHERE user_id='44444444-4444-4444-4444-444444444444'
        AND stage=10 AND recipe_id=v_novato)
     OR app_private.hero_class_key('44444444-4444-4444-4444-444444444444')<>'novato' THEN
    RAISE EXCEPTION 'Clerigo did not map to Novato'; END IF;
END;
$test$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='33333333-3333-3333-3333-333333333333';
SELECT public.advance_hero_class('00000002-0000-0000-0000-000000000002');
RESET ROLE;
DO $test$
DECLARE v_user uuid := '33333333-3333-3333-3333-333333333333';
        v_boss uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
        v_novato uuid := md5('craft:recipe:novato:10')::uuid;
        v_mago uuid := md5('craft:recipe:mago:10')::uuid;
BEGIN
  IF app_private.hero_class_key(v_user) <> 'mago'
     OR (SELECT level FROM public.profiles WHERE user_id=v_user) <> 5 THEN
    RAISE EXCEPTION 'public class progression failed'; END IF;
  INSERT INTO app_private.adventure_battles
    (id,user_id,stage,kind,status,boss_id,hero_class,hero_level,biome,started_at,ends_at)
  VALUES ('00000000-0000-0000-0000-000000000332',v_user,10,'boss','fighting',
    v_boss,'mago',5,'forest','2026-10-22 10:02+00','2026-10-22 10:04+00');
  UPDATE app_private.adventure_battles SET status='won'
    WHERE id='00000000-0000-0000-0000-000000000332';
  IF (SELECT count(*) FROM app_private.boss_recipe_unlocks
      WHERE user_id=v_user AND stage=10) <> 2
     OR NOT EXISTS (SELECT 1 FROM app_private.boss_recipe_unlocks
       WHERE user_id=v_user AND stage=10 AND recipe_id=v_novato)
     OR NOT EXISTS (SELECT 1 FROM app_private.boss_recipe_unlocks
       WHERE user_id=v_user AND stage=10 AND recipe_id=v_mago)
     OR (SELECT gold_cost FROM app_private.boss_recipe_catalog WHERE id=v_novato) <> 80000
     OR (SELECT gold_cost FROM app_private.boss_recipe_catalog WHERE id=v_mago) <> 80000
     OR (SELECT count(*) FROM app_private.boss_material_windows
         WHERE user_id=v_user) <> 1
     OR (SELECT quantity FROM app_private.adventure_material_balances
         WHERE user_id=v_user AND material='scrap') <> 2
     OR (SELECT quantity FROM app_private.adventure_material_balances
         WHERE user_id=v_user AND material='normal') <> 1
     OR (SELECT count(*) FROM app_private.boss_recipe_battle_receipts
         WHERE user_id=v_user) <> 2
     OR (SELECT level FROM public.profiles WHERE user_id=v_user) <> 5
     OR (SELECT total_xp FROM public.profiles WHERE user_id=v_user) <> 0
     OR (SELECT permanent_strength FROM public.profiles WHERE user_id=v_user) <> 7
     OR (SELECT permanent_intelligence FROM public.profiles WHERE user_id=v_user) <> 9 THEN
    RAISE EXCEPTION 'Mago unlock, retained Novato or single material window failed'; END IF;
  PERFORM app_private.credit_adventure_material(v_user,'scrap',12,
    'transition_fixture','00000000-0000-0000-0000-000000000391');
  PERFORM app_private.credit_adventure_material(v_user,'normal',3,
    'transition_fixture','00000000-0000-0000-0000-000000000391');
  -- The reduced fixture does not replay Economia's x38 wallet transition.
  UPDATE public.user_balance SET gold=200000 WHERE user_id=v_user;
END;
$test$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='33333333-3333-3333-3333-333333333333';
DO $test$
DECLARE v_state jsonb := public.get_crafting_state();
        v_novato uuid := md5('craft:recipe:novato:10')::uuid;
        v_mago uuid := md5('craft:recipe:mago:10')::uuid;
        v_cost integer; v_before integer; v_result jsonb;
BEGIN
  IF v_state->>'hero_class' <> 'mago' OR v_state->>'craft_class' <> 'mago'
     OR (v_state->>'recipe_count')::integer <> 2
     OR jsonb_array_length(v_state->'recipes') <> 2 THEN
    RAISE EXCEPTION 'public state omitted class rights'; END IF;
  BEGIN
    PERFORM public.craft_boss_recipe(v_novato,
      '00000000-0000-0000-0000-000000000392');
    RAISE EXCEPTION 'Novato craft accepted wrong current class';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM <> 'RECIPE_CLASS_REQUIRED' THEN RAISE; END IF;
  END;
  SELECT (recipe->>'gold_cost')::integer INTO v_cost
    FROM jsonb_array_elements(v_state->'recipes') AS recipe
    WHERE recipe->>'id'=v_mago::text;
  v_before := (v_state->>'gold')::integer;
  v_result := public.craft_boss_recipe(v_mago,
    '00000000-0000-0000-0000-000000000393');
  IF v_result->>'replayed' <> 'false'
     OR (public.get_crafting_state()->>'gold')::integer <> v_before-v_cost THEN
    RAISE EXCEPTION 'Mago craft payment failed'; END IF;
  v_result := public.craft_boss_recipe(v_mago,
    '00000000-0000-0000-0000-000000000393');
  IF v_result->>'replayed' <> 'true'
     OR (public.get_crafting_state()->>'gold')::integer <> v_before-v_cost THEN
    RAISE EXCEPTION 'Mago craft replay charged again'; END IF;
END;
$test$;
SET LOCAL request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
DO $test$
BEGIN
  IF (public.get_crafting_state()->>'recipe_count')::integer<>0 THEN
    RAISE EXCEPTION 'other identity sees recipes'; END IF;
  BEGIN
    PERFORM public.craft_boss_recipe(md5('craft:recipe:mago:10')::uuid,
      '00000000-0000-0000-0000-000000000395');
    RAISE EXCEPTION 'other identity crafted private recipe';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM<>'RECIPE_LOCKED' THEN RAISE; END IF;
  END;
END;
$test$;
SET LOCAL request.jwt.claim.sub='44444444-4444-4444-4444-444444444444';
DO $test$
DECLARE v_state jsonb := public.get_crafting_state();
BEGIN
  IF v_state->>'hero_class'<>'novato' OR v_state->>'craft_class'<>'novato'
     OR (v_state->>'recipe_count')::integer<>1 THEN
    RAISE EXCEPTION 'Clerigo public state mapping failed'; END IF;
END;
$test$;
SET LOCAL request.jwt.claim.sub='33333333-3333-3333-3333-333333333333';
RESET ROLE;
-- Model a trusted respec after earning both rights. The reduced fixture omits
-- the live respec wallet and skill tree; profile and private identity agree.
UPDATE app_private.hero_class_identity
SET starter_class='guerreiro',current_class_id='00000002-0000-0000-0000-000000000001'
WHERE user_id='33333333-3333-3333-3333-333333333333';
UPDATE public.profiles
SET starter_class='guerreiro',current_class_id='00000002-0000-0000-0000-000000000001'
WHERE user_id='33333333-3333-3333-3333-333333333333';
DO $test$
DECLARE v_user uuid := '33333333-3333-3333-3333-333333333333';
BEGIN
  IF app_private.hero_class_key(v_user) <> 'guerreiro' THEN
    RAISE EXCEPTION 'trusted class respec identity invalid'; END IF;
  INSERT INTO app_private.adventure_battles
    (id,user_id,stage,kind,status,boss_id,hero_class,hero_level,biome,started_at,ends_at)
  VALUES ('00000000-0000-0000-0000-000000000333',v_user,10,'boss','fighting',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','guerreiro',5,'forest',
    '2026-10-22 10:05+00','2026-10-22 10:07+00');
  UPDATE app_private.adventure_battles SET status='won'
    WHERE id='00000000-0000-0000-0000-000000000333';
  IF (SELECT count(*) FROM app_private.boss_recipe_unlocks
      WHERE user_id=v_user AND stage=10) <> 3
     OR (SELECT count(*) FROM app_private.boss_material_windows
         WHERE user_id=v_user) <> 1
     OR (SELECT total_xp FROM public.profiles WHERE user_id=v_user) <> 0
     OR (SELECT level FROM public.profiles WHERE user_id=v_user) <> 5
     OR (SELECT permanent_strength FROM public.profiles WHERE user_id=v_user) <> 7
     OR (SELECT permanent_intelligence FROM public.profiles WHERE user_id=v_user) <> 9 THEN
    RAISE EXCEPTION 'post-recipe class change lost rights or duplicated rewards'; END IF;
END;
$test$;
-- Return to Novato through a trusted identity fixture and confirm the old
-- recipe remains usable after two subsequent class changes.
UPDATE app_private.hero_class_identity SET starter_class='novato',current_class_id=NULL
WHERE user_id='33333333-3333-3333-3333-333333333333';
UPDATE public.profiles SET starter_class='novato',current_class_id=NULL
WHERE user_id='33333333-3333-3333-3333-333333333333';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='33333333-3333-3333-3333-333333333333';
DO $test$
DECLARE v_result jsonb;
BEGIN
  IF public.get_crafting_state()->>'craft_class' <> 'novato' THEN
    RAISE EXCEPTION 'return to Novato identity failed'; END IF;
  v_result := public.craft_boss_recipe(md5('craft:recipe:novato:10')::uuid,
    '00000000-0000-0000-0000-000000000394');
  IF v_result->>'replayed' <> 'false' THEN
    RAISE EXCEPTION 'historical Novato right unusable'; END IF;
END;
$test$;
RESET ROLE;
\echo RECIPE_CLASS_TRANSITION_ASSERTIONS_PASSED
ROLLBACK;
