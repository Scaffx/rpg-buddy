-- Server-owned recipes and materials. Apply after the adventure engine and
-- inventory-authorship migrations, before the chest migration.
BEGIN;
SET lock_timeout = '5s';
SET statement_timeout = '120s';

DO $guard$
BEGIN
  IF to_regclass('app_private.adventure_battles') IS NULL
     OR to_regprocedure('app_private.hero_class_key(uuid)') IS NULL
     OR to_regclass('public.user_inventory') IS NULL
     OR to_regclass('public.user_balance') IS NULL
     OR EXISTS (SELECT 1 FROM pg_class c WHERE c.oid='public.game_items'::regclass
       AND (c.relowner<>'postgres'::regrole OR NOT c.relrowsecurity))
     OR EXISTS (SELECT 1 FROM pg_policy p
       WHERE p.polrelid='public.game_items'::regclass AND p.polcmd<>'r')
     OR EXISTS (
       SELECT 1 FROM pg_class c
       WHERE c.oid='app_private.adventure_battles'::regclass
         AND (c.relowner <> 'postgres'::regrole OR NOT c.relrowsecurity
           OR has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE')
           OR has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE'))
     )
     OR EXISTS (
       SELECT 1 FROM pg_attribute a
       WHERE a.attrelid='app_private.adventure_battles'::regclass
         AND a.attnum>0 AND NOT a.attisdropped
         AND (has_column_privilege('anon','app_private.adventure_battles',a.attname,'INSERT,UPDATE')
           OR has_column_privilege('authenticated','app_private.adventure_battles',a.attname,'INSERT,UPDATE'))
     )
     OR EXISTS (
       SELECT 1 FROM pg_proc p WHERE p.oid='app_private.sync_auto_adventure()'::regprocedure
         AND (p.proowner <> 'postgres'::regrole OR NOT p.prosecdef
           OR md5(pg_get_functiondef(p.oid))<>'ef8da5af1aa65460a92f160df438462b')
     )
     OR EXISTS (
       SELECT 1 FROM pg_proc p WHERE p.oid='app_private.hero_class_key(uuid)'::regprocedure
         AND (p.proowner <> 'postgres'::regrole OR NOT p.prosecdef
           OR md5(pg_get_functiondef(p.oid))<>'da6e71eb8c5a2087a1cd4296a5418652')
     )
     OR EXISTS (
       SELECT 1 FROM pg_proc p WHERE p.oid='app_private.class_path_matches(uuid,text,integer)'::regprocedure
         AND (p.proowner <> 'postgres'::regrole OR p.prosecdef
           OR has_function_privilege('authenticated',p.oid,'EXECUTE')
           OR md5(pg_get_functiondef(p.oid))<>'883c77c3a430855102403124f67c790d')
     )
     OR EXISTS (
       SELECT 1 FROM pg_proc p WHERE p.oid='public.set_inventory_equipped(uuid,boolean,boolean)'::regprocedure
         AND (p.proowner <> 'postgres'::regrole OR NOT p.prosecdef
           OR md5(pg_get_functiondef(p.oid))<>'ba16fefce62bc1a6d06c30ef32c40813')
     )
     OR EXISTS (SELECT 1 FROM pg_trigger t
       WHERE t.tgrelid='app_private.adventure_battles'::regclass AND NOT t.tgisinternal)
  THEN RAISE EXCEPTION 'CRAFT_SOURCE_OR_ACL_DRIFT' USING ERRCODE='22023'; END IF;
END;
$guard$;

-- The legacy wallet accepted client DML. Keep its rows for inspection, but do
-- not import them into the authoritative wallet as acquisition evidence.
DROP POLICY IF EXISTS "Users can insert own crafting materials" ON public.user_crafting_materials;
DROP POLICY IF EXISTS "Users can update own crafting materials" ON public.user_crafting_materials;
DROP POLICY IF EXISTS "Users manage own materials" ON public.user_crafting_materials;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.user_crafting_materials FROM PUBLIC, anon, authenticated;
DO $revoke_columns$ DECLARE v_column text; BEGIN
  FOR v_column IN SELECT attname FROM pg_attribute
    WHERE attrelid='public.user_crafting_materials'::regclass
      AND attnum>0 AND NOT attisdropped LOOP
    EXECUTE format('REVOKE INSERT (%1$I), UPDATE (%1$I), REFERENCES (%1$I) ON public.user_crafting_materials FROM PUBLIC, anon, authenticated',v_column);
  END LOOP;
END $revoke_columns$;
-- Item definitions are server catalog data. Existing clients only read them.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.game_items FROM PUBLIC, anon, authenticated;
DO $revoke_item_columns$ DECLARE v_column text; BEGIN
  FOR v_column IN SELECT attname FROM pg_attribute
    WHERE attrelid='public.game_items'::regclass
      AND attnum>0 AND NOT attisdropped LOOP
    EXECUTE format('REVOKE INSERT (%1$I), UPDATE (%1$I), REFERENCES (%1$I) ON public.game_items FROM PUBLIC, anon, authenticated',v_column);
  END LOOP;
END $revoke_item_columns$;

CREATE TABLE app_private.adventure_material_balances (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  material text NOT NULL CHECK (material IN ('scrap','normal','desert','water','ice','fire')),
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  PRIMARY KEY (user_id,material)
);
CREATE TABLE app_private.adventure_material_receipts (
  source text NOT NULL CHECK (length(source) BETWEEN 1 AND 80),
  source_id uuid NOT NULL,
  material text NOT NULL CHECK (material IN ('scrap','normal','desert','water','ice','fire')),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount BETWEEN 1 AND 1000),
  credited_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (source,source_id,material)
);
CREATE TABLE app_private.boss_recipe_catalog (
  id uuid PRIMARY KEY,
  hero_class text NOT NULL CHECK (hero_class IN ('novato','guerreiro','mago','gatuno','ferreiro','arqueiro')),
  stage integer NOT NULL CHECK (stage BETWEEN 10 AND 100000 AND stage % 10=0),
  realm text NOT NULL CHECK (realm IN ('normal','desert','water','ice','fire')),
  item_id uuid NOT NULL UNIQUE REFERENCES public.game_items(id),
  level_required integer NOT NULL CHECK (level_required >= 1),
  gold_cost integer NOT NULL CHECK (gold_cost > 0),
  scrap_cost integer NOT NULL CHECK (scrap_cost > 1),
  essence_cost integer NOT NULL CHECK (essence_cost > 0),
  UNIQUE (hero_class,stage)
);
CREATE TABLE app_private.boss_recipe_unlocks (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stage integer NOT NULL,
  recipe_id uuid NOT NULL REFERENCES app_private.boss_recipe_catalog(id),
  battle_id uuid NOT NULL UNIQUE,
  unlocked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id,stage)
);
CREATE TABLE app_private.boss_recipe_battle_receipts (
  battle_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stage integer NOT NULL,
  recipe_id uuid NOT NULL REFERENCES app_private.boss_recipe_catalog(id),
  historical boolean NOT NULL DEFAULT false,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- A boss fight may resolve rapidly. Material income follows server battle time,
-- at most once per UTC half-hour per user, across all boss stages and realms.
CREATE TABLE app_private.boss_material_windows (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  half_hour_slot bigint NOT NULL,
  battle_id uuid NOT NULL UNIQUE,
  PRIMARY KEY (user_id,half_hour_slot)
);
CREATE TABLE app_private.craft_requests (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  recipe_id uuid NOT NULL REFERENCES app_private.boss_recipe_catalog(id),
  item_id uuid NOT NULL REFERENCES public.game_items(id),
  gold_spent integer NOT NULL,
  crafted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id,request_id)
);
CREATE TABLE app_private.salvage_requests (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  inventory_id uuid NOT NULL,
  item_id uuid NOT NULL REFERENCES public.game_items(id),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 100),
  scrap_return integer NOT NULL CHECK (scrap_return BETWEEN 1 AND 100),
  salvaged_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id,request_id)
);
DO $private_tables$ DECLARE v_table text; BEGIN
  FOREACH v_table IN ARRAY ARRAY['adventure_material_balances','adventure_material_receipts',
    'boss_recipe_catalog','boss_recipe_unlocks','boss_recipe_battle_receipts',
    'boss_material_windows',
    'craft_requests','salvage_requests'] LOOP
    EXECUTE format('ALTER TABLE app_private.%I ENABLE ROW LEVEL SECURITY',v_table);
    EXECUTE format('REVOKE ALL ON app_private.%I FROM PUBLIC, anon, authenticated',v_table);
  END LOOP;
END $private_tables$;

CREATE FUNCTION app_private.credit_adventure_material(
  p_user_id uuid,p_material text,p_amount integer,p_source text,p_source_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_existing app_private.adventure_material_receipts%ROWTYPE; v_quantity integer;
BEGIN
  IF p_user_id IS NULL OR p_material NOT IN ('scrap','normal','desert','water','ice','fire')
     OR p_amount NOT BETWEEN 1 AND 1000 OR p_source IS NULL
     OR length(p_source) NOT BETWEEN 1 AND 80 OR p_source_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_MATERIAL_CREDIT' USING ERRCODE='22023';
  END IF;
  -- All economy paths serialize on the profile before balance/material rows.
  PERFORM 1 FROM public.profiles WHERE user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_existing FROM app_private.adventure_material_receipts
    WHERE source=p_source AND source_id=p_source_id AND material=p_material;
  IF FOUND THEN
    IF v_existing.user_id<>p_user_id OR v_existing.amount<>p_amount THEN
      RAISE EXCEPTION 'MATERIAL_RECEIPT_CONFLICT' USING ERRCODE='22023';
    END IF;
    SELECT quantity INTO v_quantity FROM app_private.adventure_material_balances
      WHERE user_id=p_user_id AND material=p_material;
    RETURN jsonb_build_object('ok',true,'replayed',true,'quantity',v_quantity);
  END IF;
  INSERT INTO app_private.adventure_material_receipts(source,source_id,material,user_id,amount)
    VALUES(p_source,p_source_id,p_material,p_user_id,p_amount);
  INSERT INTO app_private.adventure_material_balances(user_id,material,quantity)
    VALUES(p_user_id,p_material,p_amount)
    ON CONFLICT (user_id,material) DO UPDATE
      SET quantity=app_private.adventure_material_balances.quantity+EXCLUDED.quantity
    RETURNING quantity INTO v_quantity;
  RETURN jsonb_build_object('ok',true,'replayed',false,'quantity',v_quantity);
END;
$fn$;
REVOKE ALL ON FUNCTION app_private.credit_adventure_material(uuid,text,integer,text,uuid)
  FROM PUBLIC, anon, authenticated;

-- Both the trigger and the historical backfill call this private registration.
-- Historical battles grant the recipe, not retroactive materials.
CREATE FUNCTION app_private.register_boss_recipe(
  p_battle app_private.adventure_battles,p_historical boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_class text; v_realm text; v_realm_name text;
        v_item uuid; v_recipe uuid;
        v_level integer; v_tier integer; v_name text; v_stat integer;
        v_window uuid; v_new_unlock uuid;
BEGIN
  IF p_battle.status<>'won' OR p_battle.kind<>'boss'
     OR p_battle.boss_id IS NULL OR p_battle.stage%10<>0 THEN RETURN; END IF;
  v_class := lower(p_battle.hero_class);
  IF v_class IN ('aprendiz','clerico') THEN v_class := 'novato'; END IF;
  IF v_class NOT IN ('novato','guerreiro','mago','gatuno','ferreiro','arqueiro') THEN
    RAISE EXCEPTION 'INVALID_BOSS_CLASS' USING ERRCODE='22023';
  END IF;
  v_tier := p_battle.stage/10;
  v_realm := (ARRAY['normal','desert','water','ice','fire'])[((v_tier-1)%5)+1];
  v_realm_name := (ARRAY['da Floresta','do Deserto','das Águas','do Gelo','do Fogo'])[((v_tier-1)%5)+1];
  IF NOT p_historical AND p_battle.biome IS DISTINCT FROM
     (ARRAY['forest','desert','aquatic','ice','volcanic'])[((v_tier-1)%5)+1] THEN
    RAISE EXCEPTION 'BOSS_REALM_MISMATCH' USING ERRCODE='22023';
  END IF;
  -- A repeat inside a claimed window yields nothing; avoid catalog and ledger
  -- work during dense offline catch-up.
  IF EXISTS (SELECT 1 FROM app_private.boss_recipe_unlocks
       WHERE user_id=p_battle.user_id AND stage=p_battle.stage)
     AND (p_historical OR EXISTS (SELECT 1 FROM app_private.boss_material_windows
       WHERE user_id=p_battle.user_id
         AND half_hour_slot=floor(extract(epoch FROM p_battle.ends_at)/1800)::bigint))
  THEN RETURN; END IF;
  v_level := least(400,greatest(5,p_battle.stage/2));
  v_stat := least(48,8+2*v_tier);
  v_item := md5('craft:item:'||v_class||':'||p_battle.stage)::uuid;
  v_recipe := md5('craft:recipe:'||v_class||':'||p_battle.stage)::uuid;
  v_name := 'Arma '||v_realm_name||' · '||initcap(v_class)||' · etapa '||p_battle.stage;
  -- -1 is a non-boss sentinel: existing shop and forage RPCs exclude non-NULL
  -- boss_drop_level, while the legacy resolver only matches positive boss levels.
  INSERT INTO public.game_items(id,name,description,icon,category,rarity,stat_label,
    atk_bonus,matk_bonus,agi_bonus,def_bonus,shop_price,level_required,
    stackable,is_consumable,is_starter,boss_drop_level)
  VALUES(v_item,v_name,'Criada na oficina após vencer o chefe desta faixa.','⚒️',
    'weapon',CASE WHEN v_tier>=5 THEN 'epico' ELSE 'raro' END,
    CASE WHEN v_class IN ('mago','clerico') THEN '+'||v_stat||' MATK'
         ELSE '+'||v_stat||' ATK' END,
    CASE WHEN v_class IN ('mago','clerico') THEN 0 ELSE v_stat END,
    CASE WHEN v_class IN ('mago','clerico') THEN v_stat ELSE 0 END,
    CASE WHEN v_class IN ('gatuno','arqueiro') THEN least(8,v_tier) ELSE 0 END,
    CASE WHEN v_class IN ('guerreiro','ferreiro') THEN least(8,v_tier) ELSE 0 END,
    NULL,v_level,false,false,false,-1)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_private.boss_recipe_catalog(id,hero_class,stage,realm,item_id,
    level_required,gold_cost,scrap_cost,essence_cost)
  VALUES(v_recipe,v_class,p_battle.stage,v_realm,v_item,v_level,
    least(72000,24000+1000*(v_tier-1)),6+least(94,(v_tier-1)/5),
    1+least(4,(v_tier-1)/10))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_private.boss_recipe_unlocks(user_id,stage,recipe_id,battle_id)
  VALUES(p_battle.user_id,p_battle.stage,v_recipe,p_battle.id)
  ON CONFLICT (user_id,stage) DO NOTHING RETURNING battle_id INTO v_new_unlock;
  IF NOT p_historical THEN
    INSERT INTO app_private.boss_material_windows(user_id,half_hour_slot,battle_id)
      VALUES(p_battle.user_id,floor(extract(epoch FROM p_battle.ends_at)/1800)::bigint,
        p_battle.id)
      ON CONFLICT (user_id,half_hour_slot) DO NOTHING
      RETURNING battle_id INTO v_window;
    IF v_window IS NOT NULL THEN
      PERFORM app_private.credit_adventure_material(p_battle.user_id,'scrap',2,
        'boss_material_window',p_battle.id);
      PERFORM app_private.credit_adventure_material(p_battle.user_id,v_realm,1,
        'boss_material_window',p_battle.id);
    END IF;
  END IF;
  IF v_new_unlock IS NOT NULL OR v_window IS NOT NULL THEN
    INSERT INTO app_private.boss_recipe_battle_receipts
      (battle_id,user_id,stage,recipe_id,historical)
    VALUES(p_battle.id,p_battle.user_id,p_battle.stage,v_recipe,p_historical)
    ON CONFLICT (battle_id) DO NOTHING;
  END IF;
END;
$fn$;
REVOKE ALL ON FUNCTION app_private.register_boss_recipe(app_private.adventure_battles,boolean)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION app_private.on_boss_victory_recipe()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
  PERFORM app_private.register_boss_recipe(NEW,false);
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION app_private.on_boss_victory_recipe()
  FROM PUBLIC, anon, authenticated;
CREATE TRIGGER adventure_boss_recipe_victory
  AFTER UPDATE OF status ON app_private.adventure_battles
  FOR EACH ROW WHEN (OLD.status='fighting' AND NEW.status='won'
    AND NEW.kind='boss' AND NEW.boss_id IS NOT NULL)
  EXECUTE FUNCTION app_private.on_boss_victory_recipe();

-- Existing retained private battles are sufficient historical evidence. The
-- old client-writable boss_battles and legacy materials are never consulted.
SELECT app_private.register_boss_recipe(ab,true)
FROM app_private.adventure_battles ab
WHERE ab.status='won' AND ab.kind='boss' AND ab.boss_id IS NOT NULL
ORDER BY ab.user_id,ab.stage,ab.started_at,ab.id;

CREATE FUNCTION public.get_crafting_state()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_user uuid := auth.uid(); v_level integer; v_class text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE='28000'; END IF;
  SELECT level INTO v_level FROM public.profiles WHERE user_id=v_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND' USING ERRCODE='22023'; END IF;
  v_class := app_private.hero_class_key(v_user);
  RETURN jsonb_build_object('level',v_level,'hero_class',v_class,
    'craft_class',CASE WHEN v_class IN ('aprendiz','clerico') THEN 'novato' ELSE v_class END,
    'server_now',clock_timestamp(),
    'gold',COALESCE((SELECT gold FROM public.user_balance WHERE user_id=v_user),0),
    'next_boss_stage',COALESCE((SELECT ((stage+9)/10)*10
      FROM public.adventure_state WHERE user_id=v_user),10),
    'recipe_count',(SELECT count(*) FROM app_private.boss_recipe_unlocks WHERE user_id=v_user),
    'materials',COALESCE((SELECT jsonb_object_agg(material,quantity)
      FROM app_private.adventure_material_balances WHERE user_id=v_user),'{}'::jsonb),
    'recipes',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',r.id,'stage',r.stage,'realm',r.realm,'hero_class',r.hero_class,
      'level_required',r.level_required,'gold_cost',r.gold_cost,
      'scrap_cost',r.scrap_cost,'essence_cost',r.essence_cost,
      'item_id',i.id,'item_name',i.name,'item_icon',i.icon,
      'item_stats',i.stat_label,'rarity',i.rarity,
      'unlocked',true,'unlocked_at',r.unlocked_at)
      ORDER BY r.stage DESC) FROM (
        SELECT c.*,u.unlocked_at FROM app_private.boss_recipe_unlocks u
        JOIN app_private.boss_recipe_catalog c ON c.id=u.recipe_id
        WHERE u.user_id=v_user ORDER BY c.stage DESC LIMIT 30
      ) r JOIN public.game_items i ON i.id=r.item_id),'[]'::jsonb),
    'recent_receipts',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'battle_id',b.battle_id,'stage',b.stage,'historical',b.historical,
      'recorded_at',b.recorded_at) ORDER BY b.recorded_at DESC)
      FROM (SELECT battle_id,stage,historical,recorded_at
        FROM app_private.boss_recipe_battle_receipts WHERE user_id=v_user
        ORDER BY recorded_at DESC LIMIT 8) b),'[]'::jsonb),
    'duplicates',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'inventory_id',ui.id,'item_id',ui.item_id,'name',gi.name,
      'icon',gi.icon,'quantity',ui.quantity,'equipped',ui.equipped,
      'scrap_return',1) ORDER BY gi.name)
      FROM public.user_inventory ui JOIN public.game_items gi ON gi.id=ui.item_id
      WHERE ui.user_id=v_user AND ui.quantity>1 AND NOT ui.equipped
        AND NOT gi.is_starter AND NOT gi.is_consumable
        AND gi.category IN ('weapon','armor','accessory')),'[]'::jsonb));
END;
$fn$;
REVOKE ALL ON FUNCTION public.get_crafting_state() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_crafting_state() TO authenticated;

CREATE FUNCTION public.craft_boss_recipe(p_recipe_id uuid,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_user uuid := auth.uid(); v_level integer; v_class text;
        v_recipe app_private.boss_recipe_catalog%ROWTYPE;
        v_existing app_private.craft_requests%ROWTYPE; v_gold integer;
        v_scrap integer; v_essence integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE='28000'; END IF;
  IF p_recipe_id IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_CRAFT_REQUEST' USING ERRCODE='22023'; END IF;
  SELECT level INTO v_level FROM public.profiles WHERE user_id=v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_existing FROM app_private.craft_requests
    WHERE user_id=v_user AND request_id=p_request_id;
  IF FOUND THEN
    IF v_existing.recipe_id<>p_recipe_id THEN
      RAISE EXCEPTION 'CRAFT_REQUEST_CONFLICT' USING ERRCODE='22023'; END IF;
    RETURN jsonb_build_object('ok',true,'replayed',true,'item_id',v_existing.item_id,
      'gold_spent',v_existing.gold_spent);
  END IF;
  SELECT * INTO v_recipe FROM app_private.boss_recipe_catalog WHERE id=p_recipe_id;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM app_private.boss_recipe_unlocks
      WHERE user_id=v_user AND recipe_id=p_recipe_id) THEN
    RAISE EXCEPTION 'RECIPE_LOCKED' USING ERRCODE='22023'; END IF;
  v_class := app_private.hero_class_key(v_user);
  IF v_class IN ('aprendiz','clerico') THEN v_class := 'novato'; END IF;
  IF v_class IS DISTINCT FROM v_recipe.hero_class THEN
    RAISE EXCEPTION 'RECIPE_CLASS_REQUIRED' USING ERRCODE='22023'; END IF;
  IF v_level < v_recipe.level_required THEN
    RAISE EXCEPTION 'RECIPE_LEVEL_REQUIRED' USING ERRCODE='22023'; END IF;
  SELECT gold INTO v_gold FROM public.user_balance WHERE user_id=v_user FOR UPDATE;
  IF COALESCE(v_gold,0)<v_recipe.gold_cost THEN
    RAISE EXCEPTION 'INSUFFICIENT_GOLD' USING ERRCODE='22023'; END IF;
  SELECT quantity INTO v_scrap FROM app_private.adventure_material_balances
    WHERE user_id=v_user AND material='scrap' FOR UPDATE;
  SELECT quantity INTO v_essence FROM app_private.adventure_material_balances
    WHERE user_id=v_user AND material=v_recipe.realm FOR UPDATE;
  IF COALESCE(v_scrap,0)<v_recipe.scrap_cost
     OR COALESCE(v_essence,0)<v_recipe.essence_cost THEN
    RAISE EXCEPTION 'INSUFFICIENT_MATERIALS' USING ERRCODE='22023'; END IF;
  UPDATE public.user_balance SET gold=gold-v_recipe.gold_cost,updated_at=clock_timestamp()
    WHERE user_id=v_user;
  UPDATE app_private.adventure_material_balances
    SET quantity=quantity-v_recipe.scrap_cost
    WHERE user_id=v_user AND material='scrap';
  UPDATE app_private.adventure_material_balances
    SET quantity=quantity-v_recipe.essence_cost
    WHERE user_id=v_user AND material=v_recipe.realm;
  INSERT INTO public.user_inventory(user_id,item_id,quantity,equipped)
    VALUES(v_user,v_recipe.item_id,1,false)
    ON CONFLICT (user_id,item_id) DO UPDATE
      SET quantity=public.user_inventory.quantity+1;
  INSERT INTO app_private.craft_requests(user_id,request_id,recipe_id,item_id,gold_spent)
    VALUES(v_user,p_request_id,p_recipe_id,v_recipe.item_id,v_recipe.gold_cost);
  INSERT INTO public.gold_history(user_id,type,amount,reason)
    VALUES(v_user,'craft',-v_recipe.gold_cost,'Oficina: receita da etapa '||v_recipe.stage);
  RETURN jsonb_build_object('ok',true,'replayed',false,'item_id',v_recipe.item_id,
    'gold_spent',v_recipe.gold_cost,'gold',v_gold-v_recipe.gold_cost);
END;
$fn$;
REVOKE ALL ON FUNCTION public.craft_boss_recipe(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.craft_boss_recipe(uuid,uuid) TO authenticated;

CREATE FUNCTION public.salvage_inventory_duplicate(
  p_inventory_id uuid,p_quantity integer,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_user uuid := auth.uid(); v_existing app_private.salvage_requests%ROWTYPE;
        v_inventory public.user_inventory%ROWTYPE; v_item public.game_items%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE='28000'; END IF;
  IF p_inventory_id IS NULL OR p_request_id IS NULL OR p_quantity NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'INVALID_SALVAGE_REQUEST' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.profiles WHERE user_id=v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_existing FROM app_private.salvage_requests
    WHERE user_id=v_user AND request_id=p_request_id;
  IF FOUND THEN
    IF v_existing.inventory_id<>p_inventory_id OR v_existing.quantity<>p_quantity THEN
      RAISE EXCEPTION 'SALVAGE_REQUEST_CONFLICT' USING ERRCODE='22023'; END IF;
    RETURN jsonb_build_object('ok',true,'replayed',true,
      'scrap_return',v_existing.scrap_return);
  END IF;
  SELECT * INTO v_inventory FROM public.user_inventory
    WHERE id=p_inventory_id AND user_id=v_user FOR UPDATE;
  IF NOT FOUND OR v_inventory.equipped OR v_inventory.quantity <= p_quantity THEN
    RAISE EXCEPTION 'SALVAGE_DUPLICATE_REQUIRED' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_item FROM public.game_items WHERE id=v_inventory.item_id;
  IF v_item.is_starter OR v_item.is_consumable
     OR v_item.category NOT IN ('weapon','armor','accessory') THEN
    RAISE EXCEPTION 'ITEM_NOT_SALVAGEABLE' USING ERRCODE='22023'; END IF;
  UPDATE public.user_inventory SET quantity=quantity-p_quantity WHERE id=p_inventory_id;
  INSERT INTO app_private.salvage_requests
    (user_id,request_id,inventory_id,item_id,quantity,scrap_return)
    VALUES(v_user,p_request_id,p_inventory_id,v_item.id,p_quantity,p_quantity);
  PERFORM app_private.credit_adventure_material(v_user,'scrap',p_quantity,
    'salvage',p_request_id);
  RETURN jsonb_build_object('ok',true,'replayed',false,'scrap_return',p_quantity);
END;
$fn$;
REVOKE ALL ON FUNCTION public.salvage_inventory_duplicate(uuid,integer,uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvage_inventory_duplicate(uuid,integer,uuid)
  TO authenticated;
COMMIT;
