BEGIN;
-- C4: keep the pre-auto victory entitlement exactly as recorded at migration time.
-- This is a transition snapshot, not a certification of historical combat provenance.
CREATE TABLE app_private.legacy_boss_unlocks (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  boss_id uuid NOT NULL REFERENCES public.bosses(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'TRANSICAO' CHECK (source = 'TRANSICAO'),
  captured_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, boss_id)
);
REVOKE ALL ON app_private.legacy_boss_unlocks FROM PUBLIC, anon, authenticated;
LOCK TABLE public.boss_battles IN SHARE ROW EXCLUSIVE MODE;
INSERT INTO app_private.legacy_boss_unlocks (user_id, boss_id)
SELECT DISTINCT user_id, boss_id FROM public.boss_battles WHERE won = true;

CREATE OR REPLACE FUNCTION app_private.reject_legacy_boss_unlock_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'legacy boss unlock snapshot is immutable';
END;
$$;

REVOKE ALL ON FUNCTION app_private.reject_legacy_boss_unlock_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER legacy_boss_unlocks_immutable BEFORE INSERT OR UPDATE OR TRUNCATE
ON app_private.legacy_boss_unlocks FOR EACH STATEMENT
EXECUTE FUNCTION app_private.reject_legacy_boss_unlock_change();
-- Account and catalog deletion cascades must still be able to clean their FK.
CREATE OR REPLACE FUNCTION app_private.guard_legacy_boss_unlock_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id=OLD.user_id)
     OR NOT EXISTS (SELECT 1 FROM public.bosses WHERE id=OLD.boss_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'legacy boss unlock snapshot is immutable';
END;
$$;
REVOKE ALL ON FUNCTION app_private.guard_legacy_boss_unlock_delete() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER legacy_boss_unlocks_no_direct_delete BEFORE DELETE
ON app_private.legacy_boss_unlocks FOR EACH ROW
EXECUTE FUNCTION app_private.guard_legacy_boss_unlock_delete();

ALTER TABLE public.adventure_encounters
  ADD COLUMN boss_id uuid REFERENCES public.bosses(id);
-- The order and pet-to-boss mapping are server configuration. Live RLS has
-- SELECT-only policies, and these grants close a second write path.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.bosses, public.pet_catalog
  FROM PUBLIC, anon, authenticated;
-- Existing automatic boss rows lack identity. New inserts must carry it.
ALTER TABLE public.adventure_encounters
  ADD CONSTRAINT adventure_encounter_boss_identity CHECK (
    (kind = 'boss' AND stage % 10 = 0 AND boss_id IS NOT NULL) OR
    (kind = 'normal' AND stage % 10 <> 0 AND boss_id IS NULL)
  ) NOT VALID;
CREATE INDEX adventure_encounters_boss_win
  ON public.adventure_encounters(user_id, boss_id) WHERE won AND boss_id IS NOT NULL;

-- Preserve the legacy rows, then close every client path that could add another.
DROP POLICY IF EXISTS "Users can create own battles" ON public.boss_battles;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.boss_battles
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_boss_battle(uuid, boolean, integer)
  FROM PUBLIC, anon, authenticated;

-- The old turn Edge may still run with service_role. It cannot mint a new
-- winning boss counter without the matching server-owned auto encounter.
CREATE OR REPLACE FUNCTION app_private.guard_boss_battle_win()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND
     (NEW.user_id,NEW.boss_id,NEW.won) IS NOT DISTINCT FROM
     (OLD.user_id,OLD.boss_id,OLD.won) THEN
    RETURN NEW;
  END IF;
  IF NEW.won AND NOT EXISTS (
    SELECT 1 FROM public.adventure_encounters e
    WHERE e.user_id=NEW.user_id AND e.boss_id=NEW.boss_id
      AND e.kind='boss' AND e.won
  ) THEN
    RAISE EXCEPTION 'winning boss battle requires a verified auto encounter'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.guard_boss_battle_win() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER boss_battle_auto_win_guard
BEFORE INSERT OR UPDATE OF user_id,boss_id,won ON public.boss_battles
FOR EACH ROW EXECUTE FUNCTION app_private.guard_boss_battle_win();

-- A single predicate is used by the shop indicator and the transactional purchase.
-- Future boss_battles rows alone never create a new entitlement.
CREATE OR REPLACE FUNCTION app_private.has_boss_unlock(p_user uuid, p_boss uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p_boss IS NULL OR EXISTS (
    SELECT 1 FROM app_private.legacy_boss_unlocks l
    WHERE l.user_id = p_user AND l.boss_id = p_boss
  ) OR EXISTS (
    SELECT 1 FROM public.adventure_encounters e
    WHERE e.user_id = p_user AND e.boss_id = p_boss
      AND e.kind = 'boss' AND e.won = true
  );
$$;
REVOKE ALL ON FUNCTION app_private.has_boss_unlock(uuid, uuid) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION app_private.sync_auto_adventure()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_today date := timezone('America/Sao_Paulo', now())::date;
  v_state public.adventure_state%ROWTYPE;
  v_cursor timestamptz;
  v_slots integer;
  v_level integer;
  v_class text;
  v_current_class_id uuid;
  v_class_node public.classes%ROWTYPE;
  v_seen_classes uuid[] := ARRAY[]::uuid[];
  v_class_hops integer := 0;
  v_previous_column integer;
  v_attributes record;
  v_attribute_power integer;
  v_equipment record;
  v_hero integer;
  v_enemy integer;
  v_stage integer;
  v_kind text;
  v_won boolean;
  v_gold integer;
  v_item uuid;
  v_item_count integer;
  v_boss_count integer;
  v_boss_id uuid;
  v_boss_name text;
  v_boss_icon text;
  v_next_boss_stage integer;
  v_next_boss jsonb;
  v_boss_wins_credited integer := 0;
  v_result jsonb;
  v_events jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000'; END IF;

  INSERT INTO public.adventure_state(user_id, last_tick_at)
  VALUES (v_uid, v_now - interval '30 minutes') ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO STRICT v_state FROM public.adventure_state WHERE user_id = v_uid FOR UPDATE;
  SELECT count(*) INTO v_boss_count FROM public.bosses WHERE is_world_event = false;
  IF v_boss_count = 0 THEN
    RAISE EXCEPTION 'regular boss catalog is empty' USING ERRCODE = '22023';
  END IF;

  IF v_state.reward_day <> v_today THEN
    v_state.reward_day := v_today;
    v_state.gold_today := 0;
    v_state.loot_today := 0;
  END IF;

  -- Discard time older than 24 hours; never let repeat requests harvest it.
  v_cursor := greatest(v_state.last_tick_at, v_now - interval '24 hours');
  v_slots := least(48, greatest(0, floor(extract(epoch FROM (v_now - v_cursor)) / 1800)::integer));
  SELECT coalesce(p.level, 1), p.current_class_id,
         lower(coalesce(nullif(btrim(p.starter_class), ''), 'novato'))
    INTO v_level, v_current_class_id, v_class
    FROM public.profiles p WHERE p.user_id = v_uid;
  v_level := greatest(1, coalesce(v_level, 1));
  -- The selected class outranks the starter class, including after a respec.
  -- Walk to the real column-2 ancestor; Aprendiz has no specialized branch.
  IF v_current_class_id IS NOT NULL THEN
    LOOP
      v_class_hops := v_class_hops + 1;
      IF v_class_hops > 16 OR v_current_class_id = ANY(v_seen_classes) THEN
        RAISE EXCEPTION 'invalid current class ancestry' USING ERRCODE = '22023';
      END IF;
      v_seen_classes := array_append(v_seen_classes, v_current_class_id);
      SELECT * INTO v_class_node FROM public.classes WHERE id = v_current_class_id;
      IF NOT FOUND OR v_class_node.column_index IS NULL OR
         (v_previous_column IS NOT NULL AND v_class_node.column_index <> v_previous_column - 1) THEN
        RAISE EXCEPTION 'invalid current class ancestry' USING ERRCODE = '22023';
      END IF;

      IF v_class_node.column_index = 1 AND v_class_node.name = 'Aprendiz' THEN
        v_class := 'novato';
        EXIT;
      ELSIF v_class_node.column_index = 2 THEN
        v_class := CASE v_class_node.name
          WHEN 'Espadachim' THEN 'guerreiro'
          WHEN 'Mago' THEN 'mago'
          WHEN 'Gatuno' THEN 'gatuno'
          WHEN 'Noviço' THEN 'clerico'
          WHEN 'Arqueiro' THEN 'arqueiro'
          WHEN 'Ferreiro' THEN 'ferreiro'
          END;
        IF v_class IS NULL THEN
          RAISE EXCEPTION 'unknown current class base' USING ERRCODE = '22023';
        END IF;
        EXIT;
      ELSIF v_class_node.column_index <= 1 OR v_class_node.parent_class_id IS NULL THEN
        RAISE EXCEPTION 'invalid current class ancestry' USING ERRCODE = '22023';
      END IF;
      v_previous_column := v_class_node.column_index;
      v_current_class_id := v_class_node.parent_class_id;
    END LOOP;
  END IF;
  -- Use the same trained attribute names and weights as getPlayerCombatStats.
  -- Missing attributes start at level 1; extreme levels contribute at most 50.
  SELECT coalesce(max(least(greatest(a.level,1),50)) FILTER (WHERE lower(a.name) IN ('força','forca')),1) AS strength,
         coalesce(max(least(greatest(a.level,1),50)) FILTER (WHERE lower(a.name) IN ('inteligência','inteligencia')),1) AS intelligence,
         coalesce(max(least(greatest(a.level,1),50)) FILTER (WHERE lower(a.name) = 'disciplina'),1) AS discipline,
         coalesce(max(least(greatest(a.level,1),50)) FILTER (WHERE lower(a.name) IN ('sabedoria')),1) AS wisdom,
         coalesce(max(least(greatest(a.level,1),50)) FILTER (WHERE lower(a.name) IN ('resiliência','resiliencia')),1) AS resilience,
         coalesce(max(least(greatest(a.level,1),50)) FILTER (WHERE lower(a.name) = 'vitalidade'),1) AS vitality,
         coalesce(max(least(greatest(a.level,1),50)) FILTER (WHERE lower(a.name) = 'agilidade'),1) AS agility,
         coalesce(max(least(greatest(a.level,1),50)) FILTER (WHERE lower(a.name) = 'criatividade'),1) AS creativity
    INTO v_attributes FROM public.attributes a WHERE a.user_id = v_uid;
  -- The current class (or starter fallback when absent) selects the attack branch.
  -- Defense, agility and HP add smaller shared contributions to every class.
  v_attribute_power := least(180,
    CASE WHEN v_class IN ('mago','clerico') THEN
      4*(v_attributes.intelligence-1) + 2*(v_attributes.wisdom-1)
    WHEN v_class IN ('guerreiro','ferreiro','arqueiro','gatuno') THEN
      6*(v_attributes.strength-1) + 2*(v_attributes.discipline-1)
    ELSE greatest(6*(v_attributes.strength-1) + 2*(v_attributes.discipline-1),
                  4*(v_attributes.intelligence-1) + 2*(v_attributes.wisdom-1)) END
    + (5*(v_attributes.resilience-1) + 3*(v_attributes.vitality-1))/2
    + (6*(v_attributes.agility-1) + 2*(v_attributes.creativity-1))/3
    + (8*(v_attributes.strength-1) + 14*(v_attributes.vitality-1))/10);
  SELECT coalesce(sum(greatest(0, i.atk_bonus) + greatest(0, i.matk_bonus)),0) AS attack,
         coalesce(sum(greatest(0, i.def_bonus)),0) AS defense,
         coalesce(sum(greatest(0, i.hp_bonus)),0) AS hp
    INTO v_equipment
    FROM public.user_inventory ui JOIN public.game_items i ON i.id = ui.item_id
   WHERE ui.user_id = v_uid AND ui.equipped
     AND (NOT (i.requer_sintonizacao OR lower(i.rarity) IN ('epico','lendario')) OR ui.sintonizado);

  FOR n IN 1..v_slots LOOP
    v_stage := v_state.stage;
    v_kind := CASE WHEN v_stage % 10 = 0 THEN 'boss' ELSE 'normal' END;
    v_boss_id := NULL;
    v_boss_name := NULL;
    v_boss_icon := NULL;
    IF v_kind = 'boss' THEN
      SELECT b.id, b.name, b.icon INTO STRICT v_boss_id, v_boss_name, v_boss_icon
      FROM public.bosses b WHERE b.is_world_event = false
      ORDER BY b.level, b.id
      OFFSET ((v_stage / 10 - 1) % v_boss_count) LIMIT 1;
    END IF;
    v_hero := 70 + least(v_level, 50) * 3 + v_attribute_power
      + least(v_equipment.attack, 200) * 2
      + least(v_equipment.defense, 150)
      + least(v_equipment.hp, 400) / 10;
    v_enemy := CASE WHEN v_kind = 'boss' THEN least(900, 30 + floor(1.5 * v_stage)::integer)
                    ELSE least(880, 20 + floor(1.5 * v_stage)::integer) END;
    v_won := v_hero >= v_enemy;
    v_gold := 0;
    v_item := NULL;

    IF v_won THEN
      v_gold := least(CASE WHEN v_kind = 'boss' THEN 12 ELSE 4 END, greatest(0, 120 - v_state.gold_today));
      IF v_state.loot_today < 2 AND (v_kind = 'boss' OR v_stage % 7 = 0) THEN
        SELECT count(*) INTO v_item_count FROM public.game_items i
         WHERE i.category IN ('weapon','armor','accessory') AND lower(i.rarity) = 'comum'
           AND NOT i.is_consumable AND i.effect IS NULL AND i.level_required <= v_level;
        IF v_item_count > 0 THEN
          SELECT i.id INTO v_item FROM public.game_items i
           WHERE i.category IN ('weapon','armor','accessory') AND lower(i.rarity) = 'comum'
             AND NOT i.is_consumable AND i.effect IS NULL AND i.level_required <= v_level
           ORDER BY i.id OFFSET ((v_stage / 7) % v_item_count) LIMIT 1;
        END IF;
      END IF;
    END IF;

    INSERT INTO public.adventure_encounters(user_id,stage,attempt,fought_at,kind,won,hero_power,enemy_power,gold,item_id,boss_id)
    VALUES (v_uid,v_stage,v_state.attempt,v_cursor + interval '30 minutes',v_kind,v_won,v_hero,v_enemy,v_gold,v_item,v_boss_id);
    IF v_won AND v_boss_id IS NOT NULL THEN
      v_boss_wins_credited := v_boss_wins_credited + 1;
      -- Keep the historical boss counter and narrative readers working. The
      -- shop's new entitlement comes from the protected encounter, not here.
      INSERT INTO public.boss_battles(user_id,boss_id,damage_dealt,won)
      SELECT v_uid,v_boss_id,0,true
      WHERE NOT EXISTS (
        SELECT 1 FROM public.boss_battles
        WHERE user_id=v_uid AND boss_id=v_boss_id AND won=true
      );
    END IF;

    IF v_won THEN
      IF v_gold > 0 THEN
        INSERT INTO public.user_balance(user_id, gold) VALUES (v_uid, 100) ON CONFLICT (user_id) DO NOTHING;
        INSERT INTO public.gold_history(user_id,type,amount,reason)
        VALUES (v_uid,'adventure',v_gold,'Aventura etapa ' || v_stage);
        UPDATE public.user_balance SET gold = gold + v_gold, updated_at = v_now WHERE user_id = v_uid;
        v_state.gold_today := v_state.gold_today + v_gold;
      END IF;
      IF v_item IS NOT NULL THEN
        INSERT INTO public.user_inventory(user_id,item_id,quantity,equipped)
        VALUES (v_uid,v_item,1,false)
        ON CONFLICT (user_id,item_id) DO UPDATE SET quantity = public.user_inventory.quantity + 1;
        v_state.loot_today := v_state.loot_today + 1;
      END IF;
      v_state.stage := v_stage + 1;
      v_state.attempt := 0;
      v_cursor := v_cursor + interval '30 minutes';
    ELSE
      -- A defeat stops this catch-up batch and discards accumulated time.
      -- The same stage is tried automatically after another 30 minutes.
      v_state.attempt := v_state.attempt + 1;
      v_cursor := v_now;
    END IF;

    v_result := jsonb_build_object('stage',v_stage,'kind',v_kind,'won',v_won,
      'gold',v_gold,'item_id',v_item,'hero_power',v_hero,'enemy_power',v_enemy,
      'boss_id',v_boss_id,'boss_name',v_boss_name,'boss_icon',v_boss_icon);
    v_state.last_result := v_result;
    EXIT WHEN NOT v_won;
  END LOOP;

  v_state.last_tick_at := v_cursor;
  UPDATE public.adventure_state SET stage=v_state.stage,attempt=v_state.attempt,last_tick_at=v_state.last_tick_at,
    reward_day=v_state.reward_day,gold_today=v_state.gold_today,loot_today=v_state.loot_today,
    last_result=v_state.last_result,updated_at=v_now WHERE user_id=v_uid;

  SELECT coalesce(jsonb_agg(e ORDER BY e.fought_at DESC, e.stage DESC, e.attempt DESC),'[]'::jsonb)
    INTO v_events FROM (
      SELECT ae.stage,ae.attempt,ae.fought_at,ae.kind,ae.won,ae.hero_power,
        ae.enemy_power,ae.gold,ae.item_id,ae.boss_id,
        b.name AS boss_name,b.icon AS boss_icon
      FROM public.adventure_encounters ae
      LEFT JOIN public.bosses b ON b.id=ae.boss_id
      WHERE ae.user_id=v_uid
      ORDER BY ae.fought_at DESC,ae.stage DESC,ae.attempt DESC LIMIT 8
    ) e;

  v_next_boss_stage := ((v_state.stage + 9) / 10) * 10;
  SELECT jsonb_build_object('stage',v_next_boss_stage,'id',b.id,'name',b.name,'icon',b.icon)
    INTO STRICT v_next_boss FROM public.bosses b WHERE b.is_world_event=false
    ORDER BY b.level,b.id
    OFFSET ((v_next_boss_stage / 10 - 1) % v_boss_count) LIMIT 1;

  RETURN jsonb_build_object('stage',v_state.stage,'next_at',v_state.last_tick_at + interval '30 minutes',
    'server_now',v_now,'last_result',v_state.last_result,'encounters',v_events,
    'boss',v_next_boss,'boss_wins_credited',v_boss_wins_credited,
    'gold_today',v_state.gold_today,'loot_today',v_state.loot_today,
    'limits',jsonb_build_object('interval_minutes',30,'offline_hours',24,'gold_per_day',120,'items_per_day',2));
END;
$$;

-- One chosen/story companion per origin remains; shop purchases are keyed by
-- pet type so obtaining a second distinct mini is possible.
ALTER TABLE public.companions DROP CONSTRAINT IF EXISTS companions_user_id_origin_key;
CREATE UNIQUE INDEX IF NOT EXISTS companions_one_nonshop_origin
  ON public.companions(user_id,origin) WHERE origin <> 'shop';
CREATE UNIQUE INDEX IF NOT EXISTS companions_one_shop_pet_type
  ON public.companions(user_id,companion_type) WHERE origin = 'shop';

CREATE OR REPLACE FUNCTION public.get_pet_catalog()
RETURNS TABLE (
  pet_type text, name text, price integer, role text, emoji text, sort integer,
  unlock_boss text, unlocked boolean, owned boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.pet_type,p.name,p.price,p.role,p.emoji,p.sort,b.name,
    app_private.has_boss_unlock(auth.uid(),p.unlock_boss_id),
    EXISTS (SELECT 1 FROM public.companions c
            WHERE c.user_id=auth.uid() AND c.companion_type=p.pet_type)
  FROM public.pet_catalog p
  LEFT JOIN public.bosses b ON b.id=p.unlock_boss_id
  ORDER BY p.sort;
$$;
REVOKE ALL ON FUNCTION public.get_pet_catalog() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pet_catalog() TO authenticated;

CREATE OR REPLACE FUNCTION public.buy_pet(p_pet_type text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pet public.pet_catalog%ROWTYPE;
  v_gold integer;
  v_boss_name text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
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
$$;
REVOKE ALL ON FUNCTION public.buy_pet(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buy_pet(text) TO authenticated;
COMMIT;
