-- Inventory authorship. Apply together with the matching frontend callers.
-- The server owns acquisition, quantity, equipment, attunement and gold debit.

CREATE TABLE IF NOT EXISTS public.inventory_purchase_requests (
  user_id uuid NOT NULL,
  request_id uuid NOT NULL,
  item_id uuid NOT NULL REFERENCES public.game_items(id),
  price integer NOT NULL CHECK (price > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, request_id)
);
ALTER TABLE public.inventory_purchase_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inventory_purchase_requests FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.inventory_kit_claims (
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('starter', 'class')),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind)
);
ALTER TABLE public.inventory_kit_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inventory_kit_claims FROM PUBLIC, anon, authenticated;
-- Preserve historical claims; no inventory row is removed or recalculated.
INSERT INTO public.inventory_kit_claims(user_id, kind)
SELECT user_id, 'starter' FROM public.profiles WHERE starter_kit_claimed
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.inventory_class_gold_claims (
  user_id uuid PRIMARY KEY,
  claimed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_class_gold_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inventory_class_gold_claims FROM PUBLIC, anon, authenticated;
INSERT INTO public.inventory_class_gold_claims(user_id)
SELECT DISTINCT user_id FROM public.gold_history
WHERE type = 'class_reward' AND amount = 50 ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.claim_class_gold_reward()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_user uuid := auth.uid(); v_level integer; v_min integer; v_claimed uuid; v_gold integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT p.level, c.level_min INTO v_level, v_min
  FROM public.profiles p JOIN public.classes c ON c.id = p.current_class_id
  WHERE p.user_id = v_user FOR UPDATE OF p;
  IF NOT FOUND OR v_level < v_min THEN RAISE EXCEPTION 'CLASS_REWARD_LOCKED'; END IF;
  INSERT INTO public.inventory_class_gold_claims(user_id) VALUES(v_user)
  ON CONFLICT DO NOTHING RETURNING user_id INTO v_claimed;
  IF v_claimed IS NULL THEN RETURN jsonb_build_object('ok',true,'already_claimed',true); END IF;
  INSERT INTO public.user_balance(user_id,balance_percent,gold)
  VALUES(v_user,100,100) ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.user_balance SET gold = gold + 50, updated_at = now()
  WHERE user_id = v_user RETURNING gold INTO v_gold;
  INSERT INTO public.gold_history(user_id,type,amount,reason)
  VALUES(v_user,'class_reward',50,'Recompensa de classe inicial');
  RETURN jsonb_build_object('ok',true,'already_claimed',false,'gold',v_gold);
END;
$$;
INSERT INTO public.inventory_kit_claims(user_id, kind)
SELECT user_id, 'class' FROM public.profiles WHERE class_kit_claimed
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.claim_inventory_kit(p_kind text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_user uuid := auth.uid(); v_profile public.profiles%ROWTYPE; v_class text; v_count integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF p_kind NOT IN ('starter','class') THEN RAISE EXCEPTION 'INVALID_KIT'; END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
  IF EXISTS (SELECT 1 FROM public.inventory_kit_claims WHERE user_id = v_user AND kind = p_kind)
     OR (p_kind = 'starter' AND v_profile.starter_kit_claimed)
     OR (p_kind = 'class' AND v_profile.class_kit_claimed) THEN
    RETURN jsonb_build_object('ok', true, 'already_claimed', true);
  END IF;
  IF p_kind = 'class' AND v_profile.level < 5 THEN RAISE EXCEPTION 'CLASS_LEVEL_REQUIRED'; END IF;
  v_class := CASE WHEN p_kind = 'starter' THEN COALESCE(NULLIF(v_profile.starter_class,''),'novato')
                  ELSE NULLIF(v_profile.starter_class,'') END;
  IF v_class IS NULL THEN RAISE EXCEPTION 'CLASS_NOT_SELECTED'; END IF;
  INSERT INTO public.inventory_kit_claims(user_id, kind) VALUES (v_user, p_kind);
  INSERT INTO public.user_inventory(user_id, item_id, quantity, equipped)
  SELECT v_user, gi.id, 1,
         p_kind = 'starter' AND gi.category IN ('weapon','armor') AND gi.slot_rank = 1
         AND NOT EXISTS (
           SELECT 1 FROM public.user_inventory ui JOIN public.game_items owned ON owned.id = ui.item_id
           WHERE ui.user_id = v_user AND ui.equipped AND owned.category = gi.category
         )
  FROM (
    SELECT catalog.*, row_number() OVER (PARTITION BY catalog.category ORDER BY catalog.id) AS slot_rank
    FROM public.game_items catalog
    WHERE catalog.is_starter AND catalog.starter_class = v_class AND NOT catalog.is_consumable
      AND catalog.category IN ('weapon','armor','accessory')
  ) gi
  ON CONFLICT (user_id,item_id) DO UPDATE
  SET quantity = GREATEST(public.user_inventory.quantity, EXCLUDED.quantity),
      equipped = public.user_inventory.equipped OR EXCLUDED.equipped;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN RAISE EXCEPTION 'KIT_ITEMS_NOT_FOUND'; END IF;
  IF p_kind = 'starter' THEN
    INSERT INTO public.user_inventory(user_id,item_id,quantity,equipped)
    SELECT v_user, gi.id, CASE WHEN gi.name = 'Poção de MP Menor' THEN 2 ELSE 1 END, false
    FROM public.game_items gi
    WHERE gi.name IN ('Poção de MP Menor','Poção de HP Menor')
    ON CONFLICT (user_id,item_id) DO UPDATE
    SET quantity = GREATEST(public.user_inventory.quantity, EXCLUDED.quantity);
    UPDATE public.profiles SET starter_kit_claimed = true WHERE user_id = v_user;
  ELSE
    UPDATE public.profiles SET class_kit_claimed = true WHERE user_id = v_user;
  END IF;
  RETURN jsonb_build_object('ok', true, 'already_claimed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_user_balance()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_user uuid := auth.uid(); v_gold integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  INSERT INTO public.user_balance (user_id, balance_percent, gold)
  VALUES (v_user, 100, 100) ON CONFLICT (user_id) DO NOTHING;
  SELECT gold INTO v_gold FROM public.user_balance WHERE user_id = v_user;
  RETURN v_gold;
END;
$$;

CREATE OR REPLACE FUNCTION public.purchase_game_item(p_item_id uuid, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_item public.game_items%ROWTYPE;
  v_existing public.inventory_purchase_requests%ROWTYPE;
  v_gold integer;
  v_inserted uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF p_item_id IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'INVALID_PURCHASE'; END IF;

  SELECT * INTO v_existing FROM public.inventory_purchase_requests
  WHERE user_id = v_user AND request_id = p_request_id;
  IF FOUND THEN
    IF v_existing.item_id <> p_item_id THEN RAISE EXCEPTION 'PURCHASE_REQUEST_CONFLICT'; END IF;
    RETURN jsonb_build_object('ok', true, 'replayed', true, 'price', v_existing.price);
  END IF;

  SELECT * INTO v_item FROM public.game_items WHERE id = p_item_id FOR SHARE;
  IF NOT FOUND OR v_item.shop_price IS NULL OR v_item.shop_price <= 0
     OR v_item.is_starter OR v_item.boss_drop_level IS NOT NULL
     OR v_item.category NOT IN ('weapon', 'armor', 'accessory', 'consumable') THEN
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
$$;

CREATE OR REPLACE FUNCTION public.set_inventory_equipped(
  p_inventory_id uuid, p_equipped boolean, p_replace_weapon boolean DEFAULT false
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE
  v_user uuid := auth.uid(); v_item public.game_items%ROWTYPE;
  v_item_id uuid; v_quantity integer; v_count integer; v_limit integer; v_attuned boolean;
  v_requires_attunement boolean;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF p_equipped IS NULL THEN RAISE EXCEPTION 'INVALID_EQUIP_STATE'; END IF;
  PERFORM 1 FROM public.profiles WHERE user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
  SELECT ui.item_id, ui.quantity, ui.sintonizado INTO v_item_id, v_quantity, v_attuned
  FROM public.user_inventory ui
  WHERE ui.id = p_inventory_id AND ui.user_id = v_user FOR UPDATE;
  IF NOT FOUND OR v_quantity <= 0 THEN RAISE EXCEPTION 'ITEM_NOT_OWNED'; END IF;
  SELECT * INTO v_item FROM public.game_items WHERE id = v_item_id;
  IF NOT p_equipped THEN
    UPDATE public.user_inventory SET equipped = false WHERE id = p_inventory_id;
    RETURN;
  END IF;
  v_limit := CASE v_item.category WHEN 'weapon' THEN 2 WHEN 'armor' THEN 1
             WHEN 'accessory' THEN 3 ELSE NULL END;
  IF v_limit IS NULL OR v_item.is_consumable THEN RAISE EXCEPTION 'ITEM_NOT_EQUIPPABLE'; END IF;
  IF COALESCE(v_item.level_required, 1) >
     COALESCE((SELECT level FROM public.profiles WHERE user_id = v_user), 1) THEN
    RAISE EXCEPTION 'ITEM_LEVEL_REQUIRED';
  END IF;
  IF p_replace_weapon AND v_item.category <> 'weapon' THEN RAISE EXCEPTION 'INVALID_WEAPON_SWAP'; END IF;
  IF p_replace_weapon THEN
    UPDATE public.user_inventory ui SET equipped = false
    FROM public.game_items gi WHERE gi.id = ui.item_id AND gi.category = 'weapon'
      AND ui.user_id = v_user AND ui.id <> p_inventory_id;
  END IF;
  SELECT count(*) INTO v_count FROM public.user_inventory ui
  JOIN public.game_items gi ON gi.id = ui.item_id
  WHERE ui.user_id = v_user AND ui.id <> p_inventory_id
    AND ui.equipped AND gi.category = v_item.category;
  IF v_count >= v_limit THEN RAISE EXCEPTION 'EQUIPMENT_SLOT_LIMIT'; END IF;
  v_requires_attunement := v_item.requer_sintonizacao OR v_item.rarity IN ('epico', 'lendario');
  IF v_requires_attunement AND NOT v_attuned THEN
    SELECT count(*) INTO v_count FROM public.user_inventory
    WHERE user_id = v_user AND sintonizado AND id <> p_inventory_id;
    IF v_count >= 3 THEN RAISE EXCEPTION 'ATTUNEMENT_LIMIT'; END IF;
    UPDATE public.user_inventory SET sintonizado = true WHERE id = p_inventory_id;
  END IF;
  UPDATE public.user_inventory SET equipped = true WHERE id = p_inventory_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_inventory_attunement(p_inventory_id uuid, p_attuned boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_user uuid := auth.uid(); v_item public.game_items%ROWTYPE;
        v_item_id uuid; v_quantity integer; v_count integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF p_attuned IS NULL THEN RAISE EXCEPTION 'INVALID_ATTUNEMENT_STATE'; END IF;
  PERFORM 1 FROM public.profiles WHERE user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
  SELECT ui.item_id, ui.quantity INTO v_item_id, v_quantity FROM public.user_inventory ui
  WHERE ui.id = p_inventory_id AND ui.user_id = v_user FOR UPDATE;
  IF NOT FOUND OR v_quantity <= 0 THEN RAISE EXCEPTION 'ITEM_NOT_OWNED'; END IF;
  SELECT * INTO v_item FROM public.game_items WHERE id = v_item_id;
  IF p_attuned THEN
    IF NOT (v_item.requer_sintonizacao OR v_item.rarity IN ('epico','lendario')) THEN
      RAISE EXCEPTION 'ITEM_DOES_NOT_REQUIRE_ATTUNEMENT';
    END IF;
    SELECT count(*) INTO v_count FROM public.user_inventory
    WHERE user_id = v_user AND sintonizado AND id <> p_inventory_id;
    IF v_count >= 3 THEN RAISE EXCEPTION 'ATTUNEMENT_LIMIT'; END IF;
  END IF;
  IF NOT p_attuned AND EXISTS (
    SELECT 1 FROM public.user_inventory
    WHERE id = p_inventory_id AND equipped
  ) AND (v_item.requer_sintonizacao OR v_item.rarity IN ('epico','lendario')) THEN
    RAISE EXCEPTION 'UNEQUIP_BEFORE_UNATTUNEMENT';
  END IF;
  UPDATE public.user_inventory SET sintonizado = p_attuned WHERE id = p_inventory_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_inventory_item(p_inventory_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_user uuid := auth.uid(); v_row public.user_inventory%ROWTYPE;
        v_item public.game_items%ROWTYPE; v_preserved boolean := false;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT * INTO v_row FROM public.user_inventory
  WHERE id = p_inventory_id AND user_id = v_user FOR UPDATE;
  IF NOT FOUND OR v_row.quantity <= 0 THEN RAISE EXCEPTION 'ITEM_NOT_OWNED'; END IF;
  SELECT * INTO v_item FROM public.game_items WHERE id = v_row.item_id;
  IF NOT v_item.is_consumable AND v_item.effect IS NULL THEN RAISE EXCEPTION 'ITEM_NOT_CONSUMABLE'; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.talentos_jogador tj
    JOIN public.talentos_disponiveis td ON td.id = tj.talento_id
    WHERE tj.personagem_id = v_user AND td.efeito = 'alquimista_amador'
  ) AND (COALESCE(v_item.effect, '') LIKE 'heal_%' OR COALESCE(v_item.effect, '') LIKE 'mana_%'
         OR v_item.effect = 'full_rest' OR lower(v_item.name) LIKE '%pocao%')
    AND random() < 0.1 INTO v_preserved;
  IF NOT v_preserved THEN
    IF v_row.quantity = 1 THEN DELETE FROM public.user_inventory WHERE id = v_row.id;
    ELSE UPDATE public.user_inventory SET quantity = quantity - 1 WHERE id = v_row.id; END IF;
  END IF;
  RETURN jsonb_build_object('ok', true, 'item_id', v_item.id,
                            'effect', v_item.effect, 'preserved', v_preserved);
END;
$$;

CREATE TABLE IF NOT EXISTS public.inventory_forage_eligible (
  companion_id uuid PRIMARY KEY REFERENCES public.companions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  companion_type text NOT NULL,
  origin text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_forage_eligible ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inventory_forage_eligible FROM PUBLIC, anon, authenticated;
-- One-time grandfather snapshot of IDs/owners/types at cutover. Historical
-- origin is not proof of purchase; this transition preserves existing rights.
INSERT INTO public.inventory_forage_eligible(companion_id,user_id,companion_type,origin)
SELECT c.id,c.user_id,c.companion_type,c.origin FROM public.companions c
WHERE (c.companion_type = 'cat' AND c.origin = 'lvl3_choice')
   OR (c.companion_type = 'mini_demonio_fome' AND c.origin = 'shop')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public._record_inventory_forage_pet()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF current_user IN ('postgres','service_role') AND
     ((NEW.companion_type = 'cat' AND NEW.origin = 'lvl3_choice') OR
      (NEW.companion_type = 'mini_demonio_fome' AND NEW.origin = 'shop')) THEN
    INSERT INTO public.inventory_forage_eligible(companion_id,user_id,companion_type,origin)
    VALUES(NEW.id,NEW.user_id,NEW.companion_type,NEW.origin) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS record_inventory_forage_pet ON public.companions;
CREATE TRIGGER record_inventory_forage_pet AFTER INSERT ON public.companions
FOR EACH ROW EXECUTE FUNCTION public._record_inventory_forage_pet();

CREATE OR REPLACE FUNCTION public._guard_inventory_forage_pet()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF current_user IN ('authenticated','anon') AND
     (NEW.id, NEW.user_id, NEW.companion_type, NEW.origin, NEW.affinity,
      NEW.last_forage_at, NEW.last_affinity_date)
     IS DISTINCT FROM
     (OLD.id, OLD.user_id, OLD.companion_type, OLD.origin, OLD.affinity,
      OLD.last_forage_at, OLD.last_affinity_date) THEN
    RAISE EXCEPTION 'COMPANION_REWARD_FIELDS_PROTECTED';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_inventory_forage_pet ON public.companions;
CREATE TRIGGER guard_inventory_forage_pet BEFORE UPDATE ON public.companions
FOR EACH ROW EXECUTE FUNCTION public._guard_inventory_forage_pet();

CREATE OR REPLACE FUNCTION public.choose_level3_companion(p_type text, p_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_user uuid := auth.uid(); v_level integer; v_pet public.companions%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF p_type NOT IN ('dog','cat','calopsita') OR length(trim(COALESCE(p_name,''))) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'INVALID_COMPANION';
  END IF;
  SELECT level INTO v_level FROM public.profiles WHERE user_id = v_user FOR UPDATE;
  IF COALESCE(v_level,0) < 3 THEN RAISE EXCEPTION 'COMPANION_LEVEL_REQUIRED'; END IF;
  INSERT INTO public.companions(user_id,companion_type,origin,name)
  VALUES(v_user,p_type,'lvl3_choice',trim(p_name)) RETURNING * INTO v_pet;
  RETURN to_jsonb(v_pet);
END;
$$;

CREATE TABLE IF NOT EXISTS public.inventory_forage_claims (
  user_id uuid NOT NULL,
  forage_date date NOT NULL,
  companion_id uuid NOT NULL,
  item_id uuid REFERENCES public.game_items(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,forage_date)
);
ALTER TABLE public.inventory_forage_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inventory_forage_claims FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.forage_inventory(p_companion_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE
  v_user uuid := auth.uid(); v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_pet public.companions%ROWTYPE; v_level integer; v_health boolean;
  v_has_anchor boolean; v_anchor_done boolean; v_health_done boolean := true;
  v_cap integer; v_roll double precision; v_target text; v_item public.game_items%ROWTYPE;
  v_claimed uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT * INTO v_pet FROM public.companions
  WHERE id = p_companion_id AND user_id = v_user FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.inventory_forage_eligible e
    WHERE e.companion_id = v_pet.id AND e.user_id = v_user
      AND e.companion_type = v_pet.companion_type AND e.origin = v_pet.origin
  ) THEN RAISE EXCEPTION 'FORAGE_PET_NOT_ELIGIBLE'; END IF;
  SELECT level,health_anchors_enabled INTO v_level,v_health
  FROM public.profiles WHERE user_id = v_user FOR UPDATE;
  IF v_level IS NULL THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
  IF EXISTS (SELECT 1 FROM public.inventory_forage_claims
             WHERE user_id=v_user AND forage_date=v_today) THEN
    RETURN jsonb_build_object('ok',true,'replayed',true);
  END IF;
  SELECT has_anchors, all_complete INTO v_has_anchor,v_anchor_done
  FROM public._anchor_status_today(v_user,v_today);
  IF v_health THEN
    SELECT EXISTS(SELECT 1 FROM public.meal_log WHERE user_id=v_user AND meal_date=v_today)
       AND EXISTS(SELECT 1 FROM public.water_log WHERE user_id=v_user AND log_date=v_today AND amount_ml>0)
      INTO v_health_done;
  END IF;
  IF (COALESCE(v_has_anchor,false) OR v_health) AND
     (NOT COALESCE(v_has_anchor,false) OR COALESCE(v_anchor_done,false)) AND v_health_done AND
     v_pet.last_affinity_date IS DISTINCT FROM v_today THEN
    UPDATE public.companions SET affinity = affinity + 1,last_affinity_date=v_today
    WHERE id=v_pet.id RETURNING * INTO v_pet;
  END IF;
  v_cap := CASE WHEN v_pet.affinity >= 15 THEN 3 WHEN v_pet.affinity >= 5 THEN 2 ELSE 0 END;
  v_roll := random() * CASE WHEN v_cap=3 THEN 100 WHEN v_cap=2 THEN 97 ELSE 58 END;
  v_target := CASE WHEN v_roll < 58 THEN 'comum' WHEN v_roll < 86 THEN 'incomum'
                   WHEN v_roll < 97 THEN 'raro' ELSE 'epico' END;
  SELECT * INTO v_item FROM public.game_items gi
  WHERE gi.category IN ('weapon','armor','accessory') AND NOT gi.is_consumable
    AND NOT gi.is_starter
    AND gi.boss_drop_level IS NULL AND gi.level_required <= v_level
    AND gi.rarity IN ('comum','incomum','raro','epico')
    AND CASE gi.rarity WHEN 'comum' THEN 0 WHEN 'incomum' THEN 1
                       WHEN 'raro' THEN 2 ELSE 3 END <= v_cap
    AND NOT EXISTS (SELECT 1 FROM public.user_inventory ui
                    WHERE ui.user_id=v_user AND ui.item_id=gi.id)
  ORDER BY CASE WHEN gi.rarity=v_target THEN 0 ELSE 1 END,
           CASE gi.rarity WHEN 'epico' THEN 3 WHEN 'raro' THEN 2
                          WHEN 'incomum' THEN 1 ELSE 0 END DESC, random()
  LIMIT 1;
  INSERT INTO public.inventory_forage_claims(user_id,forage_date,companion_id,item_id)
  VALUES(v_user,v_today,v_pet.id,v_item.id)
  ON CONFLICT DO NOTHING RETURNING user_id INTO v_claimed;
  IF v_claimed IS NULL THEN RETURN jsonb_build_object('ok',true,'replayed',true); END IF;
  UPDATE public.companions SET last_forage_at=v_today WHERE id=v_pet.id;
  IF v_item.id IS NOT NULL THEN
    INSERT INTO public.user_inventory(user_id,item_id,quantity,equipped)
    VALUES(v_user,v_item.id,1,false) ON CONFLICT (user_id,item_id) DO NOTHING;
    RETURN jsonb_build_object('ok',true,'replayed',false,'item_id',v_item.id,
                              'name',v_item.name,'rarity',v_item.rarity);
  END IF;
  RETURN jsonb_build_object('ok',true,'replayed',false,'item_id',null);
END;
$$;

-- Legacy generic credit and reset helpers must not remain client-executable.
REVOKE EXECUTE ON FUNCTION public.charge_for_item(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_starter_items(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_gold_to_user(uuid,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_user_balance() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.purchase_game_item(uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_inventory_equipped(uuid,boolean,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_inventory_attunement(uuid,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.consume_inventory_item(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_inventory_kit(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_class_gold_reward() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.choose_level3_companion(text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.forage_inventory(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_user_balance() TO authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_game_item(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_inventory_equipped(uuid,boolean,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_inventory_attunement(uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_inventory_item(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_inventory_kit(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_class_gold_reward() TO authenticated;
GRANT EXECUTE ON FUNCTION public.choose_level3_companion(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.forage_inventory(uuid) TO authenticated;

DROP POLICY IF EXISTS "Users insert own inventory" ON public.user_inventory;
DROP POLICY IF EXISTS "Users update own inventory" ON public.user_inventory;
DROP POLICY IF EXISTS "Users delete own inventory" ON public.user_inventory;
DROP POLICY IF EXISTS "Users can insert own inventory" ON public.user_inventory;
DROP POLICY IF EXISTS "Users can update own inventory" ON public.user_inventory;
DROP POLICY IF EXISTS "Users can delete own inventory" ON public.user_inventory;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON public.user_inventory FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON public.user_balance FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON public.gold_history FROM PUBLIC, anon, authenticated;
REVOKE INSERT ON public.companions FROM PUBLIC, anon, authenticated;
DO $$ DECLARE v_column text; BEGIN
  FOR v_column IN SELECT attname FROM pg_attribute
                  WHERE attrelid = 'public.user_inventory'::regclass
                    AND attnum > 0 AND NOT attisdropped LOOP
    EXECUTE format('REVOKE INSERT (%1$I), UPDATE (%1$I), REFERENCES (%1$I) ON public.user_inventory FROM PUBLIC, anon, authenticated', v_column);
  END LOOP;
END $$;
DO $$ DECLARE v_table text; v_column text; BEGIN
  FOREACH v_table IN ARRAY ARRAY['user_balance', 'gold_history'] LOOP
    FOR v_column IN SELECT attname FROM pg_attribute
                    WHERE attrelid = format('public.%I', v_table)::regclass
                      AND attnum > 0 AND NOT attisdropped LOOP
      EXECUTE format('REVOKE INSERT (%1$I), UPDATE (%1$I), REFERENCES (%1$I) ON public.%2$I FROM PUBLIC, anon, authenticated', v_column, v_table);
    END LOOP;
  END LOOP;
END $$;
