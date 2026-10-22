-- Server-authoritative gold on every win and a small class/level shop.
-- Frozen Primary snapshot: live-source-snapshot.json, captured 2026-10-22.
BEGIN;
SET lock_timeout = '5s';
SET statement_timeout = '120s';
DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('app_private.sync_auto_adventure()', 'ef8da5af1aa65460a92f160df438462b', ARRAY['search_path=""']::text[]),
      ('public.purchase_game_item(uuid,uuid)', 'c87e285ceb35e67951a1a1b72f6d1a25', ARRAY['search_path=pg_catalog, public']::text[]),
      ('public.buy_pet(text)', '664ec81b0a86f65aad2cf7cc38db7b1b', ARRAY['search_path=""']::text[]),
      ('public.buy_shop_item(uuid,date)', 'cdb81d6e2dd7197db4e0c67d263a68b5', ARRAY['search_path=public']::text[])
      ,('app_private.advance_auto_adventure(uuid)', 'a6f6dd7ab3b787084d47ed47dab100cd', ARRAY['search_path=""']::text[])
    ) expected(signature,body_md5,config)
    LEFT JOIN pg_proc p ON p.oid=to_regprocedure(expected.signature)
    WHERE p.oid IS NULL OR md5(pg_get_functiondef(p.oid))<>expected.body_md5
       OR p.proowner<>'postgres'::regrole OR NOT p.prosecdef
       OR p.proconfig IS DISTINCT FROM expected.config
       OR has_function_privilege('anon',p.oid,'EXECUTE')
       OR NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
  ) OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname IN ('public','app_private')
           AND p.proname IN ('sync_auto_adventure','advance_auto_adventure','purchase_game_item','buy_pet','buy_shop_item'))<>7
  THEN RAISE EXCEPTION 'ECONOMY_SOURCE_OR_METADATA_DRIFT' USING ERRCODE='22023'; END IF;
  IF to_regprocedure('app_private.hero_class_key(uuid)') IS NULL
     OR to_regclass('app_private.adventure_battles') IS NULL
     OR to_regclass('public.game_items') IS NULL
     OR to_regclass('public.pet_catalog') IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.bosses WHERE is_world_event=false)
     OR EXISTS (SELECT 1 FROM pg_class c WHERE c.oid IN (
       'app_private.adventure_battles'::regclass,'public.user_balance'::regclass,
       'public.game_items'::regclass,'public.pet_catalog'::regclass)
       AND c.relowner<>'postgres'::regrole)
     OR has_table_privilege('authenticated','app_private.adventure_battles','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
     OR has_table_privilege('authenticated','public.user_balance','INSERT,UPDATE,DELETE,TRUNCATE')
     OR has_table_privilege('authenticated','public.gold_history','INSERT,UPDATE,DELETE,TRUNCATE')
  THEN RAISE EXCEPTION 'ECONOMY_SCHEMA_OR_ACL_DRIFT' USING ERRCODE='22023'; END IF;
  IF (SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c
      WHERE c.conrelid='app_private.adventure_battles'::regclass
        AND c.conname='adventure_battles_gold_awarded_check')
     IS DISTINCT FROM 'CHECK (((gold_awarded >= 0) AND (gold_awarded <= 12)))'
     OR (SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c
         WHERE c.conrelid='public.adventure_state'::regclass
           AND c.conname='adventure_state_gold_today_check')
        IS DISTINCT FROM 'CHECK (((gold_today >= 0) AND (gold_today <= 120)))'
  THEN RAISE EXCEPTION 'ECONOMY_GOLD_CONSTRAINT_DRIFT' USING ERRCODE='22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_balance WHERE gold<0 OR gold>56512727)
  THEN RAISE EXCEPTION 'ECONOMY_TRANSITION_BALANCE_OVERFLOW' USING ERRCODE='22003'; END IF;
  IF EXISTS (SELECT 1 FROM public.shop_items
             WHERE cost_percent<0 OR cost_percent>56512727)
  THEN RAISE EXCEPTION 'ECONOMY_TIME_SHOP_PRICE_OVERFLOW' USING ERRCODE='22003'; END IF;
END;
$preflight$;

-- Recipes must still match the source calibrated below before any economy write.
DO $guard$
BEGIN
  IF to_regclass('app_private.boss_recipe_catalog') IS NULL
     OR EXISTS (SELECT 1 FROM pg_class c
       WHERE c.oid='app_private.boss_recipe_catalog'::regclass
         AND (c.relowner<>'postgres'::regrole OR NOT c.relrowsecurity
           OR has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE')))
     OR NOT EXISTS (SELECT 1 FROM pg_proc p
       WHERE p.oid=to_regprocedure('app_private.register_boss_recipe(app_private.adventure_battles,boolean)')
         AND md5(pg_get_functiondef(p.oid))='c700ca0445ea165be93cf197bc4d85f4'
         AND p.proowner='postgres'::regrole AND p.prosecdef
         AND p.proconfig=ARRAY['search_path=""']::text[]
         AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
         AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE'))
  THEN RAISE EXCEPTION 'ECONOMY_RECIPE_SOURCE_DRIFT' USING ERRCODE='22023'; END IF;
  IF EXISTS (SELECT 1 FROM app_private.boss_recipe_catalog r
      WHERE r.gold_cost IS DISTINCT FROM
        least(72000,24000+1000*((r.stage/10)-1)))
  THEN RAISE EXCEPTION 'ECONOMY_RECIPE_PRICE_DRIFT' USING ERRCODE='22023'; END IF;
END;
$guard$;

-- Keep one durable receipt per existing balance; rerunning cannot credit twice.
CREATE TABLE app_private.economy_balance_transition (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  old_gold integer NOT NULL CHECK (old_gold>=0),
  new_gold integer NOT NULL CHECK (new_gold>=old_gold),
  credited_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE app_private.economy_balance_transition ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.economy_balance_transition FROM PUBLIC,anon,authenticated;
LOCK TABLE public.user_balance IN SHARE ROW EXCLUSIVE MODE;
WITH inserted AS (
  INSERT INTO app_private.economy_balance_transition(user_id,old_gold,new_gold)
  -- x38 is ceil(1300/35), the largest old-to-new ratio in the basic kit.
  SELECT user_id,gold,(gold::bigint*38)::integer FROM public.user_balance
  ON CONFLICT(user_id) DO NOTHING RETURNING user_id,old_gold,new_gold
), credited AS (
  UPDATE public.user_balance b SET gold=i.new_gold,updated_at=clock_timestamp()
  FROM inserted i WHERE b.user_id=i.user_id AND b.gold=i.old_gold
  RETURNING b.user_id,i.old_gold,i.new_gold
)
INSERT INTO public.gold_history(user_id,type,amount,reason)
SELECT user_id,'economy_transition',new_gold-old_gold,
       'Crédito único de transição da economia de aventura'
FROM credited;

-- Time-shop costs retain the same purchasing power as legacy balances.
UPDATE public.shop_items SET cost_percent=(cost_percent::bigint*38)::integer
WHERE cost_percent>0;

ALTER TABLE app_private.adventure_battles
  DROP CONSTRAINT adventure_battles_gold_awarded_check;
ALTER TABLE app_private.adventure_battles
  ADD CONSTRAINT adventure_battles_gold_awarded_check
  CHECK (gold_awarded BETWEEN 0 AND 48);
ALTER TABLE public.adventure_state
  DROP CONSTRAINT adventure_state_gold_today_check;
ALTER TABLE public.adventure_state
  ADD CONSTRAINT adventure_state_gold_today_check CHECK (gold_today>=0);

-- Existing owned items and pets are untouched. Old unrelated catalog prices
-- remain recorded, but the purchase RPC now accepts only curated offers.
CREATE TABLE app_private.economy_shop_offers (
  role text NOT NULL CHECK (role IN ('all','physical','magic')),
  tier integer NOT NULL CHECK (tier IN (1,5,15,30)),
  slot text NOT NULL CHECK (slot IN ('weapon','armor','accessory','hp','mp')),
  item_id uuid NOT NULL REFERENCES public.game_items(id),
  PRIMARY KEY(role,tier,slot)
);
ALTER TABLE app_private.economy_shop_offers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.economy_shop_offers FROM PUBLIC,anon,authenticated;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.game_items,public.pet_catalog,
  public.shop_items FROM PUBLIC,anon,authenticated;
DO $acl$
DECLARE v_table text; v_column text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['game_items','pet_catalog','shop_items'] LOOP
    FOR v_column IN SELECT attname FROM pg_attribute
      WHERE attrelid=format('public.%I',v_table)::regclass
        AND attnum>0 AND NOT attisdropped LOOP
      EXECUTE format('REVOKE INSERT (%1$I),UPDATE (%1$I) ON public.%2$I FROM PUBLIC,anon,authenticated',
                     v_column,v_table);
    END LOOP;
  END LOOP;
END;
$acl$;

INSERT INTO public.game_items(id,name,description,icon,category,rarity,stat_label,atk_bonus,matk_bonus,def_bonus,hp_bonus,mp_bonus,shop_price,level_required,is_consumable) VALUES
  ('ec000000-0000-4000-8000-000000000001','Lâmina de Campanha','Equipamento de aventura acessível pela loja','⚔️','weapon','incomum','+9 ATK',9,0,0,0,0,2200,5,false),
  ('ec000000-0000-4000-8000-000000000002','Cajado de Fluxo','Equipamento de aventura acessível pela loja','🪄','weapon','incomum','+9 MATK, +6 MP',0,9,0,0,6,2200,5,false),
  ('ec000000-0000-4000-8000-000000000003','Cota de Campanha','Equipamento de aventura acessível pela loja','🛡️','armor','incomum','+8 DEF, +12 HP',0,0,8,12,0,2000,5,false),
  ('ec000000-0000-4000-8000-000000000004','Manto de Fluxo','Equipamento de aventura acessível pela loja','🧥','armor','incomum','+5 DEF, +16 MP',0,0,5,0,16,2000,5,false),
  ('ec000000-0000-4000-8000-000000000005','Anel de Vigor','Equipamento de aventura acessível pela loja','💍','accessory','incomum','+3 ATK, +3 DEF',3,0,3,0,0,1600,5,false),
  ('ec000000-0000-4000-8000-000000000006','Foco Lapidado','Equipamento de aventura acessível pela loja','🔮','accessory','incomum','+3 MATK, +10 MP',0,3,0,0,10,1600,5,false),
  ('ec000000-0000-4000-8000-000000000007','Lâmina do Explorador','Equipamento de aventura acessível pela loja','⚔️','weapon','incomum','+18 ATK',18,0,0,0,0,3200,15,false),
  ('ec000000-0000-4000-8000-000000000008','Bastão do Explorador','Equipamento de aventura acessível pela loja','🪄','weapon','incomum','+18 MATK, +12 MP',0,18,0,0,12,3200,15,false),
  ('ec000000-0000-4000-8000-000000000009','Couraça do Explorador','Equipamento de aventura acessível pela loja','🛡️','armor','incomum','+14 DEF, +25 HP',0,0,14,25,0,3000,15,false),
  ('ec000000-0000-4000-8000-000000000010','Vestes do Explorador','Equipamento de aventura acessível pela loja','🧥','armor','incomum','+10 DEF, +35 MP',0,0,10,0,35,3000,15,false),
  ('ec000000-0000-4000-8000-000000000011','Selo de Vigor','Equipamento de aventura acessível pela loja','💍','accessory','incomum','+6 ATK, +5 DEF',6,0,5,0,0,2400,15,false),
  ('ec000000-0000-4000-8000-000000000012','Selo de Foco','Equipamento de aventura acessível pela loja','🔮','accessory','incomum','+6 MATK, +18 MP',0,6,0,0,18,2400,15,false),
  ('ec000000-0000-4000-8000-000000000013','Lâmina do Veterano','Equipamento de aventura acessível pela loja','⚔️','weapon','incomum','+32 ATK',32,0,0,0,0,4500,30,false),
  ('ec000000-0000-4000-8000-000000000014','Bastão do Veterano','Equipamento de aventura acessível pela loja','🪄','weapon','incomum','+32 MATK, +22 MP',0,32,0,0,22,4500,30,false),
  ('ec000000-0000-4000-8000-000000000015','Couraça do Veterano','Equipamento de aventura acessível pela loja','🛡️','armor','incomum','+24 DEF, +50 HP',0,0,24,50,0,4200,30,false),
  ('ec000000-0000-4000-8000-000000000016','Vestes do Veterano','Equipamento de aventura acessível pela loja','🧥','armor','incomum','+17 DEF, +70 MP',0,0,17,0,70,4200,30,false),
  ('ec000000-0000-4000-8000-000000000017','Selo do Veterano','Equipamento de aventura acessível pela loja','💍','accessory','incomum','+11 ATK, +8 DEF',11,0,8,0,0,3500,30,false),
  ('ec000000-0000-4000-8000-000000000018','Foco do Veterano','Equipamento de aventura acessível pela loja','🔮','accessory','incomum','+11 MATK, +35 MP',0,11,0,0,35,3500,30,false)
ON CONFLICT(id) DO NOTHING;

INSERT INTO app_private.economy_shop_offers(role,tier,slot,item_id) VALUES
  ('physical',1,'weapon','dc3bb3be-1d81-41ab-ab0e-32ddad07a9a1'),
  ('magic',1,'weapon','40c70192-e386-4478-acce-eba1caa9b237'),
  ('physical',1,'armor','72ce75f5-aa16-4480-96d4-e9caa1961c1e'),
  ('magic',1,'armor','66f40ee6-ef2e-4ca9-ae46-b5dbcda9565c'),
  ('physical',1,'accessory','f45bdbbd-eff1-42e1-8bb0-45a4714542b0'),
  ('magic',1,'accessory','cab90bce-5b79-408a-b2b5-ae86deb098a1'),
  ('all',1,'hp','36aa16a5-153d-4c08-941e-ae3ee51d54d4'),
  ('all',5,'hp','874346e5-c815-4de4-ae2d-099ce211f05e'),
  ('all',15,'hp','3d99dfbe-2735-4eff-9928-5efca01fc254'),
  ('all',1,'mp','ea63052e-8530-4c4e-98ed-9d62a9cbf781'),
  ('all',5,'mp','125cd22f-a693-4e93-ac8e-9092bc1b3792'),
  ('physical',5,'weapon','ec000000-0000-4000-8000-000000000001'),
  ('magic',5,'weapon','ec000000-0000-4000-8000-000000000002'),
  ('physical',5,'armor','ec000000-0000-4000-8000-000000000003'),
  ('magic',5,'armor','ec000000-0000-4000-8000-000000000004'),
  ('physical',5,'accessory','ec000000-0000-4000-8000-000000000005'),
  ('magic',5,'accessory','ec000000-0000-4000-8000-000000000006'),
  ('physical',15,'weapon','ec000000-0000-4000-8000-000000000007'),
  ('magic',15,'weapon','ec000000-0000-4000-8000-000000000008'),
  ('physical',15,'armor','ec000000-0000-4000-8000-000000000009'),
  ('magic',15,'armor','ec000000-0000-4000-8000-000000000010'),
  ('physical',15,'accessory','ec000000-0000-4000-8000-000000000011'),
  ('magic',15,'accessory','ec000000-0000-4000-8000-000000000012'),
  ('physical',30,'weapon','ec000000-0000-4000-8000-000000000013'),
  ('magic',30,'weapon','ec000000-0000-4000-8000-000000000014'),
  ('physical',30,'armor','ec000000-0000-4000-8000-000000000015'),
  ('magic',30,'armor','ec000000-0000-4000-8000-000000000016'),
  ('physical',30,'accessory','ec000000-0000-4000-8000-000000000017'),
  ('magic',30,'accessory','ec000000-0000-4000-8000-000000000018')
ON CONFLICT(role,tier,slot) DO NOTHING;

UPDATE public.game_items SET shop_price=CASE id
  WHEN 'dc3bb3be-1d81-41ab-ab0e-32ddad07a9a1' THEN 1300
  WHEN '40c70192-e386-4478-acce-eba1caa9b237' THEN 1300
  WHEN '72ce75f5-aa16-4480-96d4-e9caa1961c1e' THEN 1200
  WHEN '66f40ee6-ef2e-4ca9-ae46-b5dbcda9565c' THEN 1200
  WHEN 'f45bdbbd-eff1-42e1-8bb0-45a4714542b0' THEN 1000
  WHEN 'cab90bce-5b79-408a-b2b5-ae86deb098a1' THEN 1000
  WHEN '36aa16a5-153d-4c08-941e-ae3ee51d54d4' THEN 120
  WHEN '874346e5-c815-4de4-ae2d-099ce211f05e' THEN 220
  WHEN '3d99dfbe-2735-4eff-9928-5efca01fc254' THEN 400
  WHEN 'ea63052e-8530-4c4e-98ed-9d62a9cbf781' THEN 120
  WHEN '125cd22f-a693-4e93-ac8e-9092bc1b3792' THEN 220
END
WHERE id IN (
 'dc3bb3be-1d81-41ab-ab0e-32ddad07a9a1','40c70192-e386-4478-acce-eba1caa9b237',
 '72ce75f5-aa16-4480-96d4-e9caa1961c1e','66f40ee6-ef2e-4ca9-ae46-b5dbcda9565c',
 'f45bdbbd-eff1-42e1-8bb0-45a4714542b0','cab90bce-5b79-408a-b2b5-ae86deb098a1',
 '36aa16a5-153d-4c08-941e-ae3ee51d54d4','874346e5-c815-4de4-ae2d-099ce211f05e',
 '3d99dfbe-2735-4eff-9928-5efca01fc254','ea63052e-8530-4c4e-98ed-9d62a9cbf781',
 '125cd22f-a693-4e93-ac8e-9092bc1b3792');

UPDATE public.pet_catalog SET price=CASE pet_type
  WHEN 'mini_relampago' THEN 750000
  WHEN 'mini_leviata' THEN 700000
  WHEN 'mini_kraken' THEN 1800000
  WHEN 'mini_necromante' THEN 1200000
  WHEN 'mini_dragao_sombrio' THEN 1600000
  WHEN 'mini_wyrm_gelo' THEN 2400000
  WHEN 'mini_demonio_fome' THEN 3000000
END WHERE pet_type IN ('mini_relampago','mini_leviata','mini_kraken',
  'mini_necromante','mini_dragao_sombrio','mini_wyrm_gelo','mini_demonio_fome');

-- The first combat companion uses a pre-existing supported type and the
-- first ordinary boss. Existing mini boss requirements remain untouched.
INSERT INTO public.pet_catalog
  (pet_type,name,emoji,role,atk,def,hp,mp,price,sort,unlock_boss_id)
SELECT 'golem_guardian','Golem Guardião','🪨','support',10,15,112,5,
       600000,0,b.id
FROM public.bosses b WHERE b.is_world_event=false
ORDER BY b.level,b.id LIMIT 1
ON CONFLICT(pet_type) DO NOTHING;

-- Five current class/level offers and one preview weapon for the next tier.
CREATE FUNCTION public.get_economy_shop()
RETURNS SETOF public.game_items LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, app_private AS $$
  WITH context AS (
    SELECT p.level,CASE WHEN coalesce(nullif(app_private.hero_class_key(auth.uid()),'aprendiz'),
                                      p.starter_class) IN ('mago','novato','clerico')
                        THEN 'magic' ELSE 'physical' END AS role
    FROM public.profiles p WHERE p.user_id=auth.uid()
      AND app_private.hero_class_key(auth.uid()) IS NOT NULL
      AND app_private.hero_class_key(auth.uid()) IS NOT NULL
  ), selected AS (
    SELECT o.item_id,o.slot,o.tier FROM app_private.economy_shop_offers o
    CROSS JOIN context c
    WHERE o.role IN ('all',c.role) AND o.tier<=c.level
      AND o.tier=(SELECT max(o2.tier) FROM app_private.economy_shop_offers o2
                  WHERE o2.slot=o.slot AND o2.role=o.role AND o2.tier<=c.level)
    UNION ALL
    SELECT o.item_id,o.slot,o.tier FROM app_private.economy_shop_offers o
    CROSS JOIN context c
    WHERE o.role=c.role AND o.slot='weapon'
      AND o.tier=(SELECT min(o2.tier) FROM app_private.economy_shop_offers o2
                  WHERE o2.role=c.role AND o2.slot='weapon' AND o2.tier>c.level)
  )
  SELECT i.* FROM selected s JOIN public.game_items i ON i.id=s.item_id
  ORDER BY CASE s.slot WHEN 'weapon' THEN 1 WHEN 'armor' THEN 2
           WHEN 'accessory' THEN 3 WHEN 'hp' THEN 4 ELSE 5 END,s.tier;
$$;
REVOKE ALL ON FUNCTION public.get_economy_shop() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_economy_shop() TO authenticated;

CREATE INDEX IF NOT EXISTS gold_history_economy_7d_idx
  ON public.gold_history(user_id,created_at DESC) WHERE type='adventure';
CREATE FUNCTION public.get_adventure_income_7d()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
  SELECT jsonb_build_object(
    'gold',coalesce(sum(amount),0),
    'wins',count(*),
    'days',7,
    'daily_gold',round(coalesce(sum(amount),0)::numeric/7,2))
  FROM public.gold_history
  WHERE user_id=auth.uid() AND type='adventure'
    AND created_at>=now()-interval '7 days';
$$;
REVOKE ALL ON FUNCTION public.get_adventure_income_7d() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_adventure_income_7d() TO authenticated;

CREATE OR REPLACE FUNCTION app_private.sync_auto_adventure()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_budget_started timestamptz;
  v_response_now timestamptz;
  v_today date := timezone('America/Sao_Paulo',v_now)::date;
  v_state public.adventure_state%ROWTYPE;
  v_battle app_private.adventure_battles%ROWTYPE;
  v_last_battle app_private.adventure_battles%ROWTYPE;
  v_prior app_private.adventure_battles%ROWTYPE;
  v_start timestamptz;
  v_level integer;
  v_class text;
  v_hero_class text;
  v_class_id uuid;
  v_has_class boolean := false;
  v_class_node public.classes%ROWTYPE;
  v_seen uuid[] := ARRAY[]::uuid[];
  v_hops integer := 0;
  v_previous_column integer;
  v_attributes record;
  v_attribute_power integer;
  v_equipment record;
  v_hero integer;
  v_hero_attack integer;
  v_hero_defense integer;
  v_hero_max_mp integer;
  v_engine_version text;
  v_rules_snapshot jsonb;
  v_enemy_resistances jsonb := '{}'::jsonb;
  v_default_effect text := 'physical';
  v_enemy integer;
  v_hero_hp integer;
  v_enemy_hp integer;
  v_hero_max integer;
  v_enemy_max integer;
  v_damage integer;
  v_events jsonb := '[]'::jsonb;
  v_event_at timestamptz;
  v_end timestamptz;
  v_kind text;
  v_name text;
  v_icon text;
  v_boss_id uuid;
  v_boss_count integer;
  v_next_boss_stage integer;
  v_next_boss jsonb;
  v_encounters jsonb;
  v_result jsonb;
  v_gold integer := 0;
  v_item uuid;
  v_item_count integer;
  v_boss_wins_credited integer := 0;
  v_replay boolean;
  v_first_clear boolean;
  v_biome text;
  v_skill_id text;
  v_skill_name text;
  v_skill_power integer := 0;
  v_skill_effect text;
  v_skill_type text;
  v_skill_cost integer;
  v_skill_cooldown integer;
  v_skills jsonb := '[]'::jsonb;
  v_skill jsonb;
  v_skill_count integer;
  v_loadout jsonb;
  v_loadout_id text;
  v_summary_battles integer := 0;
  v_summary_from_stage integer;
  v_summary_to_stage integer;
  v_summary_wins integer := 0;
  v_summary_defeats integer := 0;
  v_summary_draws integer := 0;
  v_summary_retreats integer := 0;
  v_summary_gold integer := 0;
  v_summary_items jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
  -- Shared first lock for adventure, purchases, crafting and chests.
  PERFORM 1 FROM public.profiles WHERE user_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND' USING ERRCODE='22023'; END IF;
  -- Preserve the original serialization order: state, encounter, boss receipt,
  -- balance/history, inventory. Concurrent tabs can create or settle once.
  -- Victory triggers can credit materials/chests. Lock the balance before
  -- they run, after the profile and before adventure state.
  INSERT INTO public.user_balance(user_id,gold) VALUES(v_uid,100)
    ON CONFLICT(user_id) DO NOTHING;
  PERFORM 1 FROM public.user_balance WHERE user_id=v_uid FOR UPDATE;
  INSERT INTO public.adventure_state(user_id,last_tick_at)
  VALUES(v_uid,v_now) ON CONFLICT(user_id) DO NOTHING;
  SELECT * INTO STRICT v_state FROM public.adventure_state WHERE user_id=v_uid FOR UPDATE;
  SELECT count(*) INTO v_boss_count FROM public.bosses WHERE is_world_event=false;
  IF v_boss_count = 0 THEN RAISE EXCEPTION 'regular boss catalog is empty' USING ERRCODE='22023'; END IF;

  v_budget_started := clock_timestamp();
  -- Preserve every settlement and receipt; bound work by time as well as count.
  FOR batch IN 1..256 LOOP
  v_gold := 0;
  v_item := NULL;
  v_events := '[]'::jsonb;
  v_skill_id := NULL;
  v_skill_name := NULL;
  v_skill_power := 0;
  v_skill_effect := NULL;
  v_skills := '[]'::jsonb;
  v_boss_id := NULL;
  IF v_state.current_battle_id IS NOT NULL THEN
    SELECT * INTO STRICT v_battle FROM app_private.adventure_battles
      WHERE id=v_state.current_battle_id AND user_id=v_uid FOR UPDATE;
    IF v_battle.status='fighting' AND v_now >= v_battle.ends_at THEN
      -- This choice was fixed by the server power calculation when events were
      -- created. The client supplies neither outcome nor amount.
      IF (v_battle.events->-1->>'enemy_hp')::integer = 0 THEN
        v_battle.status := 'won';
        v_summary_wins := v_summary_wins+1;
      ELSIF v_battle.engine_version='v3'
        AND (v_battle.events->-1->>'hero_hp')::integer > 0 THEN
        v_battle.status := 'draw';
        v_summary_draws := v_summary_draws+1;
      ELSE
        v_battle.status := 'defeated';
        v_summary_defeats := v_summary_defeats+1;
        IF v_battle.stage>1 THEN
          v_summary_retreats := v_summary_retreats+1;
        END IF;
      END IF;
      UPDATE app_private.adventure_battles SET status=v_battle.status WHERE id=v_battle.id;
      v_summary_battles := v_summary_battles+1;
      v_summary_from_stage := coalesce(v_summary_from_stage,v_battle.stage);
      IF v_state.reward_day <> timezone('America/Sao_Paulo',v_battle.ends_at)::date THEN
        v_state.reward_day := timezone('America/Sao_Paulo',v_battle.ends_at)::date;
        v_state.gold_today := 0;
        v_state.loot_today := 0;
      END IF;
      v_first_clear := v_battle.status='won' AND NOT v_battle.replay;
      IF v_battle.status='won' THEN
        -- Every server-resolved win pays for its actual fight duration and stage.
        -- Sublinear duration rewards suitable fights without favoring unequipping.
        v_gold := greatest(1,least(48,floor(
          (12+least(v_battle.stage,50)::numeric/25
             + CASE WHEN v_battle.kind='boss' THEN 2 ELSE 0 END)
          * sqrt(greatest(extract(epoch FROM
              (v_battle.ends_at-v_battle.started_at)),0.1)/20)
          * least(1.1,greatest(0.1,
              v_battle.stage::numeric/greatest(v_battle.hero_level,1)))
        )::integer));
        -- The old 30-minute slot still gates direct item drops only.
        IF v_state.next_reward_at IS NULL OR v_battle.ends_at>=v_state.next_reward_at THEN
          v_state.reward_slot_count := v_state.reward_slot_count+1;
          IF v_state.loot_today < 2 AND
             (v_battle.kind='boss' OR v_state.reward_slot_count % 7 = 0) THEN
            SELECT count(*) INTO v_item_count FROM public.game_items i
             WHERE i.category IN ('weapon','armor','accessory') AND lower(i.rarity)='comum'
               AND NOT i.is_consumable AND i.effect IS NULL AND i.level_required <=
                   v_battle.hero_level;
            IF v_item_count > 0 THEN
              SELECT i.id INTO v_item FROM public.game_items i
               WHERE i.category IN ('weapon','armor','accessory') AND lower(i.rarity)='comum'
                 AND NOT i.is_consumable AND i.effect IS NULL AND i.level_required <=
                     v_battle.hero_level
               ORDER BY i.id OFFSET ((v_battle.stage / 7) % v_item_count) LIMIT 1;
            END IF;
          END IF;
          v_state.next_reward_at := v_battle.ends_at+interval '30 minutes';
        END IF;
        IF v_first_clear THEN
          INSERT INTO public.adventure_encounters
          (user_id,stage,attempt,fought_at,kind,won,hero_power,enemy_power,gold,item_id,boss_id)
          VALUES(v_uid,v_battle.stage,v_battle.attempt,v_battle.ends_at,v_battle.kind,
                 true,v_battle.hero_power,v_battle.enemy_power,
                 v_gold,v_item,v_battle.boss_id);
        END IF;
        IF v_first_clear AND v_battle.boss_id IS NOT NULL THEN
          v_boss_wins_credited := 1;
          INSERT INTO public.boss_battles(user_id,boss_id,damage_dealt,won)
          SELECT v_uid,v_battle.boss_id,v_battle.enemy_max_hp,true
          WHERE NOT EXISTS (SELECT 1 FROM public.boss_battles
            WHERE user_id=v_uid AND boss_id=v_battle.boss_id AND won);
        END IF;
        IF v_gold > 0 THEN
          INSERT INTO public.user_balance(user_id,gold) VALUES(v_uid,100)
            ON CONFLICT(user_id) DO NOTHING;
          INSERT INTO public.gold_history(user_id,type,amount,reason)
          VALUES(v_uid,'adventure',v_gold,'Aventura etapa ' || v_battle.stage);
          UPDATE public.user_balance SET gold=gold+v_gold,updated_at=v_now WHERE user_id=v_uid;
          v_state.gold_today := v_state.gold_today+v_gold;
          v_summary_gold := v_summary_gold+v_gold;
        END IF;
        IF v_item IS NOT NULL THEN
          INSERT INTO public.user_inventory(user_id,item_id,quantity,equipped)
          VALUES(v_uid,v_item,1,false)
          ON CONFLICT(user_id,item_id) DO UPDATE SET quantity=public.user_inventory.quantity+1;
          v_state.loot_today := v_state.loot_today+1;
          v_summary_items := v_summary_items || jsonb_build_array(v_item);
        END IF;
      END IF;
      UPDATE app_private.adventure_battles
         SET gold_awarded=v_gold,item_id=v_item WHERE id=v_battle.id;
      IF v_battle.status='won' AND
         (v_state.adventure_mode='progressing' OR v_state.advance_requested) THEN
        v_state.stage := least(100000,v_battle.stage+1);
        v_state.adventure_mode := 'progressing';
      ELSIF v_battle.status='defeated' THEN
        v_state.stage := greatest(1,v_battle.stage-1);
        v_state.adventure_mode := 'holding';
      END IF;
      v_summary_to_stage := v_state.stage;
      v_state.advance_requested := false;
      v_state.attempt := v_state.attempt+1;
      v_state.current_battle_id := NULL;
      v_state.last_tick_at := v_battle.ends_at + interval '1 second';
      v_result := jsonb_build_object('stage',v_battle.stage,'kind',v_battle.kind,
        'status',v_battle.status,
        'end_reason',CASE WHEN v_battle.status='draw' THEN 'turn_limit' ELSE NULL END,
        'won',v_battle.status='won','hero_power',v_battle.hero_power,
        'enemy_power',v_battle.enemy_power,'gold',v_gold,'item_id',v_item,
        'boss_id',v_battle.boss_id,
        'boss_name',CASE WHEN v_battle.kind='boss' THEN v_battle.enemy_name ELSE NULL END,
        'boss_icon',CASE WHEN v_battle.kind='boss' THEN v_battle.enemy_icon ELSE NULL END);
      v_state.last_result := v_result;
    END IF;
  END IF;

  -- Continue a bounded batch from the stored combat snapshot. The cursor
  -- remains behind the server clock when more offline battles are pending.
  IF v_state.current_battle_id IS NULL AND v_now >= v_state.last_tick_at THEN
    v_start := least(v_now,greatest(v_state.last_tick_at,v_now-interval '24 hours'));
    -- A settled row is already the exact preceding server snapshot. Reuse it
    -- instead of sorting every retained timeline again for each offline fight.
    IF v_battle.id IS NOT NULL THEN
      v_prior := v_battle;
    ELSE
      SELECT * INTO v_prior FROM app_private.adventure_battles
        WHERE user_id=v_uid ORDER BY started_at DESC,id DESC LIMIT 1;
    END IF;
    IF v_prior.id IS NOT NULL AND v_start < v_now-interval '30 seconds' THEN
      v_level := v_prior.hero_level;
      v_hero := v_prior.hero_power;
      v_hero_class := v_prior.hero_class;
      v_hero_max := v_prior.hero_max_hp;
      v_hero_attack := v_prior.hero_attack;
      v_hero_defense := v_prior.hero_defense;
      v_hero_max_mp := v_prior.hero_max_mp;
      v_engine_version := v_prior.engine_version;
      v_rules_snapshot := v_prior.rules_snapshot;
      v_default_effect := coalesce(v_rules_snapshot->>'default_effect','physical');
      v_skill_id := v_prior.skill_id;
      v_skill_name := v_prior.skill_name;
      v_skill_power := v_prior.skill_power;
      v_skill_effect := v_prior.skill_effect;
      v_skills := v_prior.skills;
    ELSE
      v_start := v_now;
    SELECT coalesce(p.level,1),p.current_class_id,
           lower(coalesce(nullif(btrim(p.starter_class),''),'novato')),
           p.combat_skill_loadout
      INTO v_level,v_class_id,v_class,v_loadout FROM public.profiles p WHERE p.user_id=v_uid;
    v_level := greatest(1,coalesce(v_level,1));
    v_class := coalesce(v_class,'novato');
    IF v_class NOT IN ('novato','aprendiz','guerreiro','mago','gatuno','arqueiro','ferreiro','clerico') THEN
      v_class := 'novato';
    END IF;
    v_has_class := v_class_id IS NOT NULL;
    IF v_class_id IS NOT NULL THEN
      LOOP
        v_hops := v_hops+1;
        IF v_hops > 16 OR v_class_id=ANY(v_seen) THEN
          RAISE EXCEPTION 'invalid current class ancestry' USING ERRCODE='22023';
        END IF;
        v_seen := array_append(v_seen,v_class_id);
        SELECT * INTO v_class_node FROM public.classes WHERE id=v_class_id;
        IF NOT FOUND OR v_class_node.column_index IS NULL OR
           (v_previous_column IS NOT NULL AND v_class_node.column_index<>v_previous_column-1) THEN
          RAISE EXCEPTION 'invalid current class ancestry' USING ERRCODE='22023';
        END IF;
        IF v_class_node.column_index=1 AND v_class_node.name='Aprendiz' THEN
          v_class := 'novato'; EXIT;
        ELSIF v_class_node.column_index=2 THEN
          v_class := CASE v_class_node.name
            WHEN 'Espadachim' THEN 'guerreiro' WHEN 'Mago' THEN 'mago'
            WHEN 'Gatuno' THEN 'gatuno' WHEN 'Noviço' THEN 'clerico'
            WHEN 'Arqueiro' THEN 'arqueiro' WHEN 'Ferreiro' THEN 'ferreiro' END;
          IF v_class IS NULL THEN RAISE EXCEPTION 'unknown current class base' USING ERRCODE='22023'; END IF;
          EXIT;
        ELSIF v_class_node.column_index<=1 OR v_class_node.parent_class_id IS NULL THEN
          RAISE EXCEPTION 'invalid current class ancestry' USING ERRCODE='22023';
        END IF;
        v_previous_column := v_class_node.column_index;
        v_class_id := v_class_node.parent_class_id;
      END LOOP;
    END IF;
    -- A later migration may install immutable class identity. Resolve it only
    -- after both private helpers exist; this migration remains deployable on
    -- the reviewed live schema and retains the strict legacy gate until then.
    IF to_regprocedure('app_private.hero_class_key(uuid)') IS NOT NULL
       AND to_regprocedure('app_private.has_hero_class(uuid)') IS NOT NULL THEN
      EXECUTE 'SELECT app_private.hero_class_key($1), app_private.has_hero_class($1)'
        INTO v_class,v_has_class USING v_uid;
      v_class := coalesce(v_class,'novato');
      IF v_class NOT IN ('novato','guerreiro','mago','gatuno','arqueiro','ferreiro','clerico')
        OR v_has_class IS NULL THEN
        RAISE EXCEPTION 'invalid canonical class identity' USING ERRCODE='22023';
      END IF;
    END IF;
    v_hero_class := v_class;
    SELECT coalesce(max(least(greatest(a.level,1),50)) FILTER (WHERE lower(a.name) IN ('força','forca')),1) AS strength,
           coalesce(max(least(greatest(a.level,1),50)) FILTER (WHERE lower(a.name) IN ('inteligência','inteligencia')),1) AS intelligence,
           coalesce(max(least(greatest(a.level,1),50)) FILTER (WHERE lower(a.name)='disciplina'),1) AS discipline,
           coalesce(max(least(greatest(a.level,1),50)) FILTER (WHERE lower(a.name)='sabedoria'),1) AS wisdom,
           coalesce(max(least(greatest(a.level,1),50)) FILTER (WHERE lower(a.name) IN ('resiliência','resiliencia')),1) AS resilience,
           coalesce(max(least(greatest(a.level,1),50)) FILTER (WHERE lower(a.name)='vitalidade'),1) AS vitality,
           coalesce(max(least(greatest(a.level,1),50)) FILTER (WHERE lower(a.name)='agilidade'),1) AS agility,
           coalesce(max(least(greatest(a.level,1),50)) FILTER (WHERE lower(a.name)='criatividade'),1) AS creativity
      INTO v_attributes FROM public.attributes a WHERE a.user_id=v_uid;
    v_attribute_power := least(180,
      CASE WHEN v_class IN ('mago','clerico') THEN
        4*(v_attributes.intelligence-1)+2*(v_attributes.wisdom-1)
      WHEN v_class IN ('guerreiro','ferreiro','arqueiro','gatuno') THEN
        6*(v_attributes.strength-1)+2*(v_attributes.discipline-1)
      ELSE greatest(6*(v_attributes.strength-1)+2*(v_attributes.discipline-1),
                    4*(v_attributes.intelligence-1)+2*(v_attributes.wisdom-1)) END
      +(5*(v_attributes.resilience-1)+3*(v_attributes.vitality-1))/2
      +(6*(v_attributes.agility-1)+2*(v_attributes.creativity-1))/3
      +(8*(v_attributes.strength-1)+14*(v_attributes.vitality-1))/10);
    SELECT coalesce(sum(greatest(0,i.atk_bonus)),0) AS attack,
           coalesce(sum(greatest(0,i.matk_bonus)),0) AS magic_attack,
           coalesce(sum(greatest(0,i.def_bonus)),0) AS defense,
           coalesce(sum(greatest(0,i.hp_bonus)),0) AS hp,
           coalesce(sum(greatest(0,i.mp_bonus)),0) AS mp
      INTO v_equipment FROM public.user_inventory ui JOIN public.game_items i ON i.id=ui.item_id
     WHERE ui.user_id=v_uid AND ui.equipped AND ui.quantity>0
       AND i.level_required<=v_level
       AND (NOT (i.requer_sintonizacao OR lower(i.rarity) IN ('epico','lendario')) OR ui.sintonizado);
    SELECT CASE lower(i.weapon_element)
      WHEN 'arcano' THEN 'arcane' WHEN 'fogo' THEN 'fire'
      WHEN 'gelo' THEN 'ice' WHEN 'raio' THEN 'lightning'
      WHEN 'natureza' THEN 'nature' WHEN 'sagrado' THEN 'light'
      ELSE 'physical' END INTO v_default_effect
      FROM public.user_inventory ui JOIN public.game_items i ON i.id=ui.item_id
     WHERE ui.user_id=v_uid AND ui.equipped AND ui.quantity>0 AND i.category='weapon'
       AND i.level_required<=v_level
       AND (NOT (i.requer_sintonizacao OR lower(i.rarity) IN ('epico','lendario')) OR ui.sintonizado)
     ORDER BY i.id LIMIT 1;
    v_default_effect := coalesce(v_default_effect,'physical');

    -- The profile loadout is client editable. Only its IDs select candidates;
    -- name, power and effect are read from the allocated node or equipped item.
    IF jsonb_typeof(v_loadout)='array' THEN
      FOR v_loadout_id IN SELECT value->>'id' FROM jsonb_array_elements(v_loadout)
                          WITH ORDINALITY AS selected(value,position)
                          WHERE jsonb_typeof(value)='object' ORDER BY position LOOP
        SELECT n.id,n.name,least(200,greatest(0,
          round(coalesce((n.effect->>'power')::numeric,30)
          *(1+(greatest(1,ps.rank)-1)*coalesce((n.effect->>'pct_per_rank')::numeric,10)/100))::integer)),
          CASE lower(coalesce(n.effect->>'element','neutro'))
            WHEN 'arcano' THEN 'arcane' WHEN 'fogo' THEN 'fire'
            WHEN 'gelo' THEN 'ice' WHEN 'raio' THEN 'lightning'
            WHEN 'natureza' THEN 'nature' WHEN 'sagrado' THEN 'light'
            ELSE 'physical' END,
          CASE coalesce(n.effect->>'effectType','dano')
            WHEN 'damage' THEN 'dano' ELSE coalesce(n.effect->>'effectType','dano') END,
          least(100,greatest(0,coalesce((n.effect->>'mpCost')::integer,0))),
          least(8,greatest(1,coalesce((n.effect->>'cooldown')::integer,1)))
          INTO v_skill_id,v_skill_name,v_skill_power,v_skill_effect,
               v_skill_type,v_skill_cost,v_skill_cooldown
          FROM public.player_skill_nodes ps JOIN public.skill_tree_nodes n ON n.id=ps.node_id
         WHERE ps.user_id=v_uid AND ps.rank>=1 AND n.id=v_loadout_id
           AND n.node_type='skill'
           AND app_private.adventure_skill_tree_allowed(n.tree,v_class,v_has_class)
           AND coalesce(n.effect->>'effectType','dano') IN ('dano','damage','heal','buff','debuff','cc')
           AND ((n.requires_weapon_element IS NULL AND n.requires_weapon_type IS NULL) OR EXISTS (
             SELECT 1 FROM public.user_inventory req_ui JOIN public.game_items req_i ON req_i.id=req_ui.item_id
             WHERE req_ui.user_id=v_uid AND req_ui.equipped AND req_ui.quantity>0 AND req_i.category='weapon'
               AND req_i.level_required<=v_level
               AND (n.requires_weapon_element IS NULL OR req_i.weapon_element=n.requires_weapon_element)
               AND (n.requires_weapon_type IS NULL OR req_i.weapon_type=n.requires_weapon_type)
               AND (NOT (req_i.requer_sintonizacao OR lower(req_i.rarity) IN ('epico','lendario')) OR req_ui.sintonizado)))
         LIMIT 1;
        IF NOT FOUND THEN
          SELECT 'weapon_' || i.id::text,coalesce(i.weapon_skill->>'name','Golpe de arma'),
                least(200,greatest(0,coalesce((i.weapon_skill->>'power')::numeric,0)::integer))
                ,CASE lower(coalesce(i.weapon_skill->>'element','neutro'))
                  WHEN 'arcano' THEN 'arcane' WHEN 'fogo' THEN 'fire'
                  WHEN 'gelo' THEN 'ice' WHEN 'raio' THEN 'lightning'
                  WHEN 'natureza' THEN 'nature' WHEN 'sagrado' THEN 'light'
                  ELSE 'physical' END,
                CASE coalesce(i.weapon_skill->>'effectType','dano')
                  WHEN 'damage' THEN 'dano' ELSE coalesce(i.weapon_skill->>'effectType','dano') END,
                least(100,greatest(0,coalesce((i.weapon_skill->>'mpCost')::integer,0))),
                least(8,greatest(1,coalesce((i.weapon_skill->>'cooldown')::integer,1)))
          INTO v_skill_id,v_skill_name,v_skill_power,v_skill_effect,
               v_skill_type,v_skill_cost,v_skill_cooldown
          FROM public.user_inventory ui JOIN public.game_items i ON i.id=ui.item_id
         WHERE ui.user_id=v_uid AND ui.equipped AND ui.quantity>0 AND i.category='weapon'
           AND i.level_required<=v_level AND i.weapon_skill IS NOT NULL
           AND (NOT (i.requer_sintonizacao OR lower(i.rarity) IN ('epico','lendario')) OR ui.sintonizado)
           AND 'weapon_' || i.id::text=v_loadout_id
           AND coalesce(i.weapon_skill->>'effectType','dano') IN ('dano','damage','heal','buff','debuff','cc')
         LIMIT 1;
        END IF;
        IF v_skill_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(v_skills) s WHERE s->>'id'=v_skill_id) THEN
          v_skills := v_skills || jsonb_build_array(jsonb_build_object(
            'id',v_skill_id,'name',v_skill_name,'power',v_skill_power,'effect',v_skill_effect,
            'type',v_skill_type,'mp_cost',v_skill_cost,'cooldown',v_skill_cooldown,
            'strike',v_skill_id IN ('a_vetor','gt_furtivo','ferreiro_t1_pancada_atordoante')));
        END IF;
      END LOOP;
    END IF;
    v_skill_count := jsonb_array_length(v_skills);
    IF v_skill_count > 0 THEN
      v_skill := v_skills->(v_state.skill_rotation % v_skill_count);
      v_skill_id := v_skill->>'id';
      v_skill_name := v_skill->>'name';
      v_skill_power := (v_skill->>'power')::integer;
      v_skill_effect := v_skill->>'effect';
    ELSE
      v_skill_id := NULL; v_skill_name := NULL; v_skill_power := 0;
      v_skill_effect := NULL;
    END IF;
    -- Mirrors computeSoloCombatStats: class-mapped offense, calibrated attr
    -- fractions, full valid gear bonuses, and the same HP/MP baselines.
    v_hero_attack := round(14+v_level*2+0.45*CASE
      WHEN v_class IN ('gatuno','arqueiro') THEN 6*v_attributes.agility+2*v_attributes.creativity
      WHEN v_class IN ('mago','clerico','novato') THEN 4*v_attributes.intelligence+2*v_attributes.wisdom
      ELSE 6*v_attributes.strength+2*v_attributes.discipline END)::integer
      +v_equipment.attack+floor(v_equipment.magic_attack/2);
    v_hero_defense := round(8+v_level*1.4+0.35*(5*v_attributes.resilience+3*v_attributes.vitality))::integer
      +v_equipment.defense;
    v_hero_max := round(100+v_level*12+0.8*(8*v_attributes.strength+14*v_attributes.vitality))::integer
      +v_equipment.hp;
    v_hero_max_mp := greatest(10,40+v_level*8+10*v_attributes.intelligence+6*v_attributes.wisdom+v_equipment.mp);
    v_hero := v_hero_attack+v_hero_defense/2+v_hero_max/10;
    v_engine_version := 'v3';
    v_rules_snapshot := jsonb_build_object('version','v3','hero_attack',v_hero_attack,
      'hero_defense',v_hero_defense,'hero_max_hp',v_hero_max,'hero_max_mp',v_hero_max_mp,
      'skills',v_skills,'default_effect',v_default_effect,'asa_fire_multiplier',0.5);
    END IF;
    IF v_skills <> '[]'::jsonb THEN
      v_skill := v_skills->(v_state.skill_rotation % jsonb_array_length(v_skills));
      v_skill_id := v_skill->>'id';
      v_skill_name := v_skill->>'name';
      v_skill_power := (v_skill->>'power')::integer;
      v_skill_effect := v_skill->>'effect';
    END IF;
    v_biome := (ARRAY['forest','desert','aquatic','ice','volcanic'])[
      ((v_state.stage-1)/10)%5+1];
    v_kind := CASE WHEN v_state.stage % 10=0 THEN 'boss' ELSE 'normal' END;
    IF v_kind='boss' THEN
      SELECT b.id,b.name,b.icon INTO STRICT v_boss_id,v_name,v_icon
        FROM public.bosses b WHERE b.is_world_event=false ORDER BY b.level,b.id
        OFFSET ((v_state.stage/10-1)%v_boss_count) LIMIT 1;
      v_enemy_resistances := '{}'::jsonb;
    ELSE
      SELECT c.name,c.icon,c.resistances INTO STRICT v_name,v_icon,v_enemy_resistances
        FROM app_private.adventure_enemy_catalog c
       WHERE c.biome=(ARRAY[0,4,1,5,3])[((v_state.stage-1)/10)%5+1] AND c.slot=(v_state.stage-1)%3;
      IF v_engine_version='v3' AND v_name='Asa de brasa' THEN
        v_enemy_resistances := jsonb_build_object('fire',
          coalesce((v_rules_snapshot->>'asa_fire_multiplier')::numeric,0.5));
      END IF;
    END IF;
    v_enemy := CASE WHEN v_kind='boss' THEN least(400,30+floor(1.5*v_state.stage)::integer)
                    ELSE least(380,20+floor(1.5*v_state.stage)::integer) END;
    v_enemy_max := CASE WHEN v_kind='boss' THEN 150 ELSE 100 END;
    v_hero_hp := v_hero_max;
    v_enemy_hp := v_enemy_max;
    IF v_engine_version='v3' THEN
      v_events := app_private.adventure_simulate_v3(v_start,v_hero_attack,v_hero_defense,
        v_hero_max,v_hero_max_mp,v_enemy,v_enemy_max,v_skills,v_enemy_resistances,
        v_default_effect,v_state.skill_rotation);
      v_end := (v_events->-1->>'at')::timestamptz;
    ELSE
    FOR i IN 1..10 LOOP
      v_event_at := v_start + i * interval '1.6 seconds';
      IF i % 2=1 THEN
        v_damage := ceil(v_enemy_max::numeric / CASE WHEN v_hero>=v_enemy THEN 5 ELSE 8 END)::integer;
        IF i=3 AND v_skill_id IS NOT NULL THEN
          v_damage := v_damage+least(20,v_skill_power/10);
        END IF;
        v_damage := least(v_enemy_hp,v_damage);
        v_enemy_hp := v_enemy_hp-v_damage;
      ELSE
        v_damage := ceil(v_hero_max::numeric / CASE WHEN v_hero>=v_enemy THEN 7 ELSE 5 END)::integer;
        v_damage := least(v_hero_hp,v_damage);
        v_hero_hp := v_hero_hp-v_damage;
      END IF;
      v_events := v_events || jsonb_build_array(jsonb_build_object(
        'at',v_event_at,'actor',CASE WHEN i%2=1 THEN 'hero' ELSE 'enemy' END,
        'kind',CASE WHEN i=3 AND v_skill_id IS NOT NULL THEN 'skill' ELSE 'attack' END,
        'damage',v_damage,'hero_hp',v_hero_hp,'enemy_hp',v_enemy_hp,
        'skill_id',CASE WHEN i=3 THEN v_skill_id ELSE NULL END,
        'skill_name',CASE WHEN i=3 THEN v_skill_name ELSE NULL END,
        'effect',CASE WHEN i=3 AND v_skill_id IS NOT NULL THEN v_skill_effect
                      WHEN i%2=1 AND v_hero_class IN ('mago','clerico') THEN 'arcane'
                      ELSE 'physical' END));
      v_end := v_event_at;
      EXIT WHEN v_hero_hp=0 OR v_enemy_hp=0;
    END LOOP;
    END IF;
    v_replay := EXISTS(SELECT 1 FROM public.adventure_encounters
      WHERE user_id=v_uid AND stage=v_state.stage AND won);
    INSERT INTO app_private.adventure_battles
      (user_id,stage,attempt,kind,status,replay,biome,started_at,ends_at,
        hero_power,hero_class,hero_level,enemy_power,hero_max_hp,enemy_max_hp,enemy_name,enemy_icon,
        boss_id,skill_id,skill_name,skill_power,skill_effect,skills,events,
        hero_attack,hero_defense,hero_max_mp,enemy_resistances,engine_version,rules_snapshot)
    VALUES(v_uid,v_state.stage,v_state.attempt,v_kind,'fighting',v_replay,v_biome,v_start,v_end,
            v_hero,v_hero_class,v_level,v_enemy,v_hero_max,v_enemy_max,v_name,v_icon,v_boss_id,
            v_skill_id,v_skill_name,v_skill_power,v_skill_effect,v_skills,v_events,
            v_hero_attack,v_hero_defense,v_hero_max_mp,
            CASE WHEN v_engine_version='v3' THEN v_enemy_resistances ELSE NULL END,
            v_engine_version,v_rules_snapshot) RETURNING * INTO v_battle;
    v_state.current_battle_id := v_battle.id;
    v_state.skill_rotation := v_state.skill_rotation+1;
  END IF;
  EXIT WHEN v_state.current_battle_id IS NULL OR v_battle.ends_at>v_now
    OR clock_timestamp() >= v_budget_started + interval '250 milliseconds';
  END LOOP;

  UPDATE public.adventure_state SET stage=v_state.stage,attempt=v_state.attempt,
    last_tick_at=v_state.last_tick_at,reward_day=v_state.reward_day,
    next_reward_at=v_state.next_reward_at,
    gold_today=v_state.gold_today,loot_today=v_state.loot_today,
    last_result=v_state.last_result,current_battle_id=v_state.current_battle_id,
    adventure_mode=v_state.adventure_mode,advance_requested=v_state.advance_requested,
    skill_rotation=v_state.skill_rotation,reward_slot_count=v_state.reward_slot_count,
    updated_at=v_now WHERE user_id=v_uid;
  -- Only rendering timelines are pruned; public first clears and financial
  -- history remain durable. IDs of pruned battles are never reusable.
  DELETE FROM app_private.adventure_battles old
   WHERE old.user_id=v_uid AND old.status<>'fighting'
     AND old.id NOT IN (SELECT kept.id FROM app_private.adventure_battles kept
       WHERE kept.user_id=v_uid ORDER BY kept.started_at DESC,kept.created_at DESC,kept.id DESC
       LIMIT 127);
  SELECT coalesce(jsonb_agg(e ORDER BY e.fought_at DESC,e.stage DESC,e.attempt DESC),'[]'::jsonb)
    INTO v_encounters FROM (
      SELECT ab.stage,ab.attempt,ab.ends_at AS fought_at,ab.kind,ab.status,
             CASE WHEN ab.status='draw' THEN 'turn_limit' ELSE NULL END AS end_reason,
             ab.status='won' AS won,
             ab.hero_power,ab.enemy_power,ab.gold_awarded AS gold,ab.item_id,ab.boss_id,
             b.name AS boss_name,b.icon AS boss_icon
      FROM app_private.adventure_battles ab LEFT JOIN public.bosses b ON b.id=ab.boss_id
      WHERE ab.user_id=v_uid AND ab.status<>'fighting'
      ORDER BY ab.ends_at DESC,ab.created_at DESC LIMIT 8
    ) e;
  SELECT * INTO v_last_battle FROM app_private.adventure_battles
   WHERE user_id=v_uid AND status<>'fighting'
   ORDER BY ends_at DESC,created_at DESC,id DESC LIMIT 1;
  v_next_boss_stage := ((v_state.stage+9)/10)*10;
  SELECT jsonb_build_object('stage',v_next_boss_stage,'id',b.id,'name',b.name,'icon',b.icon)
    INTO STRICT v_next_boss FROM public.bosses b WHERE b.is_world_event=false
    ORDER BY b.level,b.id OFFSET ((v_next_boss_stage/10-1)%v_boss_count) LIMIT 1;
  v_response_now := clock_timestamp();
  RETURN jsonb_build_object('stage',v_state.stage,'mode',v_state.adventure_mode,
    'advance_pending',v_state.advance_requested,
    'next_at',CASE WHEN v_battle.status='fighting' THEN greatest(v_response_now,v_battle.ends_at)
                   ELSE greatest(v_response_now,v_state.last_tick_at) END,
    'server_now',v_response_now,'last_result',v_state.last_result,'encounters',v_encounters,
    'boss',v_next_boss,'boss_wins_credited',v_boss_wins_credited,
    'gold_today',v_state.gold_today,'loot_today',v_state.loot_today,
    'reward_day',v_state.reward_day,
    'catchup',jsonb_build_object('battles',v_summary_battles,
       'from_stage',v_summary_from_stage,'to_stage',v_summary_to_stage,
       'wins',v_summary_wins,'defeats',v_summary_defeats,'draws',v_summary_draws,
       'retreats',v_summary_retreats,
       'gold',v_summary_gold,'items',v_summary_items,
       'defeated',v_summary_defeats>0,
       'pending',v_battle.status='fighting' AND v_battle.ends_at<=v_response_now),
    'battle',CASE WHEN v_battle.id IS NULL THEN NULL
                   ELSE app_private.adventure_battle_payload(v_battle,v_response_now) END,
    'last_battle',CASE WHEN v_last_battle.id IS NULL THEN NULL
                   ELSE app_private.adventure_battle_payload(v_last_battle,v_response_now) END,
    'limits',jsonb_build_object('interval_minutes',CASE
       WHEN v_battle.id IS NOT NULL AND v_battle.ends_at>v_battle.started_at
         THEN round(extract(epoch FROM v_battle.ends_at-v_battle.started_at)/60,4)
       WHEN v_last_battle.id IS NOT NULL AND v_last_battle.ends_at>v_last_battle.started_at
         THEN round(extract(epoch FROM v_last_battle.ends_at-v_last_battle.started_at)/60,4)
       ELSE 0.25 END,'reward_interval_minutes',30,'offline_hours',24,
       'gold_per_day',0,'items_per_day',2));
END;
$function$;

CREATE OR REPLACE FUNCTION app_private.advance_auto_adventure(p_battle_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_state public.adventure_state%ROWTYPE;
  v_battle app_private.adventure_battles%ROWTYPE;
  v_request_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
  IF p_battle_id IS NULL THEN RAISE EXCEPTION 'battle id required' USING ERRCODE='22023'; END IF;
  -- Match sync's profile, balance, state, battle lock order.
  PERFORM 1 FROM public.profiles WHERE user_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND' USING ERRCODE='22023'; END IF;
  INSERT INTO public.user_balance(user_id,gold) VALUES(v_uid,100)
    ON CONFLICT(user_id) DO NOTHING;
  PERFORM 1 FROM public.user_balance WHERE user_id=v_uid FOR UPDATE;
  SELECT * INTO STRICT v_state FROM public.adventure_state WHERE user_id=v_uid FOR UPDATE;
  IF v_state.current_battle_id IS DISTINCT FROM p_battle_id THEN
    RAISE EXCEPTION 'stale adventure battle' USING ERRCODE='22023';
  END IF;
  SELECT * INTO STRICT v_battle FROM app_private.adventure_battles
   WHERE id=p_battle_id AND user_id=v_uid FOR UPDATE;
  -- A bounded catch-up can leave an already ended battle marked fighting.
  -- Take the clock after both locks so a wait cannot authorize a past fight.
  v_request_at := clock_timestamp();
  IF v_battle.status<>'fighting' OR v_state.adventure_mode<>'holding' OR
     v_state.advance_requested OR v_battle.started_at > v_request_at OR
     v_battle.ends_at <= v_request_at THEN
    RAISE EXCEPTION 'adventure cannot advance now' USING ERRCODE='22023';
  END IF;
  UPDATE public.adventure_state SET
    advance_requested=true,updated_at=clock_timestamp() WHERE user_id=v_uid;
  RETURN app_private.sync_auto_adventure();
END;
$function$;

CREATE OR REPLACE FUNCTION public.purchase_game_item(p_item_id uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_item public.game_items%ROWTYPE;
  v_existing public.inventory_purchase_requests%ROWTYPE;
  v_gold integer;
  v_inserted uuid;
  v_level integer;
  v_class text;
  v_role text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF p_item_id IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'INVALID_PURCHASE'; END IF;
  -- Profile precedes receipt, catalog, balance and inventory locks.
  SELECT level INTO v_level FROM public.profiles WHERE user_id=v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
  v_class := app_private.hero_class_key(v_user);
  IF v_class IS NULL THEN RAISE EXCEPTION 'INVALID_CANONICAL_CLASS'; END IF;
  v_role := CASE WHEN coalesce(nullif(v_class,'aprendiz'),
                             (SELECT starter_class FROM public.profiles
                              WHERE user_id=v_user)) IN ('mago','novato','clerico')
                 THEN 'magic' ELSE 'physical' END;

  SELECT * INTO v_existing FROM public.inventory_purchase_requests
  WHERE user_id = v_user AND request_id = p_request_id;
  IF FOUND THEN
    IF v_existing.item_id <> p_item_id THEN RAISE EXCEPTION 'PURCHASE_REQUEST_CONFLICT'; END IF;
    RETURN jsonb_build_object('ok', true, 'replayed', true, 'price', v_existing.price);
  END IF;

  SELECT * INTO v_item FROM public.game_items WHERE id = p_item_id FOR SHARE;
  IF NOT FOUND OR v_item.shop_price IS NULL OR v_item.shop_price <= 0
     OR v_item.is_starter OR v_item.boss_drop_level IS NOT NULL
     OR v_item.category NOT IN ('weapon', 'armor', 'accessory', 'consumable')
     OR v_level < v_item.level_required
     OR NOT EXISTS (
       SELECT 1 FROM app_private.economy_shop_offers o
       WHERE o.item_id=v_item.id AND o.tier <= v_level
         AND o.role IN ('all',v_role)
         AND o.tier=(SELECT max(o2.tier) FROM app_private.economy_shop_offers o2
                     WHERE o2.slot=o.slot AND o2.role=o.role
                       AND o2.tier<=v_level)
     ) THEN
    RAISE EXCEPTION 'ITEM_NOT_FOR_SALE';
  END IF;

  INSERT INTO public.inventory_purchase_requests(user_id, request_id, item_id, price)
  VALUES (v_user, p_request_id, p_item_id, v_item.shop_price)
  ON CONFLICT (user_id, request_id) DO NOTHING RETURNING request_id INTO v_inserted;
  IF v_inserted IS NULL THEN
    SELECT * INTO v_existing FROM public.inventory_purchase_requests
    WHERE user_id = v_user AND request_id = p_request_id;
    IF v_existing.item_id <> p_item_id THEN RAISE EXCEPTION 'PURCHASE_REQUEST_CONFLICT'; END IF;
    RETURN jsonb_build_object('ok', true, 'replayed', true, 'price', v_existing.price);
  END IF;

  INSERT INTO public.user_balance(user_id, balance_percent, gold)
  VALUES (v_user, 100, 100) ON CONFLICT (user_id) DO NOTHING;
  SELECT gold INTO v_gold FROM public.user_balance WHERE user_id = v_user FOR UPDATE;
  IF v_gold IS NULL OR v_gold < v_item.shop_price THEN RAISE EXCEPTION 'INSUFFICIENT_GOLD'; END IF;

  IF NOT v_item.stackable AND EXISTS (
    SELECT 1 FROM public.user_inventory WHERE user_id = v_user AND item_id = p_item_id
  ) THEN RAISE EXCEPTION 'ITEM_ALREADY_OWNED'; END IF;

  UPDATE public.user_balance SET gold = gold - v_item.shop_price, updated_at = now()
  WHERE user_id = v_user;
  INSERT INTO public.user_inventory(user_id, item_id, quantity, equipped)
  VALUES (v_user, p_item_id, 1, false)
  ON CONFLICT (user_id, item_id) DO UPDATE
  SET quantity = public.user_inventory.quantity + 1
  WHERE v_item.stackable;
  IF NOT FOUND THEN RAISE EXCEPTION 'ITEM_ALREADY_OWNED'; END IF;

  INSERT INTO public.gold_history(user_id, type, amount, reason)
  VALUES (v_user, 'compra_equipamento', -v_item.shop_price, 'Comprou ' || v_item.name);
  RETURN jsonb_build_object('ok', true, 'replayed', false, 'price', v_item.shop_price,
                            'gold', v_gold - v_item.shop_price);
END;
$function$;

CREATE OR REPLACE FUNCTION public.buy_pet(p_pet_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_pet public.pet_catalog%ROWTYPE;
  v_gold integer;
  v_boss_name text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  PERFORM 1 FROM public.profiles WHERE user_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
  SELECT * INTO v_pet FROM public.pet_catalog WHERE pet_type=p_pet_type;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pet inválido.'; END IF;
  IF NOT app_private.has_boss_unlock(v_uid,v_pet.unlock_boss_id) THEN
    SELECT name INTO v_boss_name FROM public.bosses WHERE id=v_pet.unlock_boss_id;
    RAISE EXCEPTION 'Derrote % antes de chamar este companheiro.',
      coalesce(v_boss_name,'a criatura correspondente');
  END IF;
  -- The balance lock serializes two buys by the same owner.
  SELECT gold INTO v_gold FROM public.user_balance WHERE user_id=v_uid FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.companions
             WHERE user_id=v_uid AND companion_type=p_pet_type) THEN
    RAISE EXCEPTION 'Você já possui este pet.';
  END IF;
  IF coalesce(v_gold,0) < v_pet.price THEN
    RAISE EXCEPTION 'Ouro insuficiente — custa % de ouro.',v_pet.price;
  END IF;
  UPDATE public.user_balance SET gold=gold-v_pet.price,updated_at=now()
    WHERE user_id=v_uid;
  INSERT INTO public.gold_history(user_id,type,amount,reason)
    VALUES(v_uid,'compra_pet',-v_pet.price,'Compra de pet: ' || v_pet.name);
  INSERT INTO public.companions
    (user_id,companion_type,companion_role,origin,name,atk,def,max_hp,current_hp,max_mp,current_mp)
  VALUES(v_uid,p_pet_type,v_pet.role,'shop',v_pet.name,v_pet.atk,v_pet.def,
         v_pet.hp,v_pet.hp,v_pet.mp,v_pet.mp);
  RETURN jsonb_build_object('ok',true,'pet',v_pet.name,'gold_spent',v_pet.price);
END;
$function$;

CREATE OR REPLACE FUNCTION public.buy_shop_item(p_item_id uuid, p_today date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_server_date date := (now())::date;
  v_item public.shop_items%ROWTYPE;
  v_has_merchant boolean;
  v_cost int;
  v_gold int;
  v_expires timestamptz;
  v_week date;
  v_cur_week text;
  v_default_charges int;
  v_max_slots int;
  v_next_charges int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF p_today IS NULL OR p_today < v_server_date - 1 OR p_today > v_server_date + 1 THEN
    p_today := v_server_date;
  END IF;

  PERFORM 1 FROM public.profiles WHERE user_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
  SELECT * INTO v_item FROM public.shop_items WHERE id = p_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item não encontrado'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.talentos_jogador tj
    JOIN public.talentos_disponiveis td ON td.id = tj.talento_id
    WHERE tj.personagem_id = v_uid AND td.efeito = 'mestre_mercador'
  ) INTO v_has_merchant;

  v_cost := COALESCE(v_item.cost_percent, 0);
  IF v_has_merchant THEN v_cost := GREATEST(1, floor(v_cost * 0.9)::int); END IF;

  SELECT gold INTO v_gold FROM public.user_balance WHERE user_id = v_uid FOR UPDATE;
  IF v_gold IS NULL THEN v_gold := 0; END IF;
  IF v_gold < v_cost THEN
    RAISE EXCEPTION 'Saldo insuficiente! Ganhe ouro completando missões.';
  END IF;

  UPDATE public.user_balance SET gold = v_gold - v_cost, updated_at = now() WHERE user_id = v_uid;

  IF v_item.effect = 'streak_protector' THEN
    v_week := date_trunc('week', p_today)::date;  -- segunda-feira ISO
    SELECT streak_protector_week,
           CASE WHEN streak_protector_week = v_week::text THEN COALESCE(streak_protector_charges, 2) ELSE 2 END,
           LEAST(3, GREATEST(1, COALESCE(streak_protector_max, 3)))
      INTO v_cur_week, v_default_charges, v_max_slots
      FROM public.profiles WHERE user_id = v_uid;

    v_next_charges := LEAST(v_max_slots, v_default_charges + 1);

    UPDATE public.profiles
       SET streak_protector_charges = v_next_charges,
           streak_protector_max = v_max_slots,
           streak_protector_week = v_week::text
     WHERE user_id = v_uid;

    INSERT INTO public.activity_log (user_id, action, description, xp_gained)
    VALUES (v_uid, 'streak_protector_bought',
            'Protetor de Streak comprado. Cargas: ' || v_next_charges || '/' || v_max_slots, 0);
  ELSE
    v_expires := CASE v_item.duration
      WHEN '50m'   THEN now() + interval '50 minutes'
      WHEN '1h'    THEN now() + interval '1 hour'
      WHEN '1h30m' THEN now() + interval '90 minutes'
      WHEN '2h'    THEN now() + interval '2 hours'
      WHEN '3h'    THEN now() + interval '3 hours'
      WHEN '12h'   THEN now() + interval '12 hours'
      WHEN '24h'   THEN now() + interval '24 hours'
      ELSE NULL END;

    INSERT INTO public.user_buffs (user_id, item_id, expires_at) VALUES (v_uid, p_item_id, v_expires);
  END IF;

  INSERT INTO public.gold_history (user_id, type, amount, reason)
  VALUES (v_uid, 'compra_loja', -v_cost,
          CASE WHEN v_has_merchant THEN 'Comprou ' || v_item.name || ' com desconto de talento'
               ELSE 'Comprou ' || v_item.name END);

  RETURN jsonb_build_object('ok', true, 'cost', v_cost);
END;
$function$;

UPDATE app_private.boss_recipe_catalog r
SET gold_cost=least(200000,80000+3000*((r.stage/10)-1));
CREATE OR REPLACE FUNCTION app_private.register_boss_recipe(
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
    least(200000,80000+3000*(v_tier-1)),6+least(94,(v_tier-1)/5),
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
  FROM PUBLIC,anon,authenticated;
COMMIT;
