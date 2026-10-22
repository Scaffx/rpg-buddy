\set ON_ERROR_STOP on
-- Run on the frozen 12-file composed PR70/Receitas/Economia/Baús fixture,
-- then apply 20261022030906 before this assertion.
BEGIN;
DO $test$
BEGIN
  IF (SELECT count(*) FROM app_private.boss_recipe_unlocks
      WHERE user_id='11111111-1111-1111-1111-111111111111' AND stage=10)<>1
     OR (SELECT count(*) FROM app_private.boss_recipe_battle_receipts
         WHERE user_id='11111111-1111-1111-1111-111111111111' AND historical)<>1
     OR (SELECT count(*) FROM app_private.adventure_material_receipts
         WHERE user_id='11111111-1111-1111-1111-111111111111')<>0 THEN
    RAISE EXCEPTION 'historical right or receipt changed during PK transition'; END IF;
END;
$test$;
UPDATE app_private.hero_class_identity
SET current_class_id='00000001-0000-0000-0000-000000000001'
WHERE user_id='33333333-3333-3333-3333-333333333333';
UPDATE public.profiles
SET current_class_id='00000001-0000-0000-0000-000000000001'
WHERE user_id='33333333-3333-3333-3333-333333333333';
DO $test$
DECLARE v_user uuid := '33333333-3333-3333-3333-333333333333';
        v_battle uuid := '00000000-0000-0000-0000-000000000431';
        v_end timestamptz := clock_timestamp()-interval '0.5 seconds';
BEGIN
  IF app_private.hero_class_key(v_user)<>'aprendiz' THEN
    RAISE EXCEPTION 'composed Aprendiz identity invalid'; END IF;
  -- Historical first clear predates this recipe entitlement. The new private
  -- replay is the first battle retained after Receitas was installed.
  INSERT INTO public.adventure_encounters
    (user_id,stage,attempt,fought_at,kind,won,hero_power,enemy_power,gold,boss_id)
  VALUES(v_user,10,0,v_end-interval '1 day','boss',true,247,21,0,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  INSERT INTO app_private.adventure_battles
  SELECT (jsonb_populate_record(NULL::app_private.adventure_battles,
    to_jsonb(b) || jsonb_build_object(
      'id',v_battle,'user_id',v_user,'stage',10,'attempt',1,
      'kind','boss','status','fighting','replay',true,
      'boss_id','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'hero_class','aprendiz','hero_level',1,'biome','forest',
      'started_at',v_end-interval '15 seconds','ends_at',v_end,
      'gold_awarded',0,'item_id',NULL,
      'events',jsonb_build_array(jsonb_build_object(
        'at',v_end,'actor','hero','kind','attack','damage',150,
        'hero_hp',40,'enemy_hp',0,'effect','physical'))))).*
  FROM app_private.adventure_battles b
  WHERE b.id='00000000-0000-0000-0000-000000000010';
  INSERT INTO public.adventure_state(user_id,stage,attempt,current_battle_id,last_tick_at)
  VALUES(v_user,10,1,v_battle,v_end-interval '15 seconds');
END;
$test$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='33333333-3333-3333-3333-333333333333';
SELECT public.sync_auto_adventure()->'last_result' AS apprentice_sync_result;
RESET ROLE;
DO $test$
DECLARE v_user uuid := '33333333-3333-3333-3333-333333333333';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_private.adventure_battles
      WHERE id='00000000-0000-0000-0000-000000000431'
        AND status='won' AND hero_class='aprendiz')
     OR NOT EXISTS (SELECT 1 FROM app_private.boss_recipe_unlocks
       WHERE user_id=v_user AND stage=10
         AND recipe_id=md5('craft:recipe:novato:10')::uuid) THEN
    RAISE EXCEPTION 'public sync did not settle Aprendiz snapshot'; END IF;
END;
$test$;
UPDATE public.profiles SET level=5
WHERE user_id='33333333-3333-3333-3333-333333333333';
-- The composed package imports the canonical class helper, not its public
-- advancement RPC. Advance the protected identity and mirror as fixture data.
UPDATE app_private.hero_class_identity
SET current_class_id='00000002-0000-0000-0000-000000000002'
WHERE user_id='33333333-3333-3333-3333-333333333333';
UPDATE public.profiles
SET current_class_id='00000002-0000-0000-0000-000000000002'
WHERE user_id='33333333-3333-3333-3333-333333333333';
DO $test$
BEGIN
  IF app_private.hero_class_key('33333333-3333-3333-3333-333333333333')<>'mago' THEN
    RAISE EXCEPTION 'protected Mago progression invalid'; END IF;
END;
$test$;
UPDATE public.adventure_state
SET stage=10,attempt=2,current_battle_id=NULL,last_tick_at=clock_timestamp(),
    adventure_mode='progressing'
WHERE user_id='33333333-3333-3333-3333-333333333333';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='33333333-3333-3333-3333-333333333333';
SELECT public.sync_auto_adventure()->'battle'->>'hero_class' AS mago_generated_class;
RESET ROLE;
DO $test$
DECLARE v_user uuid := '33333333-3333-3333-3333-333333333333';
        v_battle uuid; v_end timestamptz := clock_timestamp()-interval '0.5 seconds';
BEGIN
  SELECT current_battle_id INTO v_battle FROM public.adventure_state WHERE user_id=v_user;
  IF v_battle IS NULL OR NOT EXISTS (SELECT 1 FROM app_private.adventure_battles
      WHERE id=v_battle AND stage=10 AND kind='boss' AND status='fighting'
        AND hero_class='mago' AND replay) THEN
    RAISE EXCEPTION 'public sync did not generate Mago replay snapshot'; END IF;
  -- Local clock instrumentation only: mature the server-created battle and
  -- preserve its result snapshot without changing the Windows clock.
  UPDATE app_private.adventure_battles
    SET started_at=v_end-interval '15 seconds',ends_at=v_end,
        events=jsonb_build_array(jsonb_build_object(
          'at',v_end,'actor','hero','kind','attack','damage',150,
          'hero_hp',40,'enemy_hp',0,'effect','physical'))
  WHERE id=v_battle;
END;
$test$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='33333333-3333-3333-3333-333333333333';
SELECT public.sync_auto_adventure()->'last_result' AS mago_sync_result;
RESET ROLE;
DO $test$
DECLARE v_user uuid := '33333333-3333-3333-3333-333333333333';
BEGIN
  IF (SELECT count(*) FROM app_private.boss_recipe_unlocks
       WHERE user_id=v_user AND stage=10)<>2
     OR NOT EXISTS (SELECT 1 FROM app_private.boss_recipe_unlocks
       WHERE user_id=v_user AND stage=10
         AND recipe_id=md5('craft:recipe:mago:10')::uuid)
     OR (SELECT count(*) FROM app_private.boss_material_windows WHERE user_id=v_user)<>1
     OR (SELECT quantity FROM app_private.adventure_material_balances
         WHERE user_id=v_user AND material='scrap')<>2
     OR (SELECT count(*) FROM app_private.adventure_material_receipts
         WHERE user_id=v_user AND source='boss_material_window')<>2
     OR (SELECT gold_cost FROM app_private.boss_recipe_catalog
         WHERE id=md5('craft:recipe:novato:10')::uuid)<>80000
     OR (SELECT gold_cost FROM app_private.boss_recipe_catalog
         WHERE id=md5('craft:recipe:mago:10')::uuid)<>80000
     OR (SELECT level FROM public.profiles WHERE user_id=v_user)<>5
     OR (SELECT total_xp FROM public.profiles WHERE user_id=v_user)<>1234
     OR (SELECT xp FROM public.attributes WHERE user_id=v_user)<>7
     OR (SELECT level FROM public.attributes WHERE user_id=v_user)<>3 THEN
    RAISE EXCEPTION 'composed Mago replay lost rights or doubled material'; END IF;
END;
$test$;
DO $test$
DECLARE v_user uuid := '33333333-3333-3333-3333-333333333333';
BEGIN
  PERFORM app_private.credit_adventure_material(v_user,'scrap',12,
    'transition_fixture','00000000-0000-0000-0000-000000000491');
  PERFORM app_private.credit_adventure_material(v_user,'normal',3,
    'transition_fixture','00000000-0000-0000-0000-000000000491');
  UPDATE public.user_balance SET gold=200000 WHERE user_id=v_user;
END;
$test$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='33333333-3333-3333-3333-333333333333';
DO $test$
DECLARE v_state jsonb := public.get_crafting_state();
        v_result jsonb;
BEGIN
  IF v_state->>'craft_class'<>'mago' OR (v_state->>'recipe_count')::integer<>2
     OR jsonb_array_length(v_state->'recipes')<>2 THEN
    RAISE EXCEPTION 'composed public crafting state missed Mago right'; END IF;
  BEGIN
    PERFORM public.craft_boss_recipe(md5('craft:recipe:novato:10')::uuid,
      '00000000-0000-0000-0000-000000000492');
    RAISE EXCEPTION 'Novato craft succeeded while Mago active';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM<>'RECIPE_CLASS_REQUIRED' THEN RAISE; END IF;
  END;
  v_result := public.craft_boss_recipe(md5('craft:recipe:mago:10')::uuid,
    '00000000-0000-0000-0000-000000000493');
  IF v_result->>'replayed'<>'false'
     OR (public.get_crafting_state()->>'gold')::integer<>120000 THEN
    RAISE EXCEPTION 'Mago craft price or debit failed'; END IF;
  v_result := public.craft_boss_recipe(md5('craft:recipe:mago:10')::uuid,
    '00000000-0000-0000-0000-000000000493');
  IF v_result->>'replayed'<>'true'
     OR (public.get_crafting_state()->>'gold')::integer<>120000 THEN
    RAISE EXCEPTION 'Mago craft replay double charged'; END IF;
END;
$test$;
RESET ROLE;
\echo RECIPE_CLASS_TRANSITION_COMPOSED_SYNC_PASSED
ROLLBACK;
