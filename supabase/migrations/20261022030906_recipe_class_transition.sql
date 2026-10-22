-- Preserve a recipe entitlement per class and boss stage. This correction runs
-- after Receitas 022416, Economia 022614 and Baús 022726.
BEGIN;
SET lock_timeout = '5s';
SET statement_timeout = '120s';

DO $guard$
DECLARE v_function oid := to_regprocedure(
  'app_private.register_boss_recipe(app_private.adventure_battles,boolean)');
BEGIN
  IF to_regclass('app_private.boss_recipe_unlocks') IS NULL
     OR to_regclass('app_private.boss_recipe_catalog') IS NULL
     OR to_regclass('app_private.boss_material_windows') IS NULL
     OR to_regclass('app_private.adventure_material_receipts') IS NULL
     OR to_regclass('app_private.adventure_battles') IS NULL
     OR v_function IS NULL
  THEN RAISE EXCEPTION 'RECIPE_CLASS_SOURCE_OR_SCHEMA_DRIFT' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=v_function
       AND md5(pg_get_functiondef(p.oid))='859d52e06b6f95a3947a033116d71026'
       AND p.proowner='postgres'::regrole AND p.prosecdef
       AND p.proconfig=ARRAY['search_path=""']::text[]
       AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
       AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE'))
     OR NOT EXISTS (SELECT 1 FROM pg_proc p
       WHERE p.oid=to_regprocedure('app_private.hero_class_key(uuid)')
         AND md5(pg_get_functiondef(p.oid))='da6e71eb8c5a2087a1cd4296a5418652'
         AND p.proowner='postgres'::regrole AND p.prosecdef
         AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE'))
     OR NOT EXISTS (SELECT 1 FROM pg_proc p
       WHERE p.oid=to_regprocedure('app_private.on_boss_victory_recipe()')
         AND md5(replace(pg_get_functiondef(p.oid),chr(13)||chr(10),chr(10)))
           ='2209e4f85d07906aa6ceab9e36a72d94'
         AND p.proowner='postgres'::regrole AND p.prosecdef
         AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE'))
     OR NOT EXISTS (SELECT 1 FROM pg_proc p
       WHERE p.oid=to_regprocedure('app_private.credit_adventure_material(uuid,text,integer,text,uuid)')
         AND md5(replace(pg_get_functiondef(p.oid),chr(13)||chr(10),chr(10)))
           ='bdacb6a018dd13eefce470ab4b7de99d'
         AND p.proowner='postgres'::regrole AND p.prosecdef
         AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE'))
     OR NOT EXISTS (SELECT 1 FROM pg_trigger t
       WHERE t.tgrelid='app_private.adventure_battles'::regclass
         AND t.tgname='adventure_boss_recipe_victory'
         AND t.tgenabled='O'
         AND t.tgfoid='app_private.on_boss_victory_recipe()'::regprocedure
         AND md5(pg_get_triggerdef(t.oid))='5b873393bec507891f9718113ab03de6')
     OR EXISTS (SELECT 1 FROM (VALUES
       ('public.get_crafting_state()','fa16e746b01cef693f6214b739bc36ca'),
       ('public.craft_boss_recipe(uuid,uuid)','acecb6f36c34644b56c40b296601074e')
       ) expected(signature,body_md5)
       LEFT JOIN pg_proc p ON p.oid=to_regprocedure(expected.signature)
       WHERE p.oid IS NULL
         OR md5(replace(pg_get_functiondef(p.oid),chr(13)||chr(10),chr(10)))
            <>expected.body_md5
         OR p.proowner<>'postgres'::regrole OR NOT p.prosecdef
         OR p.proconfig<>ARRAY['search_path=""']::text[]
         OR has_function_privilege('anon',p.oid,'EXECUTE')
         OR NOT has_function_privilege('authenticated',p.oid,'EXECUTE'))
  THEN RAISE EXCEPTION 'RECIPE_CLASS_SOURCE_OR_TRIGGER_DRIFT' USING ERRCODE='22023';
  END IF;
  IF EXISTS (SELECT 1 FROM (VALUES
       ('app_private.boss_recipe_unlocks'::regclass),
       ('app_private.boss_recipe_catalog'::regclass),
       ('app_private.boss_material_windows'::regclass),
       ('app_private.adventure_material_receipts'::regclass),
       ('app_private.adventure_battles'::regclass)
     ) AS expected(relid) JOIN pg_class c ON c.oid=expected.relid
     WHERE c.relowner<>'postgres'::regrole OR NOT c.relrowsecurity
       OR has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE')
       OR has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE'))
     OR EXISTS (SELECT 1 FROM pg_attribute a
       WHERE a.attrelid='app_private.boss_recipe_unlocks'::regclass
         AND a.attnum>0 AND NOT a.attisdropped
         AND (has_column_privilege('anon',a.attrelid,a.attname,'INSERT,UPDATE')
           OR has_column_privilege('authenticated',a.attrelid,a.attname,'INSERT,UPDATE')))
     OR (SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c
         WHERE c.conrelid='app_private.boss_recipe_unlocks'::regclass
           AND c.conname='boss_recipe_unlocks_pkey')
        IS DISTINCT FROM 'PRIMARY KEY (user_id, stage)'
     OR NOT EXISTS (SELECT 1 FROM pg_constraint c
       WHERE c.conrelid='app_private.boss_recipe_unlocks'::regclass
         AND c.contype='u' AND pg_get_constraintdef(c.oid)='UNIQUE (battle_id)')
     OR EXISTS (SELECT 1 FROM app_private.boss_recipe_unlocks u
       JOIN app_private.boss_recipe_catalog r ON r.id=u.recipe_id
       WHERE r.stage<>u.stage)
     OR EXISTS (SELECT 1 FROM app_private.boss_recipe_catalog r
       WHERE r.gold_cost IS DISTINCT FROM
         least(200000,80000+3000*((r.stage/10)-1)))
  THEN RAISE EXCEPTION 'RECIPE_CLASS_RIGHTS_OR_PRICE_DRIFT' USING ERRCODE='22023';
  END IF;
END;
$guard$;

-- DROP/ADD rewrites only the uniqueness rule; existing entitlement rows,
-- battle receipts, material windows and timestamps remain untouched.
ALTER TABLE app_private.boss_recipe_unlocks
  DROP CONSTRAINT boss_recipe_unlocks_pkey;
ALTER TABLE app_private.boss_recipe_unlocks
  ADD CONSTRAINT boss_recipe_unlocks_pkey PRIMARY KEY (user_id,stage,recipe_id),
  ADD CONSTRAINT boss_recipe_unlocks_user_recipe_key UNIQUE (user_id,recipe_id);

DO $replace$
DECLARE v_source text;
        v_old_gate text := 'WHERE user_id=p_battle.user_id AND stage=p_battle.stage)';
        v_new_gate text := 'WHERE user_id=p_battle.user_id AND stage=p_battle.stage
         AND recipe_id=md5(''craft:recipe:''||v_class||'':''||p_battle.stage)::uuid)';
        v_old_conflict text := 'ON CONFLICT (user_id,stage) DO NOTHING RETURNING battle_id INTO v_new_unlock;';
        v_new_conflict text := 'ON CONFLICT (user_id,stage,recipe_id) DO NOTHING RETURNING battle_id INTO v_new_unlock;';
BEGIN
  SELECT pg_get_functiondef(
    'app_private.register_boss_recipe(app_private.adventure_battles,boolean)'::regprocedure)
  INTO v_source;
  IF length(v_source)-length(replace(v_source,v_old_gate,''))<>length(v_old_gate)
     OR length(v_source)-length(replace(v_source,v_old_conflict,''))<>length(v_old_conflict)
  THEN RAISE EXCEPTION 'RECIPE_CLASS_PATCH_ANCHOR_DRIFT' USING ERRCODE='22023';
  END IF;
  EXECUTE replace(replace(v_source,v_old_gate,v_new_gate),v_old_conflict,v_new_conflict);
  IF md5(pg_get_functiondef(
       'app_private.register_boss_recipe(app_private.adventure_battles,boolean)'::regprocedure))
       <>'92be0172cfc9edf835b3057326183540'
     OR NOT EXISTS (SELECT 1 FROM pg_constraint c
       WHERE c.conrelid='app_private.boss_recipe_unlocks'::regclass
         AND c.conname='boss_recipe_unlocks_pkey'
         AND pg_get_constraintdef(c.oid)='PRIMARY KEY (user_id, stage, recipe_id)')
  THEN RAISE EXCEPTION 'RECIPE_CLASS_PATCH_DID_NOT_APPLY' USING ERRCODE='22023';
  END IF;
END;
$replace$;
COMMIT;
