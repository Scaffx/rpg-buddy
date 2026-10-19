\set ON_ERROR_STOP on
-- Reduced PostgreSQL 17 fixture. This is not a replay of the live schema.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;

CREATE TABLE public.game_items (
  id uuid PRIMARY KEY, name text NOT NULL, category text NOT NULL, rarity text NOT NULL DEFAULT 'comum',
  shop_price integer, stackable boolean NOT NULL DEFAULT false, is_starter boolean NOT NULL DEFAULT false,
  boss_drop_level integer, is_consumable boolean NOT NULL DEFAULT false, level_required integer NOT NULL DEFAULT 1,
  starter_class text, atk_bonus integer NOT NULL DEFAULT 0,
  requer_sintonizacao boolean NOT NULL DEFAULT false, effect text
);
CREATE TABLE public.user_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, item_id uuid NOT NULL REFERENCES public.game_items(id),
  quantity integer NOT NULL DEFAULT 1, equipped boolean NOT NULL DEFAULT false,
  sintonizado boolean NOT NULL DEFAULT false, obtained_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,item_id)
);
CREATE TABLE public.user_balance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid UNIQUE NOT NULL,
  balance_percent integer NOT NULL DEFAULT 100, gold integer NOT NULL DEFAULT 100,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.gold_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, type text NOT NULL,
  amount integer NOT NULL, reason text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.classes(id uuid PRIMARY KEY, level_min integer NOT NULL);
CREATE TABLE public.profiles (
  user_id uuid PRIMARY KEY, level integer NOT NULL DEFAULT 1,
  starter_class text, starter_kit_claimed boolean NOT NULL DEFAULT false,
  class_kit_claimed boolean NOT NULL DEFAULT false, health_anchors_enabled boolean NOT NULL DEFAULT false,
  current_class_id uuid REFERENCES public.classes(id)
);
CREATE TABLE public.companions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, companion_type text NOT NULL,
  origin text NOT NULL, name text NOT NULL, affinity integer NOT NULL DEFAULT 0,
  last_forage_at date, last_affinity_date date, UNIQUE(user_id,origin)
);
CREATE TABLE public.talentos_disponiveis(id uuid PRIMARY KEY, efeito text);
CREATE TABLE public.talentos_jogador(personagem_id uuid, talento_id uuid);
CREATE TABLE public.meal_log(user_id uuid,meal_date date);
CREATE TABLE public.water_log(user_id uuid,log_date date,amount_ml integer);
CREATE FUNCTION public._anchor_status_today(p_uid uuid,p_date date,
  OUT has_anchors boolean,OUT all_complete boolean)
RETURNS record LANGUAGE sql AS $$ SELECT false,false $$;
CREATE FUNCTION public.charge_for_item(uuid) RETURNS integer LANGUAGE sql AS $$ SELECT 0 $$;
CREATE FUNCTION public.grant_starter_items(uuid,text) RETURNS void LANGUAGE sql AS $$ SELECT $$;
CREATE FUNCTION public.add_gold_to_user(uuid,integer) RETURNS void LANGUAGE sql AS $$ SELECT $$;

ALTER TABLE public.game_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companions ENABLE ROW LEVEL SECURITY;
CREATE POLICY catalog_read ON public.game_items FOR SELECT USING (true);
CREATE POLICY inventory_read ON public.user_inventory FOR SELECT TO authenticated USING (auth.uid()=user_id);
CREATE POLICY "Users can insert own inventory" ON public.user_inventory FOR INSERT TO authenticated WITH CHECK(auth.uid()=user_id);
CREATE POLICY "Users can update own inventory" ON public.user_inventory FOR UPDATE TO authenticated USING(auth.uid()=user_id);
CREATE POLICY "Users can delete own inventory" ON public.user_inventory FOR DELETE TO authenticated USING(auth.uid()=user_id);
CREATE POLICY balance_read ON public.user_balance FOR SELECT TO authenticated USING(auth.uid()=user_id);
CREATE POLICY balance_insert ON public.user_balance FOR INSERT TO authenticated WITH CHECK(auth.uid()=user_id);
CREATE POLICY companions_read ON public.companions FOR SELECT TO authenticated USING(auth.uid()=user_id);
CREATE POLICY companions_insert ON public.companions FOR INSERT TO authenticated WITH CHECK(auth.uid()=user_id);
CREATE POLICY companions_update ON public.companions FOR UPDATE TO authenticated USING(auth.uid()=user_id);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.user_inventory,public.game_items,public.user_balance,
  public.gold_history,public.companions TO anon,authenticated,service_role;
GRANT SELECT ON public.profiles,public.classes TO authenticated;
GRANT EXECUTE ON FUNCTION public.charge_for_item(uuid),public.grant_starter_items(uuid,text),
  public.add_gold_to_user(uuid,integer) TO authenticated;

INSERT INTO public.classes VALUES ('00000000-0000-0000-0000-000000000501',1);
INSERT INTO public.profiles(user_id,level,starter_class,current_class_id) VALUES
  ('00000000-0000-0000-0000-000000000001',5,'guerreiro','00000000-0000-0000-0000-000000000501'),
  ('00000000-0000-0000-0000-000000000002',5,'guerreiro','00000000-0000-0000-0000-000000000501');
INSERT INTO public.user_balance(user_id,gold) VALUES
  ('00000000-0000-0000-0000-000000000001',1000),
  ('00000000-0000-0000-0000-000000000002',10);
INSERT INTO public.game_items(id,name,category,rarity,shop_price,stackable) VALUES
  ('10000000-0000-0000-0000-000000000001','Arma A','weapon','comum',75,false),
  ('10000000-0000-0000-0000-000000000002','Arma B','weapon','comum',75,false),
  ('10000000-0000-0000-0000-000000000003','Arma C','weapon','comum',75,false),
  ('10000000-0000-0000-0000-000000000004','Poção','consumable','comum',20,true),
  ('10000000-0000-0000-0000-000000000005','Loot aventura','weapon','raro',NULL,false),
  ('10000000-0000-0000-0000-000000000006','Preço zero','weapon','comum',0,false);

-- A pre-cutover shop pet is an explicit transition snapshot, even though its
-- historical origin alone cannot prove purchase.
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
INSERT INTO public.companions(user_id,companion_type,origin,name)
VALUES(auth.uid(),'mini_demonio_fome','shop','Legado');
RESET ROLE;

\ir ../migrations/20261019190000_inventory_authorship.sql

SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
DO $$
DECLARE blocked boolean; v_result jsonb; v_id uuid;
BEGIN
  blocked := false;
  BEGIN
    INSERT INTO public.user_inventory(user_id,item_id,quantity,equipped)
    VALUES(auth.uid(),'10000000-0000-0000-0000-000000000005',999,true);
  EXCEPTION WHEN OTHERS THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'forged INSERT passed'; END IF;
  blocked := false;
  BEGIN PERFORM public.charge_for_item('10000000-0000-0000-0000-000000000001');
  EXCEPTION WHEN OTHERS THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'old charge helper executable'; END IF;
  blocked := false;
  BEGIN PERFORM public.add_gold_to_user(auth.uid(),100000);
  EXCEPTION WHEN OTHERS THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'arbitrary gold helper executable'; END IF;
  blocked := false;
  BEGIN INSERT INTO public.user_balance(user_id,gold)
    VALUES('00000000-0000-0000-0000-000000000003',100000);
  EXCEPTION WHEN OTHERS THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'direct balance INSERT passed'; END IF;
  blocked := false;
  BEGIN INSERT INTO public.gold_history(user_id,type,amount)
    VALUES(auth.uid(),'forged',100000);
  EXCEPTION WHEN OTHERS THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'direct history INSERT passed'; END IF;
  blocked := false;
  BEGIN PERFORM public.purchase_game_item('10000000-0000-0000-0000-000000000006',gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'zero price catalog item purchased'; END IF;

  v_result := public.purchase_game_item('10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001');
  IF v_result->>'replayed' <> 'false' THEN RAISE EXCEPTION 'first purchase replay'; END IF;
  v_result := public.purchase_game_item('10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001');
  IF v_result->>'replayed' <> 'true' THEN RAISE EXCEPTION 'purchase replay missing'; END IF;
  IF (SELECT gold FROM public.user_balance WHERE user_id=auth.uid()) <> 925 THEN
    RAISE EXCEPTION 'purchase debit was not exactly once'; END IF;
  IF (SELECT count(*) FROM public.gold_history WHERE user_id=auth.uid() AND type='compra_equipamento') <> 1 THEN
    RAISE EXCEPTION 'purchase history was not exactly once'; END IF;
  SELECT id INTO v_id FROM public.user_inventory WHERE user_id=auth.uid()
    AND item_id='10000000-0000-0000-0000-000000000001';
  IF v_id IS NULL THEN RAISE EXCEPTION 'purchased item missing'; END IF;
  blocked := false;
  BEGIN UPDATE public.user_inventory SET quantity=999 WHERE id=v_id;
  EXCEPTION WHEN OTHERS THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'arbitrary quantity UPDATE passed'; END IF;
  blocked := false;
  BEGIN UPDATE public.user_inventory SET item_id='10000000-0000-0000-0000-000000000005',equipped=true WHERE id=v_id;
  EXCEPTION WHEN OTHERS THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'arbitrary item or equip UPDATE passed'; END IF;
  UPDATE public.game_items SET shop_price=1, atk_bonus=999
  WHERE id='10000000-0000-0000-0000-000000000001';
  IF EXISTS (SELECT 1 FROM public.game_items
             WHERE id='10000000-0000-0000-0000-000000000001'
               AND (shop_price <> 75 OR atk_bonus <> 0)) THEN
    RAISE EXCEPTION 'catalog price or bonus UPDATE passed'; END IF;
  blocked := false;
  BEGIN DELETE FROM public.user_inventory WHERE id=v_id;
  EXCEPTION WHEN OTHERS THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'direct inventory DELETE passed'; END IF;
  PERFORM public.set_inventory_equipped(v_id,true,false);
  IF NOT (SELECT equipped FROM public.user_inventory WHERE id=v_id) THEN RAISE EXCEPTION 'owned item not equipped'; END IF;
  blocked := false;
  BEGIN PERFORM public.set_inventory_equipped(gen_random_uuid(),true,false);
  EXCEPTION WHEN OTHERS THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'unowned item equipped'; END IF;
  blocked := false;
  BEGIN PERFORM public.set_inventory_equipped(v_id,true,true); -- valid swap
  EXCEPTION WHEN OTHERS THEN blocked := true; END;
  IF blocked THEN RAISE EXCEPTION 'valid weapon swap failed'; END IF;
  PERFORM public.purchase_game_item('10000000-0000-0000-0000-000000000002',gen_random_uuid());
  PERFORM public.purchase_game_item('10000000-0000-0000-0000-000000000003',gen_random_uuid());
  SELECT id INTO v_id FROM public.user_inventory WHERE user_id=auth.uid()
    AND item_id='10000000-0000-0000-0000-000000000002';
  PERFORM public.set_inventory_equipped(v_id,true,false);
  SELECT id INTO v_id FROM public.user_inventory WHERE user_id=auth.uid()
    AND item_id='10000000-0000-0000-0000-000000000003';
  blocked := false;
  BEGIN PERFORM public.set_inventory_equipped(v_id,true,false);
  EXCEPTION WHEN OTHERS THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'weapon slot limit passed'; END IF;
  PERFORM public.purchase_game_item('10000000-0000-0000-0000-000000000004',gen_random_uuid());
  SELECT id INTO v_id FROM public.user_inventory WHERE user_id=auth.uid()
    AND item_id='10000000-0000-0000-0000-000000000004';
  blocked := false;
  BEGIN PERFORM public.set_inventory_equipped(v_id,true,false);
  EXCEPTION WHEN OTHERS THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'consumable item equipped'; END IF;
END $$;

SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
DO $$
DECLARE blocked boolean := false; v_id uuid;
BEGIN
  BEGIN PERFORM public.purchase_game_item('10000000-0000-0000-0000-000000000001',gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'insufficient gold accepted'; END IF;
  SELECT id INTO v_id FROM public.user_inventory
  WHERE user_id='00000000-0000-0000-0000-000000000001' LIMIT 1;
  blocked := false;
  BEGIN PERFORM public.set_inventory_equipped(v_id,true,false);
  EXCEPTION WHEN OTHERS THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'other user item equipped'; END IF;
END $$;

RESET ROLE;
-- Server-owned adventure fixture: a committed result is required; authenticated has no INSERT on ledger.
CREATE TABLE public.fixture_adventure_result(user_id uuid PRIMARY KEY,item_id uuid NOT NULL,awarded boolean NOT NULL DEFAULT false);
INSERT INTO public.fixture_adventure_result(user_id,item_id) VALUES
 ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000005');
CREATE FUNCTION public.fixture_reconcile_adventure_loot() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_user uuid := auth.uid(); v_item uuid;
BEGIN
  UPDATE public.fixture_adventure_result SET awarded=true
  WHERE user_id=v_user AND NOT awarded RETURNING item_id INTO v_item;
  IF v_item IS NOT NULL THEN
    INSERT INTO public.user_inventory(user_id,item_id,quantity,equipped)
    VALUES(v_user,v_item,1,false) ON CONFLICT DO NOTHING;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.fixture_reconcile_adventure_loot() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fixture_reconcile_adventure_loot() TO authenticated;
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
SELECT public.fixture_reconcile_adventure_loot();
SELECT public.fixture_reconcile_adventure_loot();
DO $$ BEGIN
  IF (SELECT count(*) FROM public.user_inventory WHERE user_id=auth.uid()
    AND item_id='10000000-0000-0000-0000-000000000005') <> 1 THEN
    RAISE EXCEPTION 'server-authoritative adventure loot not composed'; END IF;
END $$;
RESET ROLE;
INSERT INTO public.game_items(id,name,category,rarity,shop_price,stackable,is_starter,starter_class) VALUES
 ('10000000-0000-0000-0000-000000000007','Starter Sword','weapon','comum',NULL,false,true,'guerreiro');
SET ROLE authenticated;
DO $$
DECLARE blocked boolean := false; v_pet jsonb; v_result jsonb;
BEGIN
  v_result := public.claim_inventory_kit('starter');
  IF v_result->>'already_claimed' <> 'false' THEN RAISE EXCEPTION 'legitimate starter kit not claimed'; END IF;
  v_result := public.claim_inventory_kit('starter');
  IF v_result->>'already_claimed' <> 'true' THEN RAISE EXCEPTION 'starter kit replay not bounded'; END IF;
  IF (SELECT count(*) FROM public.user_inventory WHERE user_id=auth.uid()
      AND item_id='10000000-0000-0000-0000-000000000007') <> 1 THEN
    RAISE EXCEPTION 'starter item missing'; END IF;
  v_pet := public.choose_level3_companion('cat','Mimi');
  v_result := public.forage_inventory((v_pet->>'id')::uuid);
  IF v_result->>'replayed' <> 'false' THEN RAISE EXCEPTION 'forage first claim failed'; END IF;
  v_result := public.forage_inventory((v_pet->>'id')::uuid);
  IF v_result->>'replayed' <> 'true' THEN RAISE EXCEPTION 'forage replay failed'; END IF;
  BEGIN UPDATE public.companions SET affinity=999 WHERE id=(v_pet->>'id')::uuid;
  EXCEPTION WHEN OTHERS THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'client affinity forgery passed'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.inventory_forage_eligible e
    JOIN public.companions c ON c.id=e.companion_id
    WHERE c.user_id='00000000-0000-0000-0000-000000000002'
      AND e.user_id=c.user_id AND e.companion_type='mini_demonio_fome' AND e.origin='shop'
  ) THEN RAISE EXCEPTION 'historical pet snapshot missing'; END IF;
END $$;
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
DO $$
DECLARE blocked boolean := false; v_pet uuid; v_result jsonb;
BEGIN
  SELECT id INTO v_pet FROM public.companions WHERE user_id=auth.uid()
    AND companion_type='mini_demonio_fome';
  v_result := public.forage_inventory(v_pet);
  IF v_result->>'replayed' <> 'false' THEN RAISE EXCEPTION 'historical pet lost forage'; END IF;
  BEGIN INSERT INTO public.companions(user_id,companion_type,origin,name)
    VALUES(auth.uid(),'mini_demonio_fome','shop','Forjado novo');
  EXCEPTION WHEN OTHERS THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'new forged pet INSERT passed'; END IF;
  blocked := false;
  BEGIN INSERT INTO public.inventory_forage_eligible(companion_id,user_id,companion_type,origin)
    VALUES(gen_random_uuid(),auth.uid(),'mini_demonio_fome','shop');
  EXCEPTION WHEN OTHERS THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'new forged eligibility passed'; END IF;
END $$;
\echo INVENTORY_AUTHORSHIP_ASSERTIONS_PASSED
