\set ON_ERROR_STOP on
DO $test$
DECLARE v_user uuid := '22222222-2222-2222-2222-222222222222';
BEGIN
  IF (SELECT count(*) FROM app_private.adventure_battles
       WHERE id IN ('00000000-0000-0000-0000-000000000341',
                    '00000000-0000-0000-0000-000000000342')
         AND status='won') <> 2
     OR (SELECT count(*) FROM app_private.boss_recipe_unlocks
         WHERE user_id=v_user AND stage=10) <> 1
     OR (SELECT count(*) FROM app_private.boss_material_windows
         WHERE user_id=v_user) <> 1
     OR (SELECT count(*) FROM app_private.boss_recipe_battle_receipts
         WHERE user_id=v_user) <> 1
     OR (SELECT count(*) FROM app_private.adventure_material_receipts
         WHERE user_id=v_user AND source='boss_material_window') <> 2
     OR (SELECT quantity FROM app_private.adventure_material_balances
         WHERE user_id=v_user AND material='scrap') <> 2
     OR (SELECT quantity FROM app_private.adventure_material_balances
         WHERE user_id=v_user AND material='normal') <> 1
     OR (SELECT total_xp FROM public.profiles WHERE user_id=v_user) <> 0
     OR (SELECT level FROM public.profiles WHERE user_id=v_user) <> 80
     OR (SELECT permanent_strength FROM public.profiles WHERE user_id=v_user) <> 7
     OR (SELECT permanent_intelligence FROM public.profiles WHERE user_id=v_user) <> 9 THEN
    RAISE EXCEPTION 'two concurrent wins duplicated or lost an award'; END IF;
END;
$test$;
\echo RECIPE_CLASS_TRANSITION_CONCURRENCY_PASSED
