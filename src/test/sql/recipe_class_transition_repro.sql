\set ON_ERROR_STOP on
BEGIN;
\ir recipe_class_transition_setup.sql
DO $repro$
DECLARE v_user uuid := '33333333-3333-3333-3333-333333333333';
        v_boss uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
BEGIN
  IF app_private.hero_class_key(v_user) <> 'aprendiz' THEN
    RAISE EXCEPTION 'fixture did not start as Aprendiz'; END IF;
  INSERT INTO app_private.adventure_battles
    (id,user_id,stage,kind,status,boss_id,hero_class,hero_level,biome,started_at,ends_at)
  VALUES ('00000000-0000-0000-0000-000000000331',v_user,10,'boss','fighting',
    v_boss,'aprendiz',1,'forest','2026-10-22 10:00+00','2026-10-22 10:01+00');
  UPDATE app_private.adventure_battles SET status='won'
    WHERE id='00000000-0000-0000-0000-000000000331';
  IF (SELECT count(*) FROM app_private.boss_recipe_unlocks
      WHERE user_id=v_user AND stage=10) <> 1
     OR NOT EXISTS (SELECT 1 FROM app_private.boss_recipe_unlocks u
       JOIN app_private.boss_recipe_catalog c ON c.id=u.recipe_id
       WHERE u.user_id=v_user AND c.hero_class='novato') THEN
    RAISE EXCEPTION 'first Aprendiz victory did not unlock Novato'; END IF;
  UPDATE public.profiles SET level=5 WHERE user_id=v_user;
END;
$repro$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='33333333-3333-3333-3333-333333333333';
SELECT public.advance_hero_class('00000002-0000-0000-0000-000000000002');
RESET ROLE;
DO $repro$
DECLARE v_user uuid := '33333333-3333-3333-3333-333333333333';
BEGIN
  IF app_private.hero_class_key(v_user) <> 'mago' THEN
    RAISE EXCEPTION 'protected class transition was invalid'; END IF;
  INSERT INTO app_private.adventure_battles
    (id,user_id,stage,kind,status,boss_id,hero_class,hero_level,biome,started_at,ends_at)
  VALUES ('00000000-0000-0000-0000-000000000332',v_user,10,'boss','fighting',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','mago',5,'forest',
    '2026-10-22 10:02+00','2026-10-22 10:04+00');
  UPDATE app_private.adventure_battles SET status='won'
    WHERE id='00000000-0000-0000-0000-000000000332';
  IF (SELECT count(*) FROM app_private.boss_recipe_unlocks
      WHERE user_id=v_user AND stage=10) <> 1
     OR EXISTS (SELECT 1 FROM app_private.boss_recipe_unlocks u
       JOIN app_private.boss_recipe_catalog c ON c.id=u.recipe_id
       WHERE u.user_id=v_user AND c.hero_class='mago')
     OR (SELECT quantity FROM app_private.adventure_material_balances
         WHERE user_id=v_user AND material='scrap') <> 2
     OR (SELECT count(*) FROM app_private.boss_material_windows
         WHERE user_id=v_user) <> 1 THEN
    RAISE EXCEPTION 'baseline defect or material window not reproduced'; END IF;
END;
$repro$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='33333333-3333-3333-3333-333333333333';
SELECT public.get_crafting_state()->>'craft_class' AS craft_class,
       public.get_crafting_state()->>'recipe_count' AS recipe_count;
RESET ROLE;
\echo RECIPE_CLASS_TRANSITION_BASELINE_BUG_REPRODUCED
ROLLBACK;
