-- Permanent parallel chest openings, v2 random loot, and explicit Time Shop prices.
-- Existing v1 chests and claim receipts remain frozen and use their original payout.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $preflight$
DECLARE v_name text; v_hash text;
BEGIN
  IF to_regclass('app_private.adventure_chests') IS NULL
    OR to_regclass('app_private.adventure_chest_claim_receipts') IS NULL
    OR to_regclass('app_private.economy_shop_offers') IS NULL
    OR to_regclass('public.shop_items') IS NULL
    OR to_regclass('app_private.boss_recipe_catalog') IS NULL
    OR to_regprocedure('public.buy_shop_item(uuid,date)') IS NULL
    OR EXISTS (SELECT 1 FROM pg_class WHERE oid IN
      ('app_private.adventure_chests'::regclass,'app_private.adventure_chest_win_receipts'::regclass)
      AND (relowner <> 'postgres'::regrole OR NOT relrowsecurity))
    OR has_table_privilege('anon','app_private.adventure_chests','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege('authenticated','app_private.adventure_chests','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege('authenticated','public.shop_items','INSERT,UPDATE,DELETE')
    OR pg_has_role('anon','service_role','USAGE')
    OR pg_has_role('authenticated','service_role','USAGE')
    OR pg_has_role('authenticated','postgres','USAGE')
    OR EXISTS (SELECT 1 FROM pg_proc p
      WHERE p.pronamespace='public'::regnamespace
        AND p.proname IN ('buy_adventure_chest_opening',
          'get_adventure_chest_opening_receipt','grant_adventure_chest_cash_receipt'))
    OR EXISTS (SELECT 1 FROM pg_attribute a
      WHERE a.attrelid='app_private.adventure_chests'::regclass
        AND a.attnum>0 AND NOT a.attisdropped
        AND (has_column_privilege('anon',a.attrelid,a.attname,'INSERT,UPDATE')
          OR has_column_privilege('authenticated',a.attrelid,a.attname,'INSERT,UPDATE')))
    OR EXISTS (SELECT 1 FROM pg_proc p
      WHERE p.oid IN ('public.get_adventure_chests()'::regprocedure,
        'public.start_adventure_chest(uuid)'::regprocedure,
        'public.claim_adventure_chest(uuid)'::regprocedure)
        AND (p.proowner <> 'postgres'::regrole OR NOT p.prosecdef
          OR NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
          OR has_function_privilege('anon',p.oid,'EXECUTE')))
    OR EXISTS (SELECT 1 FROM pg_proc p
      WHERE p.pronamespace='public'::regnamespace
        AND p.proname IN ('get_adventure_chests','start_adventure_chest','claim_adventure_chest')
        AND p.oid NOT IN ('public.get_adventure_chests()'::regprocedure,
          'public.start_adventure_chest(uuid)'::regprocedure,
          'public.claim_adventure_chest(uuid)'::regprocedure))
    OR NOT EXISTS (SELECT 1 FROM pg_trigger t
      WHERE t.tgrelid='app_private.adventure_battles'::regclass
        AND t.tgname='adventure_00_chest_win' AND t.tgenabled='O'
        AND t.tgfoid='app_private.on_adventure_chest_win()'::regprocedure)
    OR NOT EXISTS (SELECT 1 FROM pg_indexes
      WHERE schemaname='app_private' AND indexname='adventure_chests_one_opening')
  THEN RAISE EXCEPTION 'CHEST_V2_SOURCE_OR_ACL_DRIFT' USING ERRCODE='22023'; END IF;
  FOR v_name,v_hash IN SELECT * FROM (VALUES
    ('app_private.adventure_chest_payload(app_private.adventure_chests)','319b5cc0c5cb62cee1a20683da28b6d0'),
    ('app_private.on_adventure_chest_win()','9fd8b3bf689b83cabe23410c3705f1f4'),
    ('app_private.adventure_chest_frozen_guard()','e3bb29dc51b56ef81d69e524d15f75a8'),
    ('public.start_adventure_chest(uuid)','26decb5cd7449a66caaca809fdfd5f4e'),
    ('public.get_adventure_chests()','df110f996331f05b1df040529fc5270c'),
    ('public.claim_adventure_chest(uuid)','fe19d72c8dd52edf8c1c92e21d6b7303')) x(name,hash)
  LOOP
    IF to_regprocedure(v_name) IS NULL OR
      (SELECT md5(pg_get_functiondef(to_regprocedure(v_name)))) <> v_hash THEN
      RAISE EXCEPTION 'CHEST_V2_SOURCE_HASH_DRIFT %',v_name USING ERRCODE='22023';
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p
    WHERE p.oid='public.buy_shop_item(uuid,date)'::regprocedure
      AND p.proowner='postgres'::regrole AND p.prosecdef
      AND position('v_cost := COALESCE(v_item.cost_percent, 0)' IN pg_get_functiondef(p.oid))>0
      AND position('UPDATE public.user_balance SET gold = v_gold - v_cost' IN pg_get_functiondef(p.oid))>0
      AND position('''compra_loja'', -v_cost' IN pg_get_functiondef(p.oid))>0)
  THEN RAISE EXCEPTION 'TIME_SHOP_DEBIT_SOURCE_DRIFT' USING ERRCODE='22023'; END IF;
END $preflight$;

CREATE TABLE app_private.adventure_chest_unlock_prices (
  target_cap smallint PRIMARY KEY CHECK (target_cap IN (2,3)),
  gold_price integer NOT NULL CHECK (gold_price BETWEEN 1 AND 100000000)
);
INSERT INTO app_private.adventure_chest_unlock_prices VALUES (2,6000),(3,18000);
CREATE TABLE app_private.adventure_chest_opening_entitlements (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  gold_cap smallint NOT NULL DEFAULT 1 CHECK (gold_cap BETWEEN 1 AND 3)
);
CREATE TABLE app_private.adventure_chest_opening_purchase_receipts (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  target_cap smallint NOT NULL CHECK (target_cap IN (2,3)),
  gold_spent integer NOT NULL CHECK (gold_spent>0),
  gold_after integer NOT NULL CHECK (gold_after>=0),
  purchased_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id,request_id), UNIQUE (user_id,target_cap)
);
-- Prepared only for a future verified one-time Paddle transaction webhook.
-- No grant/claim RPC exists; the fourth opening is intentionally unavailable.
CREATE TABLE app_private.adventure_chest_cash_receipts (
  provider text NOT NULL CHECK (provider='paddle'),
  environment text NOT NULL CHECK (environment='live'),
  transaction_id text NOT NULL,
  event_id text NOT NULL,
  price_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (provider,environment,transaction_id),
  UNIQUE (provider,environment,event_id),
  CHECK (length(transaction_id)>8 AND length(event_id)>8 AND length(price_id)>8)
);
CREATE INDEX adventure_chest_cash_receipts_user
  ON app_private.adventure_chest_cash_receipts(user_id);
CREATE TABLE app_private.adventure_chest_cash_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  provider text NOT NULL DEFAULT 'paddle' CHECK (provider='paddle'),
  environment text NOT NULL DEFAULT 'live' CHECK (environment='live'),
  price_id text,
  currency text NOT NULL DEFAULT 'BRL' CHECK (currency='BRL'),
  amount_minor integer NOT NULL DEFAULT 990 CHECK (amount_minor=990),
  enabled boolean NOT NULL DEFAULT false,
  CHECK (NOT enabled OR (price_id IS NOT NULL AND length(price_id)>8))
);
INSERT INTO app_private.adventure_chest_cash_config(singleton) VALUES(true);
CREATE TABLE app_private.adventure_chest_loot_v2_rules (
  rarity text PRIMARY KEY CHECK (rarity IN ('comum','raro','epico','lendario')),
  probability_bps integer NOT NULL CHECK (probability_bps BETWEEN 1 AND 10000),
  gold_min integer NOT NULL CHECK (gold_min>0),
  gold_max integer NOT NULL CHECK (gold_max>=gold_min),
  potions_min integer NOT NULL CHECK (potions_min>=0),
  potions_max integer NOT NULL CHECK (potions_max>=potions_min),
  scrap_amount integer NOT NULL CHECK (scrap_amount>0),
  essence_amount integer NOT NULL CHECK (essence_amount>=0),
  overflow_scrap_bonus integer NOT NULL CHECK (overflow_scrap_bonus>=0),
  equipment_chance_bps integer NOT NULL CHECK (equipment_chance_bps BETWEEN 0 AND 10000),
  open_hours integer NOT NULL CHECK (open_hours IN (1,4,8,12))
);
INSERT INTO app_private.adventure_chest_loot_v2_rules VALUES
 ('comum',7200,30,60,0,1,2,0,2,500,1),
 ('raro',2000,90,150,1,2,5,1,5,1500,4),
 ('epico',700,220,380,2,3,12,3,12,3500,8),
 ('lendario',100,600,1000,3,5,30,8,30,6000,12);
CREATE TABLE app_private.adventure_chest_equipment_rarity_rules (
  chest_rarity text NOT NULL REFERENCES app_private.adventure_chest_loot_v2_rules(rarity),
  gear_rarity text NOT NULL CHECK (gear_rarity IN ('incomum','raro','epico','lendario')),
  sort_order integer NOT NULL CHECK (sort_order BETWEEN 1 AND 4),
  weight_bps integer NOT NULL CHECK (weight_bps BETWEEN 1 AND 10000),
  PRIMARY KEY (chest_rarity,gear_rarity), UNIQUE (chest_rarity,sort_order)
);
INSERT INTO app_private.adventure_chest_equipment_rarity_rules VALUES
 ('comum','incomum',1,10000),
 ('raro','incomum',1,6000),('raro','raro',2,4000),
 ('epico','incomum',1,3000),('epico','raro',2,4000),('epico','epico',3,3000),
 ('lendario','incomum',1,2000),('lendario','raro',2,2500),
 ('lendario','epico',3,3500),('lendario','lendario',4,2000);
DO $weights$ BEGIN
  IF EXISTS (SELECT 1 FROM app_private.adventure_chest_equipment_rarity_rules
    GROUP BY chest_rarity HAVING sum(weight_bps)<>10000) THEN
    RAISE EXCEPTION 'CHEST_GEAR_WEIGHTS_INVALID' USING ERRCODE='22023'; END IF;
END $weights$;
CREATE TABLE app_private.adventure_chest_safe_gear (
  item_id uuid PRIMARY KEY REFERENCES public.game_items(id) ON DELETE RESTRICT
);
-- Non-boss lifestyle equipment from its explicit authored seed, with no
-- recipe, boss, or gated-item flags. Missing rows simply leave that pool empty.
INSERT INTO app_private.adventure_chest_safe_gear(item_id)
SELECT i.id FROM public.game_items i
WHERE i.name IN ('Teclado Mecanico do Foco','Pincel da Realidade',
  'Manto da Resiliencia','Avental Impenetravel','Halteres do Tita',
  'Grimorio do Codigo Limpo','Cadeira Ergonomica de Mithril',
  'Garrafa Termica Infinita','Tenis de Corrida Alado',
  'Caneta Tinteiro Perfurante','Anel do Acumulador',
  'Caderno de Esbocos Infinito')
  AND i.rarity IN ('raro','epico','lendario')
  AND i.category IN ('weapon','armor','accessory')
  AND i.boss_drop_level IS NULL AND i.effect IS NULL
  AND i.required_attribute IS NULL AND i.unlocks_node_id IS NULL
  AND NOT i.is_starter AND NOT i.is_consumable AND i.shop_price>0
  AND NOT EXISTS (SELECT 1 FROM app_private.boss_recipe_catalog r WHERE r.item_id=i.id);
DO $acl$ DECLARE v_table text; BEGIN
  FOREACH v_table IN ARRAY ARRAY['adventure_chest_unlock_prices',
    'adventure_chest_opening_entitlements','adventure_chest_opening_purchase_receipts',
    'adventure_chest_cash_receipts','adventure_chest_cash_config',
    'adventure_chest_loot_v2_rules',
    'adventure_chest_equipment_rarity_rules','adventure_chest_safe_gear'] LOOP
    EXECUTE format('ALTER TABLE app_private.%I ENABLE ROW LEVEL SECURITY',v_table);
    EXECUTE format('REVOKE ALL ON app_private.%I FROM PUBLIC,anon,authenticated',v_table);
  END LOOP;
END $acl$;

CREATE FUNCTION app_private.adventure_chest_gear_probabilities(p_rarity text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
  SELECT jsonb_build_object(
    'incomum',coalesce(max(weight_bps) FILTER (WHERE gear_rarity='incomum'),0),
    'raro',coalesce(max(weight_bps) FILTER (WHERE gear_rarity='raro'),0),
    'epico',coalesce(max(weight_bps) FILTER (WHERE gear_rarity='epico'),0),
    'lendario',coalesce(max(weight_bps) FILTER (WHERE gear_rarity='lendario'),0))
  FROM app_private.adventure_chest_equipment_rarity_rules
  WHERE chest_rarity=p_rarity;
$fn$;
REVOKE ALL ON FUNCTION app_private.adventure_chest_gear_probabilities(text)
  FROM PUBLIC,anon,authenticated;

ALTER TABLE app_private.adventure_chests ADD COLUMN loot_version smallint NOT NULL DEFAULT 1
  CHECK (loot_version IN (1,2));
ALTER TABLE app_private.adventure_chests ADD COLUMN loot_rules jsonb;
ALTER TABLE app_private.adventure_chests ADD CONSTRAINT adventure_chests_v2_materials_check
  CHECK (loot_version=1 OR loot_rules IS NOT NULL);
DROP INDEX app_private.adventure_chests_one_opening;
CREATE INDEX adventure_chests_openings_by_user ON app_private.adventure_chests(user_id)
  WHERE status='opening';

CREATE OR REPLACE FUNCTION app_private.adventure_chest_frozen_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
  IF (OLD.id,OLD.user_id,OLD.battle_id,OLD.rarity,OLD.hero_class,OLD.hero_level,
      OLD.gold_amount,OLD.scrap_amount,OLD.essence_material,OLD.essence_amount,
      OLD.potion_item_id,OLD.potion_amount,OLD.equipment_item_id,OLD.open_hours,
      OLD.acquired_at,OLD.loot_version,OLD.loot_rules)
     IS DISTINCT FROM
     (NEW.id,NEW.user_id,NEW.battle_id,NEW.rarity,NEW.hero_class,NEW.hero_level,
      NEW.gold_amount,NEW.scrap_amount,NEW.essence_material,NEW.essence_amount,
      NEW.potion_item_id,NEW.potion_amount,NEW.equipment_item_id,NEW.open_hours,
      NEW.acquired_at,NEW.loot_version,NEW.loot_rules)
    OR (OLD.status='opening' AND NEW.status<>'claimed')
    OR (OLD.status='claimed' AND NEW.status<>'claimed')
    OR (OLD.started_at IS NOT NULL AND OLD.started_at IS DISTINCT FROM NEW.started_at)
    OR (OLD.ready_at IS NOT NULL AND OLD.ready_at IS DISTINCT FROM NEW.ready_at)
    OR (OLD.claimed_at IS NOT NULL AND OLD.claimed_at IS DISTINCT FROM NEW.claimed_at) THEN
    RAISE EXCEPTION 'CHEST_FROZEN' USING ERRCODE='22023';
  END IF;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION app_private.adventure_chest_frozen_guard() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION app_private.adventure_chest_payload(p_chest app_private.adventure_chests)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
  SELECT jsonb_build_object('id',p_chest.id,'rarity',p_chest.rarity,
    'status',p_chest.status,'acquired_at',p_chest.acquired_at,
    'started_at',p_chest.started_at,'ready_at',p_chest.ready_at,
    'minimum',jsonb_build_object('gold',CASE WHEN p_chest.loot_version=2
      THEN (p_chest.loot_rules->>'gold_min')::integer ELSE p_chest.gold_amount END,
      'scrap',p_chest.scrap_amount,
      'essence_material',p_chest.essence_material,'essence',p_chest.essence_amount,
      'potions',CASE WHEN p_chest.loot_version=2
        THEN CASE WHEN p_chest.potion_item_id IS NULL THEN 0
          ELSE (p_chest.loot_rules->>'potions_min')::integer END
        ELSE p_chest.potion_amount END),
    'open_hours',p_chest.open_hours)
    || CASE WHEN p_chest.loot_version=2 THEN
      jsonb_build_object('loot_version',2,'loot_rules',p_chest.loot_rules,
        'range',p_chest.loot_rules)
      ELSE '{}'::jsonb END;
$fn$;
REVOKE ALL ON FUNCTION app_private.adventure_chest_payload(app_private.adventure_chests)
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.get_adventure_chest_opening_receipt(p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_user uuid := auth.uid(); v_receipt app_private.adventure_chest_opening_purchase_receipts%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE='28000'; END IF;
  SELECT * INTO v_receipt FROM app_private.adventure_chest_opening_purchase_receipts
    WHERE user_id=v_user AND request_id=p_request_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('found',false); END IF;
  RETURN jsonb_build_object('found',true,'ok',true,'replayed',true,
    'request_id',v_receipt.request_id,'target_cap',v_receipt.target_cap,
    'openings_cap',v_receipt.target_cap,'gold_spent',v_receipt.gold_spent,
    'gold',v_receipt.gold_after,'purchased_at',v_receipt.purchased_at);
END $fn$;
REVOKE ALL ON FUNCTION public.get_adventure_chest_opening_receipt(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_adventure_chest_opening_receipt(uuid) TO authenticated;

CREATE FUNCTION public.buy_adventure_chest_opening(p_target_cap integer,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_user uuid := auth.uid(); v_cap integer; v_price integer; v_gold integer;
  v_receipt app_private.adventure_chest_opening_purchase_receipts%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE='28000'; END IF;
  IF p_request_id IS NULL OR p_target_cap NOT IN (2,3) OR p_target_cap IS NULL THEN
    RAISE EXCEPTION 'CHEST_UNLOCK_INVALID' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.profiles WHERE user_id=v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_receipt FROM app_private.adventure_chest_opening_purchase_receipts
    WHERE user_id=v_user AND request_id=p_request_id;
  IF FOUND THEN
    IF v_receipt.target_cap<>p_target_cap THEN
      RAISE EXCEPTION 'CHEST_REQUEST_CONFLICT' USING ERRCODE='22023'; END IF;
    RETURN jsonb_build_object('ok',true,'replayed',true,'request_id',p_request_id,
      'target_cap',v_receipt.target_cap,'openings_cap',v_receipt.target_cap,
      'gold_spent',v_receipt.gold_spent,'gold',v_receipt.gold_after);
  END IF;
  INSERT INTO app_private.adventure_chest_opening_entitlements(user_id) VALUES(v_user)
    ON CONFLICT(user_id) DO NOTHING;
  SELECT gold_cap INTO v_cap FROM app_private.adventure_chest_opening_entitlements
    WHERE user_id=v_user FOR UPDATE;
  IF p_target_cap<>v_cap+1 THEN
    RAISE EXCEPTION 'CHEST_UNLOCK_ORDER' USING ERRCODE='22023'; END IF;
  SELECT gold_price INTO STRICT v_price FROM app_private.adventure_chest_unlock_prices
    WHERE target_cap=p_target_cap;
  SELECT gold INTO v_gold FROM public.user_balance WHERE user_id=v_user FOR UPDATE;
  IF coalesce(v_gold,0)<v_price THEN
    RAISE EXCEPTION 'INSUFFICIENT_GOLD' USING ERRCODE='22023'; END IF;
  UPDATE public.user_balance SET gold=gold-v_price,updated_at=clock_timestamp()
    WHERE user_id=v_user;
  UPDATE app_private.adventure_chest_opening_entitlements SET gold_cap=p_target_cap
    WHERE user_id=v_user;
  INSERT INTO app_private.adventure_chest_opening_purchase_receipts
    (user_id,request_id,target_cap,gold_spent,gold_after)
    VALUES(v_user,p_request_id,p_target_cap,v_price,v_gold-v_price);
  INSERT INTO public.gold_history(user_id,type,amount,reason)
    VALUES(v_user,'compra_bau_abertura',-v_price,
      'Desbloqueio permanente de '||p_target_cap||' aberturas simultâneas');
  RETURN jsonb_build_object('ok',true,'replayed',false,'request_id',p_request_id,
    'target_cap',p_target_cap,'openings_cap',p_target_cap,
    'gold_spent',v_price,'gold',v_gold-v_price);
END $fn$;
REVOKE ALL ON FUNCTION public.buy_adventure_chest_opening(integer,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.buy_adventure_chest_opening(integer,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.start_adventure_chest(p_chest_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_user uuid := auth.uid(); v_chest app_private.adventure_chests%ROWTYPE;
  v_now timestamptz; v_cap integer; v_active integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE='28000'; END IF;
  IF p_chest_id IS NULL THEN RAISE EXCEPTION 'CHEST_NOT_FOUND' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.profiles WHERE user_id=v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_chest FROM app_private.adventure_chests
    WHERE id=p_chest_id AND user_id=v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHEST_NOT_FOUND' USING ERRCODE='22023'; END IF;
  v_now := clock_timestamp();
  IF v_chest.status='opening' THEN
    RETURN jsonb_build_object('ok',true,'replayed',true,'server_now',v_now,
      'chest',app_private.adventure_chest_payload(v_chest)); END IF;
  IF v_chest.status<>'queued' THEN RAISE EXCEPTION 'CHEST_ALREADY_CLAIMED' USING ERRCODE='22023'; END IF;
  SELECT coalesce(gold_cap,1) INTO v_cap FROM app_private.adventure_chest_opening_entitlements
    WHERE user_id=v_user;
  IF v_cap IS NULL THEN v_cap:=1; END IF;
  IF v_cap=3 AND EXISTS (SELECT 1 FROM app_private.adventure_chest_cash_receipts
    WHERE user_id=v_user) THEN v_cap:=4; END IF;
  SELECT count(*) INTO v_active FROM app_private.adventure_chests
    WHERE user_id=v_user AND status='opening';
  IF v_active>=v_cap THEN RAISE EXCEPTION 'CHEST_OPENING_CAP' USING ERRCODE='22023'; END IF;
  UPDATE app_private.adventure_chests
    SET status='opening',started_at=v_now,ready_at=v_now+make_interval(hours=>v_chest.open_hours)
    WHERE id=p_chest_id RETURNING * INTO v_chest;
  RETURN jsonb_build_object('ok',true,'replayed',false,'server_now',v_now,
    'chest',app_private.adventure_chest_payload(v_chest));
END $fn$;
REVOKE ALL ON FUNCTION public.start_adventure_chest(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.start_adventure_chest(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_adventure_chests()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_user uuid := auth.uid(); v_now timestamptz := clock_timestamp(); v_cap integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE='28000'; END IF;
  SELECT coalesce(gold_cap,1) INTO v_cap FROM app_private.adventure_chest_opening_entitlements
    WHERE user_id=v_user;
  IF v_cap IS NULL THEN v_cap:=1; END IF;
  IF v_cap=3 AND EXISTS (SELECT 1 FROM app_private.adventure_chest_cash_receipts
    WHERE user_id=v_user) THEN v_cap:=4; END IF;
  RETURN jsonb_build_object('server_now',v_now,'slots_total',4,
    'occupied',(SELECT count(*) FROM app_private.adventure_chests
      WHERE user_id=v_user AND status<>'claimed'),
    'openings_cap',v_cap,
    'openings_active',(SELECT count(*) FROM app_private.adventure_chests
      WHERE user_id=v_user AND status='opening'),
    'unlocks',jsonb_build_object('second',v_cap>=2,'third',v_cap>=3,
      'fourth',EXISTS (SELECT 1 FROM app_private.adventure_chest_cash_receipts
        WHERE user_id=v_user),
      'fourth_available',(SELECT enabled FROM app_private.adventure_chest_cash_config
        WHERE singleton=true)),
    'price_cash',jsonb_build_object('currency','BRL','amount_minor',990),
    'prices_gold',(SELECT jsonb_object_agg(
      CASE target_cap WHEN 2 THEN 'second' ELSE 'third' END,gold_price)
      FROM app_private.adventure_chest_unlock_prices),
    'loot_table',(SELECT jsonb_object_agg(rarity,jsonb_build_object(
      'probability_bps',probability_bps,'gold_min',gold_min,'gold_max',gold_max,
      'potions_min',potions_min,'potions_max',potions_max,
      'scrap',scrap_amount,'essence',essence_amount,
      'equipment_chance_bps',equipment_chance_bps,'open_hours',open_hours,
      'equipment_rarity_bps',app_private.adventure_chest_gear_probabilities(
        adventure_chest_loot_v2_rules.rarity)))
      FROM app_private.adventure_chest_loot_v2_rules),
    'next_eligible_at',(SELECT next_eligible_at FROM app_private.adventure_chest_cadence
      WHERE user_id=v_user),
    'chests',coalesce((SELECT jsonb_agg(app_private.adventure_chest_payload(c)
      ORDER BY c.acquired_at,c.id) FROM app_private.adventure_chests c
      WHERE c.user_id=v_user AND c.status<>'claimed'),'[]'::jsonb),
    'overflow',jsonb_build_object(
      'count',(SELECT count(*) FROM app_private.adventure_chest_win_receipts
        WHERE user_id=v_user AND disposition='overflow'),
      'gold',(SELECT coalesce(sum(overflow_gold),0) FROM app_private.adventure_chest_win_receipts
        WHERE user_id=v_user AND disposition='overflow'),
      'scrap',(SELECT coalesce(sum(overflow_scrap),0) FROM app_private.adventure_chest_win_receipts
        WHERE user_id=v_user AND disposition='overflow')),
    'recent_overflow',coalesce((SELECT jsonb_agg(x ORDER BY x.ended_at DESC)
      FROM (SELECT battle_id,ended_at,rarity,overflow_gold AS gold,overflow_scrap AS scrap
        FROM app_private.adventure_chest_win_receipts
        WHERE user_id=v_user AND disposition='overflow'
        ORDER BY ended_at DESC LIMIT 5) x),'[]'::jsonb),
    'recent_claims',coalesce((SELECT jsonb_agg(x.payout ORDER BY x.claimed_at DESC)
      FROM (SELECT payout,claimed_at FROM app_private.adventure_chest_claim_receipts
        WHERE user_id=v_user ORDER BY claimed_at DESC LIMIT 5) x),'[]'::jsonb));
END $fn$;
REVOKE ALL ON FUNCTION public.get_adventure_chests() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_adventure_chests() TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_adventure_chest(p_chest_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_user uuid := auth.uid(); v_chest app_private.adventure_chests%ROWTYPE;
  v_now timestamptz; v_payout jsonb; v_item record;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE='28000'; END IF;
  IF p_chest_id IS NULL THEN RAISE EXCEPTION 'CHEST_NOT_FOUND' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.profiles WHERE user_id=v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_chest FROM app_private.adventure_chests
    WHERE id=p_chest_id AND user_id=v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHEST_NOT_FOUND' USING ERRCODE='22023'; END IF;
  IF v_chest.status='claimed' THEN
    SELECT payout INTO STRICT v_payout FROM app_private.adventure_chest_claim_receipts
      WHERE chest_id=p_chest_id AND user_id=v_user;
    RETURN jsonb_build_object('ok',true,'replayed',true,'receipt',v_payout); END IF;
  v_now := clock_timestamp();
  IF v_chest.status<>'opening' THEN RAISE EXCEPTION 'CHEST_NOT_OPENING' USING ERRCODE='22023'; END IF;
  IF v_now<v_chest.ready_at THEN RAISE EXCEPTION 'CHEST_NOT_READY' USING ERRCODE='22023'; END IF;
  INSERT INTO public.user_balance(user_id,gold) VALUES(v_user,100)
    ON CONFLICT(user_id) DO NOTHING;
  UPDATE public.user_balance SET gold=gold+v_chest.gold_amount,updated_at=v_now
    WHERE user_id=v_user;
  INSERT INTO public.gold_history(user_id,type,amount,reason)
    VALUES(v_user,'adventure_chest',v_chest.gold_amount,'Resgate de baú '||v_chest.rarity);
  PERFORM app_private.credit_adventure_material(v_user,'scrap',v_chest.scrap_amount,
    'chest_claim',v_chest.id);
  IF v_chest.essence_amount>0 THEN
    PERFORM app_private.credit_adventure_material(v_user,v_chest.essence_material,
      v_chest.essence_amount,'chest_claim',v_chest.id);
  END IF;
  IF v_chest.potion_item_id IS NOT NULL AND v_chest.potion_amount>0 THEN
    INSERT INTO public.user_inventory(user_id,item_id,quantity,equipped)
      VALUES(v_user,v_chest.potion_item_id,v_chest.potion_amount,false)
      ON CONFLICT(user_id,item_id) DO UPDATE
        SET quantity=public.user_inventory.quantity+EXCLUDED.quantity;
  END IF;
  IF v_chest.equipment_item_id IS NOT NULL THEN
    INSERT INTO public.user_inventory(user_id,item_id,quantity,equipped)
      VALUES(v_user,v_chest.equipment_item_id,1,false)
      ON CONFLICT(user_id,item_id) DO UPDATE
        SET quantity=public.user_inventory.quantity+1;
  END IF;
  SELECT id,name,icon,rarity,level_required INTO v_item FROM public.game_items
    WHERE id=v_chest.equipment_item_id;
  v_payout := jsonb_build_object('chest_id',v_chest.id,'rarity',v_chest.rarity,
    'claimed_at',v_now,
    'gold',v_chest.gold_amount,'scrap',v_chest.scrap_amount,
    'essence_material',v_chest.essence_material,'essence',v_chest.essence_amount,
    'potion_item_id',v_chest.potion_item_id,'potions',v_chest.potion_amount,
    'equipment',CASE WHEN v_chest.equipment_item_id IS NULL THEN NULL
      ELSE jsonb_build_object('id',v_item.id,'name',v_item.name,'icon',v_item.icon,
        'rarity',v_item.rarity,'level_required',v_item.level_required) END,'xp',0);
  IF v_chest.loot_version=2 THEN
    v_payout:=v_payout||jsonb_build_object('loot_version',2);
  END IF;
  INSERT INTO app_private.adventure_chest_claim_receipts(chest_id,user_id,payout,claimed_at)
    VALUES(v_chest.id,v_user,v_payout,v_now);
  UPDATE app_private.adventure_chests SET status='claimed',claimed_at=v_now
    WHERE id=v_chest.id;
  RETURN jsonb_build_object('ok',true,'replayed',false,'receipt',v_payout);
END $fn$;
REVOKE ALL ON FUNCTION public.claim_adventure_chest(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.claim_adventure_chest(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION app_private.on_adventure_chest_win()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_next timestamptz; v_roll integer; v_rarity text;
  v_rule app_private.adventure_chest_loot_v2_rules%ROWTYPE;
  v_gold integer; v_potions integer; v_potion uuid;
  v_equipment uuid; v_equipment_count integer; v_equipment_class text;
  v_gear_rarity text; v_gear_roll integer;
  v_chest uuid; v_occupied integer; v_loot jsonb; v_loot_rules jsonb;
  v_essence text; v_overflow_scrap integer;
BEGIN
  IF EXISTS (SELECT 1 FROM app_private.adventure_chest_win_receipts
    WHERE battle_id=NEW.id) THEN RETURN NEW; END IF;
  SELECT next_eligible_at INTO v_next FROM app_private.adventure_chest_cadence
    WHERE user_id=NEW.user_id;
  IF v_next IS NOT NULL AND NEW.ends_at<v_next THEN RETURN NEW; END IF;
  INSERT INTO app_private.adventure_chest_cadence(user_id,next_eligible_at)
    VALUES(NEW.user_id,NEW.ends_at+interval '30 minutes')
    ON CONFLICT(user_id) DO UPDATE SET next_eligible_at=EXCLUDED.next_eligible_at;
  v_roll:=app_private.adventure_chest_roll(NEW.id,'rarity');
  v_rarity:=CASE WHEN v_roll<7200 THEN 'comum' WHEN v_roll<9200 THEN 'raro'
    WHEN v_roll<9900 THEN 'epico' ELSE 'lendario' END;
  IF NEW.kind='boss' AND v_rarity='comum' THEN v_rarity:='raro'; END IF;
  SELECT * INTO STRICT v_rule FROM app_private.adventure_chest_loot_v2_rules
    WHERE rarity=v_rarity;
  v_loot_rules:=jsonb_build_object('gold_min',v_rule.gold_min,
    'gold_max',v_rule.gold_max,'potions_min',v_rule.potions_min,
    'potions_max',v_rule.potions_max,'scrap',v_rule.scrap_amount,
    'essence',v_rule.essence_amount,
    'equipment_chance_bps',v_rule.equipment_chance_bps,
    'equipment_rarity_bps',app_private.adventure_chest_gear_probabilities(v_rarity));
  v_gold:=v_rule.gold_min+app_private.adventure_chest_roll(NEW.id,'gold')
    %(v_rule.gold_max-v_rule.gold_min+1);
  v_potions:=v_rule.potions_min+app_private.adventure_chest_roll(NEW.id,'potions')
    %(v_rule.potions_max-v_rule.potions_min+1);
  v_essence:=CASE NEW.biome WHEN 'desert' THEN 'desert'
    WHEN 'aquatic' THEN 'water' WHEN 'ice' THEN 'ice'
    WHEN 'volcanic' THEN 'fire' ELSE 'normal' END;
  v_equipment_class:=NEW.hero_class;
  IF v_equipment_class='novato' THEN
    SELECT CASE WHEN lower(p.starter_class)='clerico' THEN 'clerico' ELSE 'novato' END
      INTO v_equipment_class FROM public.profiles p WHERE p.user_id=NEW.user_id;
  END IF;
  -- Curated shop offers are the only possible pool. Recheck every safety
  -- property at award time, so a later offer/catalog edit fails closed.
  SELECT i.id INTO v_potion FROM public.game_items i
    WHERE EXISTS (SELECT 1 FROM app_private.economy_shop_offers o
      WHERE o.item_id=i.id AND o.role='all' AND o.slot='hp')
      AND i.category='consumable' AND i.is_consumable AND i.stackable
      AND i.effect='heal_30' AND i.level_required<=NEW.hero_level
      AND i.boss_drop_level IS NULL
      AND NOT EXISTS (SELECT 1 FROM app_private.boss_recipe_catalog r
        WHERE r.item_id=i.id)
    ORDER BY i.id LIMIT 1;
  IF v_potion IS NULL THEN v_potions:=0; END IF;
  IF v_equipment_class IN ('guerreiro','mago','gatuno','arqueiro','ferreiro','clerico')
    AND app_private.adventure_chest_roll(NEW.id,'equipment')<v_rule.equipment_chance_bps THEN
    v_gear_roll:=app_private.adventure_chest_roll(NEW.id,'equipment_rarity');
    SELECT er.gear_rarity INTO STRICT v_gear_rarity FROM (
      SELECT gear_rarity,sum(weight_bps) OVER (ORDER BY sort_order) AS ceiling
      FROM app_private.adventure_chest_equipment_rarity_rules
      WHERE chest_rarity=v_rarity) er
      WHERE v_gear_roll<er.ceiling ORDER BY er.ceiling LIMIT 1;
    SELECT count(*) INTO v_equipment_count FROM public.game_items i
      WHERE (EXISTS (SELECT 1 FROM app_private.economy_shop_offers o
        WHERE o.item_id=i.id AND o.slot IN ('weapon','armor','accessory')
          AND o.role=(CASE WHEN v_equipment_class IN ('mago','clerico')
            THEN 'magic' ELSE 'physical' END))
        OR EXISTS (SELECT 1 FROM app_private.adventure_chest_safe_gear g
          WHERE g.item_id=i.id))
        AND i.rarity=v_gear_rarity
        AND i.category IN ('weapon','armor','accessory') AND NOT i.is_consumable
        AND i.effect IS NULL AND NOT i.is_starter AND i.boss_drop_level IS NULL
        AND i.required_attribute IS NULL AND i.unlocks_node_id IS NULL
        AND i.shop_price>0 AND i.level_required<=NEW.hero_level
        AND (i.starter_class IS NULL OR lower(i.starter_class)=v_equipment_class)
        AND NOT EXISTS (SELECT 1 FROM app_private.boss_recipe_catalog r
          WHERE r.item_id=i.id)
        AND (CASE WHEN v_equipment_class IN ('mago','clerico') THEN
          i.matk_bonus>0 OR (i.category<>'weapon' AND
            (i.def_bonus>0 OR i.hp_bonus>0 OR i.mp_bonus>0))
          ELSE i.atk_bonus>0 OR (i.category<>'weapon' AND
            (i.def_bonus>0 OR i.hp_bonus>0 OR i.agi_bonus>0)) END);
    IF v_equipment_count>0 THEN
      SELECT i.id INTO v_equipment FROM public.game_items i
        WHERE (EXISTS (SELECT 1 FROM app_private.economy_shop_offers o
          WHERE o.item_id=i.id AND o.slot IN ('weapon','armor','accessory')
            AND o.role=(CASE WHEN v_equipment_class IN ('mago','clerico')
              THEN 'magic' ELSE 'physical' END))
          OR EXISTS (SELECT 1 FROM app_private.adventure_chest_safe_gear g
            WHERE g.item_id=i.id))
          AND i.rarity=v_gear_rarity
          AND i.category IN ('weapon','armor','accessory') AND NOT i.is_consumable
          AND i.effect IS NULL AND NOT i.is_starter AND i.boss_drop_level IS NULL
          AND i.required_attribute IS NULL AND i.unlocks_node_id IS NULL
          AND i.shop_price>0 AND i.level_required<=NEW.hero_level
          AND (i.starter_class IS NULL OR lower(i.starter_class)=v_equipment_class)
          AND NOT EXISTS (SELECT 1 FROM app_private.boss_recipe_catalog r
            WHERE r.item_id=i.id)
          AND (CASE WHEN v_equipment_class IN ('mago','clerico') THEN
            i.matk_bonus>0 OR (i.category<>'weapon' AND
              (i.def_bonus>0 OR i.hp_bonus>0 OR i.mp_bonus>0))
            ELSE i.atk_bonus>0 OR (i.category<>'weapon' AND
              (i.def_bonus>0 OR i.hp_bonus>0 OR i.agi_bonus>0)) END)
        ORDER BY i.id
        OFFSET app_private.adventure_chest_roll(NEW.id,'item')%v_equipment_count
        LIMIT 1;
    END IF;
  END IF;
  v_loot:=jsonb_build_object('loot_version',2,'loot_rules',v_loot_rules,
    'gold',v_gold,'scrap',v_rule.scrap_amount,
    'essence_material',v_essence,'essence',v_rule.essence_amount,
    'potion_item_id',v_potion,'potions',v_potions,
    'equipment_item_id',v_equipment,'battle_hero_class',NEW.hero_class,
    'equipment_class',v_equipment_class,'hero_level',NEW.hero_level,'xp',0);
  SELECT count(*) INTO v_occupied FROM app_private.adventure_chests
    WHERE user_id=NEW.user_id AND status<>'claimed';
  IF v_occupied<4 THEN
    INSERT INTO app_private.adventure_chests
      (user_id,battle_id,rarity,hero_class,hero_level,gold_amount,scrap_amount,
       essence_material,essence_amount,potion_item_id,potion_amount,
       equipment_item_id,open_hours,acquired_at,loot_version,loot_rules)
    VALUES(NEW.user_id,NEW.id,v_rarity,v_equipment_class,NEW.hero_level,v_gold,
      v_rule.scrap_amount,v_essence,v_rule.essence_amount,v_potion,v_potions,
      v_equipment,v_rule.open_hours,NEW.ends_at,2,
      v_loot_rules)
    RETURNING id INTO v_chest;
    INSERT INTO app_private.adventure_chest_win_receipts
      (battle_id,user_id,ended_at,disposition,rarity,chest_id,frozen_loot)
    VALUES(NEW.id,NEW.user_id,NEW.ends_at,'queued',v_rarity,v_chest,v_loot);
  ELSE
    v_overflow_scrap:=v_rule.scrap_amount+v_rule.overflow_scrap_bonus+v_potions
      +CASE WHEN v_equipment IS NULL THEN 0 ELSE v_rule.overflow_scrap_bonus END;
    INSERT INTO public.user_balance(user_id,gold) VALUES(NEW.user_id,100)
      ON CONFLICT(user_id) DO NOTHING;
    UPDATE public.user_balance SET gold=gold+v_gold,updated_at=clock_timestamp()
      WHERE user_id=NEW.user_id;
    INSERT INTO public.gold_history(user_id,type,amount,reason)
      VALUES(NEW.user_id,'adventure_chest_overflow',v_gold,
        'Baú excedente da etapa '||NEW.stage);
    PERFORM app_private.credit_adventure_material(NEW.user_id,'scrap',
      v_overflow_scrap,'chest_overflow',NEW.id);
    IF v_rule.essence_amount>0 THEN
      PERFORM app_private.credit_adventure_material(NEW.user_id,v_essence,
        v_rule.essence_amount,'chest_overflow',NEW.id);
    END IF;
    INSERT INTO app_private.adventure_chest_win_receipts
      (battle_id,user_id,ended_at,disposition,rarity,frozen_loot,overflow_gold,overflow_scrap)
    VALUES(NEW.id,NEW.user_id,NEW.ends_at,'overflow',v_rarity,v_loot,v_gold,
      v_overflow_scrap);
  END IF;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION app_private.on_adventure_chest_win() FROM PUBLIC,anon,authenticated;

-- Called only after a backend has verified Paddle's one-time
-- transaction.completed event and its authenticated checkout user binding.
-- The price remains disabled until the real live price ID is configured.
CREATE FUNCTION public.grant_adventure_chest_cash_receipt(
  p_user_id uuid,p_transaction_id text,p_event_id text,p_price_id text,
  p_amount_minor integer,p_currency text,p_environment text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_config app_private.adventure_chest_cash_config%ROWTYPE;
  v_receipt app_private.adventure_chest_cash_receipts%ROWTYPE;
  v_gold_cap integer;
BEGIN
  IF p_user_id IS NULL OR p_transaction_id IS NULL OR p_event_id IS NULL
    OR p_price_id IS NULL OR p_amount_minor IS NULL OR p_currency IS NULL
    OR p_environment IS NULL OR p_amount_minor<>990 OR p_currency<>'BRL'
    OR p_environment<>'live' OR length(p_transaction_id)<9
    OR length(p_event_id)<9 OR length(p_price_id)<9 THEN
    RAISE EXCEPTION 'CHEST_CASH_RECEIPT_INVALID' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.profiles WHERE user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_receipt FROM app_private.adventure_chest_cash_receipts
    WHERE provider='paddle' AND environment=p_environment
      AND transaction_id=p_transaction_id;
  IF FOUND THEN
    IF v_receipt.user_id<>p_user_id OR v_receipt.event_id<>p_event_id
      OR v_receipt.price_id<>p_price_id THEN
      RAISE EXCEPTION 'CHEST_CASH_RECEIPT_CONFLICT' USING ERRCODE='22023'; END IF;
    SELECT coalesce(gold_cap,1) INTO v_gold_cap
      FROM app_private.adventure_chest_opening_entitlements WHERE user_id=p_user_id;
    RETURN jsonb_build_object('ok',true,'replayed',true,'cash_unlocked',true,
      'openings_cap',CASE WHEN coalesce(v_gold_cap,1)=3 THEN 4
        ELSE coalesce(v_gold_cap,1) END,'transaction_id',p_transaction_id);
  END IF;
  SELECT * INTO STRICT v_config FROM app_private.adventure_chest_cash_config
    WHERE singleton=true;
  IF NOT v_config.enabled OR v_config.price_id<>p_price_id
    OR v_config.amount_minor<>p_amount_minor
    OR v_config.currency<>p_currency
    OR v_config.environment<>p_environment THEN
    RAISE EXCEPTION 'CHEST_CASH_GATEWAY_UNAVAILABLE' USING ERRCODE='22023'; END IF;
  INSERT INTO app_private.adventure_chest_cash_receipts
    (provider,environment,transaction_id,event_id,price_id,user_id)
    VALUES('paddle',p_environment,p_transaction_id,p_event_id,p_price_id,p_user_id);
  SELECT coalesce(gold_cap,1) INTO v_gold_cap
    FROM app_private.adventure_chest_opening_entitlements WHERE user_id=p_user_id;
  RETURN jsonb_build_object('ok',true,'replayed',false,'cash_unlocked',true,
    'openings_cap',CASE WHEN coalesce(v_gold_cap,1)=3 THEN 4
      ELSE coalesce(v_gold_cap,1) END,'transaction_id',p_transaction_id);
END $fn$;
REVOKE ALL ON FUNCTION public.grant_adventure_chest_cash_receipt(
  uuid,text,text,text,integer,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.grant_adventure_chest_cash_receipt(
  uuid,text,text,text,integer,text,text) TO service_role;
DO $cash_acl$ BEGIN
  IF has_function_privilege('anon',
      'public.grant_adventure_chest_cash_receipt(uuid,text,text,text,integer,text,text)',
      'EXECUTE')
    OR has_function_privilege('authenticated',
      'public.grant_adventure_chest_cash_receipt(uuid,text,text,text,integer,text,text)',
      'EXECUTE')
    OR NOT has_function_privilege('service_role',
      'public.grant_adventure_chest_cash_receipt(uuid,text,text,text,integer,text,text)',
      'EXECUTE') THEN
    RAISE EXCEPTION 'CHEST_CASH_EFFECTIVE_ACL_DRIFT' USING ERRCODE='22023'; END IF;
END $cash_acl$;

-- Explicit, editable price tiers. buy_shop_item uses shop_items.cost_percent
-- as the actual debit source; this trigger keeps the catalog and tiers aligned.
CREATE TABLE app_private.time_shop_price_tiers (
  effect text PRIMARY KEY,
  gold_cost integer NOT NULL CHECK (gold_cost BETWEEN 1 AND 100000000)
);
INSERT INTO app_private.time_shop_price_tiers(effect,gold_cost) VALUES
 ('tv_session',1200),('gaming',1600),('extra_time',1800),
 ('free_meal',2200),('social',2500),('revive',3000),
 ('rest',3500),('shield',4000),('double_xp',4500),
 ('adrenalina',4500),('foco_profundo',5000),('attr_boost',5500),
 ('boss_buff',6000),('auto_complete',6500),('streak_protector',8000);
ALTER TABLE app_private.time_shop_price_tiers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.time_shop_price_tiers FROM PUBLIC,anon,authenticated;
DO $shop$ BEGIN
  IF EXISTS (SELECT 1 FROM app_private.time_shop_price_tiers t
    LEFT JOIN public.shop_items s ON s.effect=t.effect
    GROUP BY t.effect HAVING count(s.id)<>1) THEN
    RAISE EXCEPTION 'TIME_SHOP_CATALOG_DRIFT' USING ERRCODE='22023'; END IF;
  IF EXISTS (SELECT 1 FROM app_private.time_shop_price_tiers t
    JOIN public.shop_items s ON s.effect=t.effect
    WHERE s.cost_percent>=t.gold_cost) THEN
    RAISE EXCEPTION 'TIME_SHOP_PRICE_NOT_INCREASED' USING ERRCODE='22023'; END IF;
END $shop$;
UPDATE public.shop_items s SET cost_percent=t.gold_cost
FROM app_private.time_shop_price_tiers t WHERE s.effect=t.effect;
CREATE FUNCTION app_private.sync_time_shop_price_tier()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
  IF TG_OP='DELETE' OR (TG_OP='UPDATE' AND NEW.effect<>OLD.effect) THEN
    RAISE EXCEPTION 'TIME_SHOP_TIER_KEY_FROZEN' USING ERRCODE='22023'; END IF;
  UPDATE public.shop_items SET cost_percent=NEW.gold_cost WHERE effect=NEW.effect;
  IF NOT FOUND THEN RAISE EXCEPTION 'TIME_SHOP_CATALOG_DRIFT' USING ERRCODE='22023'; END IF;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION app_private.sync_time_shop_price_tier() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER time_shop_price_tier_sync
AFTER UPDATE OR DELETE ON app_private.time_shop_price_tiers
FOR EACH ROW EXECUTE FUNCTION app_private.sync_time_shop_price_tier();

-- Check effective privileges, including grants inherited from another role
-- or seeded by ALTER DEFAULT PRIVILEGES. RLS does not protect TRUNCATE.
DO $postflight$
DECLARE v_table text; v_relation regclass; v_function text; v_role text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'adventure_chest_unlock_prices',
    'adventure_chest_opening_entitlements',
    'adventure_chest_opening_purchase_receipts',
    'adventure_chest_cash_receipts',
    'adventure_chest_cash_config',
    'adventure_chest_loot_v2_rules',
    'adventure_chest_equipment_rarity_rules',
    'adventure_chest_safe_gear',
    'time_shop_price_tiers'] LOOP
    v_relation := to_regclass(format('app_private.%I',v_table));
    IF v_relation IS NULL OR NOT EXISTS (SELECT 1 FROM pg_class
      WHERE oid=v_relation AND relowner='postgres'::regrole AND relrowsecurity) THEN
      RAISE EXCEPTION 'CHEST_PRIVATE_RELATION_DRIFT %',v_table USING ERRCODE='22023'; END IF;
    FOREACH v_role IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF has_table_privilege(v_role,v_relation,
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
        OR EXISTS (SELECT 1 FROM pg_attribute a
          WHERE a.attrelid=v_relation AND a.attnum>0 AND NOT a.attisdropped
            AND has_column_privilege(v_role,v_relation,a.attname,
              'SELECT,INSERT,UPDATE,REFERENCES')) THEN
        RAISE EXCEPTION 'CHEST_PRIVATE_EFFECTIVE_ACL_DRIFT % %',v_table,v_role
          USING ERRCODE='22023'; END IF;
    END LOOP;
  END LOOP;
  FOREACH v_function IN ARRAY ARRAY[
    'app_private.adventure_chest_gear_probabilities(text)',
    'app_private.adventure_chest_frozen_guard()',
    'app_private.adventure_chest_payload(app_private.adventure_chests)',
    'app_private.on_adventure_chest_win()',
    'app_private.sync_time_shop_price_tier()'] LOOP
    IF to_regprocedure(v_function) IS NULL
      OR has_function_privilege('anon',v_function,'EXECUTE')
      OR has_function_privilege('authenticated',v_function,'EXECUTE') THEN
      RAISE EXCEPTION 'CHEST_PRIVATE_FUNCTION_ACL_DRIFT %',v_function
        USING ERRCODE='22023'; END IF;
  END LOOP;
  FOREACH v_function IN ARRAY ARRAY[
    'public.get_adventure_chest_opening_receipt(uuid)',
    'public.buy_adventure_chest_opening(integer,uuid)',
    'public.start_adventure_chest(uuid)',
    'public.get_adventure_chests()',
    'public.claim_adventure_chest(uuid)'] LOOP
    IF to_regprocedure(v_function) IS NULL
      OR has_function_privilege('anon',v_function,'EXECUTE')
      OR NOT has_function_privilege('authenticated',v_function,'EXECUTE') THEN
      RAISE EXCEPTION 'CHEST_PUBLIC_FUNCTION_ACL_DRIFT %',v_function
        USING ERRCODE='22023'; END IF;
  END LOOP;
  IF has_function_privilege('anon',
      'public.grant_adventure_chest_cash_receipt(uuid,text,text,text,integer,text,text)','EXECUTE')
    OR has_function_privilege('authenticated',
      'public.grant_adventure_chest_cash_receipt(uuid,text,text,text,integer,text,text)','EXECUTE')
    OR NOT has_function_privilege('service_role',
      'public.grant_adventure_chest_cash_receipt(uuid,text,text,text,integer,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'CHEST_CASH_EFFECTIVE_ACL_DRIFT' USING ERRCODE='22023'; END IF;
END $postflight$;

COMMIT;
