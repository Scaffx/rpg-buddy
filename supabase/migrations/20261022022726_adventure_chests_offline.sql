-- Server-owned adventure chests. Apply after 20261022022416_boss_recipes_crafting_salvage.
-- Economy sync must lock the profile, then the balance, before settling a battle.
BEGIN;
SET lock_timeout = '5s';
SET statement_timeout = '120s';

DO $guard$
DECLARE v_helper oid := to_regprocedure('app_private.credit_adventure_material(uuid,text,integer,text,uuid)');
BEGIN
  IF to_regclass('app_private.adventure_battles') IS NULL
     OR to_regclass('app_private.adventure_material_receipts') IS NULL
     OR to_regclass('public.user_balance') IS NULL
     OR to_regclass('public.user_inventory') IS NULL
     OR to_regclass('public.game_items') IS NULL
     OR v_helper IS NULL
     OR EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=v_helper
       AND (p.proowner <> 'postgres'::regrole OR NOT p.prosecdef
         OR p.prorettype <> 'jsonb'::regtype
         OR p.proconfig IS NULL OR NOT ('search_path=""'=ANY(p.proconfig))
         OR has_function_privilege('anon',p.oid,'EXECUTE')
         OR has_function_privilege('authenticated',p.oid,'EXECUTE')
         OR md5(pg_get_functiondef(p.oid))<>'bdacb6a018dd13eefce470ab4b7de99d'))
     OR EXISTS (SELECT 1 FROM pg_class c
       WHERE c.oid='app_private.adventure_battles'::regclass
         AND (c.relowner <> 'postgres'::regrole OR NOT c.relrowsecurity
           OR has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE')
           OR has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE')))
     OR EXISTS (SELECT 1 FROM pg_attribute a
       WHERE a.attrelid='app_private.adventure_battles'::regclass
         AND a.attnum>0 AND NOT a.attisdropped
         AND (has_column_privilege('anon','app_private.adventure_battles',a.attname,'INSERT,UPDATE')
           OR has_column_privilege('authenticated','app_private.adventure_battles',a.attname,'INSERT,UPDATE')))
     OR (SELECT count(*) FROM pg_attribute a
       WHERE a.attrelid='public.game_items'::regclass AND a.attnum>0 AND NOT a.attisdropped
         AND a.attname IN ('required_attribute','unlocks_node_id','level_required',
           'starter_class','boss_drop_level','atk_bonus','matk_bonus','def_bonus',
           'hp_bonus','mp_bonus','agi_bonus','effect'))<>12
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.game_items'::regclass)
     OR EXISTS (SELECT 1 FROM pg_policy p
       WHERE p.polrelid='public.game_items'::regclass AND p.polcmd<>'r'
         AND (0=ANY(p.polroles) OR 'anon'::regrole=ANY(p.polroles)
           OR 'authenticated'::regrole=ANY(p.polroles)))
     OR NOT EXISTS (SELECT 1 FROM pg_trigger t
       WHERE t.tgrelid='app_private.adventure_battles'::regclass
         AND t.tgname='adventure_boss_recipe_victory' AND t.tgenabled='O'
         AND t.tgfoid='app_private.on_boss_victory_recipe()'::regprocedure
         AND position('AFTER UPDATE OF status' IN pg_get_triggerdef(t.oid))>0
         AND position('old.status = ''fighting''::text' IN pg_get_triggerdef(t.oid))>0
         AND position('new.status = ''won''::text' IN pg_get_triggerdef(t.oid))>0)
     OR NOT EXISTS (SELECT 1 FROM pg_proc p
       WHERE p.oid='app_private.sync_auto_adventure()'::regprocedure
         AND p.proowner='postgres'::regrole AND p.prosecdef
         AND position('PERFORM 1 FROM public.profiles WHERE user_id=v_uid FOR UPDATE;'
           IN pg_get_functiondef(p.oid))>0
         AND position('PERFORM 1 FROM public.user_balance WHERE user_id=v_uid FOR UPDATE;'
           IN pg_get_functiondef(p.oid))
           > position('PERFORM 1 FROM public.profiles WHERE user_id=v_uid FOR UPDATE;'
             IN pg_get_functiondef(p.oid))
         AND position('UPDATE app_private.adventure_battles SET status='
           IN pg_get_functiondef(p.oid))
           > position('PERFORM 1 FROM public.user_balance WHERE user_id=v_uid FOR UPDATE;'
             IN pg_get_functiondef(p.oid)))
  THEN RAISE EXCEPTION 'CHEST_SOURCE_OR_ACL_DRIFT' USING ERRCODE='22023'; END IF;
END;
$guard$;

-- This table is the balancing surface. Contents are copied into each chest at
-- award time, so subsequent calibration cannot reroll an already earned chest.
CREATE TABLE app_private.adventure_chest_rules (
  rarity text PRIMARY KEY CHECK (rarity IN ('comum','raro','epico','lendario')),
  open_hours integer NOT NULL CHECK (open_hours IN (1,4,8,12)),
  gold_amount integer NOT NULL CHECK (gold_amount BETWEEN 1 AND 1000000),
  scrap_amount integer NOT NULL CHECK (scrap_amount BETWEEN 1 AND 1000),
  essence_amount integer NOT NULL CHECK (essence_amount BETWEEN 0 AND 1000),
  potion_amount integer NOT NULL CHECK (potion_amount BETWEEN 1 AND 100),
  equipment_chance_bps integer NOT NULL CHECK (equipment_chance_bps BETWEEN 0 AND 10000),
  overflow_scrap_bonus integer NOT NULL CHECK (overflow_scrap_bonus BETWEEN 0 AND 1000),
  CHECK ((rarity='comum' AND open_hours=1) OR (rarity='raro' AND open_hours=4)
    OR (rarity='epico' AND open_hours=8) OR (rarity='lendario' AND open_hours=12))
);
INSERT INTO app_private.adventure_chest_rules
  (rarity,open_hours,gold_amount,scrap_amount,essence_amount,potion_amount,
   equipment_chance_bps,overflow_scrap_bonus) VALUES
  ('comum',1,40,2,0,1,500,2),
  ('raro',4,120,5,1,2,1500,5),
  ('epico',8,300,12,3,3,3500,12),
  ('lendario',12,800,30,8,5,6000,30);

CREATE TABLE app_private.adventure_chest_cadence (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  next_eligible_at timestamptz NOT NULL
);

CREATE TABLE app_private.adventure_chests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  battle_id uuid NOT NULL UNIQUE, -- battle timeline rows may be pruned
  rarity text NOT NULL CHECK (rarity IN ('comum','raro','epico','lendario')),
  hero_class text NOT NULL,
  hero_level integer NOT NULL CHECK (hero_level >= 1),
  gold_amount integer NOT NULL CHECK (gold_amount > 0),
  scrap_amount integer NOT NULL CHECK (scrap_amount > 0),
  essence_material text NOT NULL CHECK (essence_material IN ('normal','desert','water','ice','fire')),
  essence_amount integer NOT NULL CHECK (essence_amount >= 0),
  potion_item_id uuid REFERENCES public.game_items(id) ON DELETE RESTRICT,
  potion_amount integer NOT NULL CHECK (potion_amount >= 0),
  equipment_item_id uuid REFERENCES public.game_items(id) ON DELETE RESTRICT,
  open_hours integer NOT NULL CHECK (open_hours IN (1,4,8,12)),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','opening','claimed')),
  acquired_at timestamptz NOT NULL,
  started_at timestamptz,
  ready_at timestamptz,
  claimed_at timestamptz,
  CHECK ((status='queued' AND started_at IS NULL AND ready_at IS NULL AND claimed_at IS NULL)
      OR (status='opening' AND started_at IS NOT NULL AND ready_at IS NOT NULL AND claimed_at IS NULL)
      OR (status='claimed' AND started_at IS NOT NULL AND ready_at IS NOT NULL AND claimed_at IS NOT NULL)),
  CHECK ((rarity='comum' AND open_hours=1) OR (rarity='raro' AND open_hours=4)
    OR (rarity='epico' AND open_hours=8) OR (rarity='lendario' AND open_hours=12)),
  CHECK (ready_at IS NULL OR ready_at=started_at+make_interval(hours=>open_hours))
);
CREATE UNIQUE INDEX adventure_chests_one_opening
  ON app_private.adventure_chests(user_id) WHERE status='opening';
CREATE INDEX adventure_chests_queue ON app_private.adventure_chests(user_id,acquired_at,id)
  WHERE status<>'claimed';

CREATE TABLE app_private.adventure_chest_win_receipts (
  battle_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ended_at timestamptz NOT NULL,
  disposition text NOT NULL CHECK (disposition IN ('queued','overflow')),
  rarity text NOT NULL CHECK (rarity IN ('comum','raro','epico','lendario')),
  chest_id uuid UNIQUE REFERENCES app_private.adventure_chests(id),
  frozen_loot jsonb NOT NULL,
  overflow_gold integer NOT NULL DEFAULT 0 CHECK (overflow_gold >= 0),
  overflow_scrap integer NOT NULL DEFAULT 0 CHECK (overflow_scrap >= 0),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((disposition='queued' AND chest_id IS NOT NULL)
      OR (disposition='overflow' AND chest_id IS NULL))
);
CREATE INDEX adventure_chest_overflow_user
  ON app_private.adventure_chest_win_receipts(user_id,recorded_at DESC)
  WHERE disposition='overflow';

CREATE TABLE app_private.adventure_chest_claim_receipts (
  chest_id uuid PRIMARY KEY REFERENCES app_private.adventure_chests(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payout jsonb NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

DO $tables$ DECLARE v_name text; BEGIN
  FOREACH v_name IN ARRAY ARRAY['adventure_chest_rules','adventure_chest_cadence',
    'adventure_chests','adventure_chest_win_receipts','adventure_chest_claim_receipts'] LOOP
    EXECUTE format('ALTER TABLE app_private.%I ENABLE ROW LEVEL SECURITY',v_name);
    EXECUTE format('REVOKE ALL ON app_private.%I FROM PUBLIC, anon, authenticated',v_name);
  END LOOP;
END $tables$;

CREATE FUNCTION app_private.adventure_chest_roll(p_id uuid,p_salt text)
RETURNS integer LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path = '' AS $fn$
  SELECT ((get_byte(decode(md5(p_id::text||':'||p_salt),'hex'),0)*16777216::bigint
    + get_byte(decode(md5(p_id::text||':'||p_salt),'hex'),1)*65536::bigint
    + get_byte(decode(md5(p_id::text||':'||p_salt),'hex'),2)*256::bigint
    + get_byte(decode(md5(p_id::text||':'||p_salt),'hex'),3)) % 10000)::integer;
$fn$;
REVOKE ALL ON FUNCTION app_private.adventure_chest_roll(uuid,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION app_private.adventure_chest_frozen_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
  IF (OLD.id,OLD.user_id,OLD.battle_id,OLD.rarity,OLD.hero_class,OLD.hero_level,
      OLD.gold_amount,OLD.scrap_amount,OLD.essence_material,OLD.essence_amount,
      OLD.potion_item_id,OLD.potion_amount,OLD.equipment_item_id,OLD.open_hours,OLD.acquired_at)
     IS DISTINCT FROM
     (NEW.id,NEW.user_id,NEW.battle_id,NEW.rarity,NEW.hero_class,NEW.hero_level,
      NEW.gold_amount,NEW.scrap_amount,NEW.essence_material,NEW.essence_amount,
      NEW.potion_item_id,NEW.potion_amount,NEW.equipment_item_id,NEW.open_hours,NEW.acquired_at)
    OR (OLD.status='opening' AND NEW.status<>'claimed')
    OR (OLD.status='claimed' AND NEW.status<>'claimed')
    OR (OLD.started_at IS NOT NULL AND OLD.started_at IS DISTINCT FROM NEW.started_at)
    OR (OLD.ready_at IS NOT NULL AND OLD.ready_at IS DISTINCT FROM NEW.ready_at)
    OR (OLD.claimed_at IS NOT NULL AND OLD.claimed_at IS DISTINCT FROM NEW.claimed_at) THEN
    RAISE EXCEPTION 'CHEST_FROZEN' USING ERRCODE='22023';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION app_private.adventure_chest_frozen_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER adventure_chest_frozen
  BEFORE UPDATE ON app_private.adventure_chests FOR EACH ROW
  EXECUTE FUNCTION app_private.adventure_chest_frozen_guard();

-- The name sorts before adventure_boss_recipe_victory. On overflow this
-- credits the balance before the recipe trigger touches material balances.
CREATE FUNCTION app_private.on_adventure_chest_win()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_next timestamptz;
  v_roll integer;
  v_rarity text;
  v_rule app_private.adventure_chest_rules%ROWTYPE;
  v_essence text;
  v_potion uuid;
  v_potion_count integer;
  v_equipment uuid;
  v_equipment_count integer;
  v_equipment_rarity integer;
  v_equipment_class text;
  v_chest uuid;
  v_occupied integer;
  v_scrap integer;
  v_loot jsonb;
BEGIN
  -- Each battle ID is permanent even after timeline pruning. The sync owns
  -- the profile lock before this trigger and the battle row is already locked.
  IF EXISTS (SELECT 1 FROM app_private.adventure_chest_win_receipts WHERE battle_id=NEW.id) THEN
    RETURN NEW;
  END IF;
  SELECT next_eligible_at INTO v_next FROM app_private.adventure_chest_cadence
    WHERE user_id=NEW.user_id;
  IF v_next IS NOT NULL AND NEW.ends_at<v_next THEN
    RETURN NEW;
  END IF;
  INSERT INTO app_private.adventure_chest_cadence(user_id,next_eligible_at)
    VALUES(NEW.user_id,NEW.ends_at+interval '30 minutes')
    ON CONFLICT (user_id) DO UPDATE SET next_eligible_at=EXCLUDED.next_eligible_at;

  v_roll := app_private.adventure_chest_roll(NEW.id,'rarity');
  v_rarity := CASE WHEN v_roll<7200 THEN 'comum' WHEN v_roll<9200 THEN 'raro'
                   WHEN v_roll<9900 THEN 'epico' ELSE 'lendario' END;
  IF NEW.kind='boss' AND v_rarity='comum' THEN v_rarity:='raro'; END IF;
  SELECT * INTO STRICT v_rule FROM app_private.adventure_chest_rules WHERE rarity=v_rarity;
  v_essence := CASE NEW.biome WHEN 'desert' THEN 'desert' WHEN 'aquatic' THEN 'water'
                WHEN 'ice' THEN 'ice' WHEN 'volcanic' THEN 'fire' ELSE 'normal' END;
  v_equipment_class:=NEW.hero_class;
  -- Current class authority renders a clérigo's combat snapshot as novato.
  -- The protected starter identity resolves that one case; an apprentice or
  -- unchosen novice receives the guaranteed contents without unsuitable gear.
  IF v_equipment_class='novato' THEN
    SELECT CASE WHEN lower(p.starter_class)='clerico' THEN 'clerico' ELSE 'novato' END
      INTO v_equipment_class FROM public.profiles p WHERE p.user_id=NEW.user_id;
  END IF;
  SELECT id INTO v_potion FROM public.game_items
    WHERE category='consumable' AND is_consumable AND stackable
      AND effect='heal_30' AND level_required<=NEW.hero_level
    ORDER BY id LIMIT 1;
  v_potion_count := CASE WHEN v_potion IS NULL THEN 0 ELSE v_rule.potion_amount END;
  IF v_equipment_class IN ('guerreiro','mago','gatuno','arqueiro','ferreiro','clerico')
     AND app_private.adventure_chest_roll(NEW.id,'equipment')<v_rule.equipment_chance_bps THEN
    v_equipment_rarity := CASE v_rarity WHEN 'comum' THEN 1 WHEN 'raro' THEN 3
                          WHEN 'epico' THEN 4 ELSE 5 END;
    SELECT count(*) INTO v_equipment_count FROM public.game_items i
      WHERE i.category IN ('weapon','armor','accessory') AND NOT i.is_consumable
        AND i.effect IS NULL AND NOT i.is_starter AND i.boss_drop_level IS NULL
        AND i.required_attribute IS NULL AND i.unlocks_node_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM app_private.boss_recipe_catalog r WHERE r.item_id=i.id)
        AND i.level_required<=NEW.hero_level
        AND (i.starter_class IS NULL OR lower(i.starter_class)=v_equipment_class)
        AND CASE lower(i.rarity) WHEN 'comum' THEN 1 WHEN 'incomum' THEN 2
              WHEN 'raro' THEN 3 WHEN 'epico' THEN 4 WHEN 'lendario' THEN 5 ELSE 99 END
            <=v_equipment_rarity
        AND (CASE WHEN v_equipment_class IN ('mago','clerico') THEN
             i.matk_bonus>0 OR (i.category<>'weapon' AND
               (i.def_bonus>0 OR i.hp_bonus>0 OR i.mp_bonus>0))
           ELSE i.atk_bonus>0 OR (i.category<>'weapon' AND
               (i.def_bonus>0 OR i.hp_bonus>0 OR i.agi_bonus>0)) END);
    IF v_equipment_count>0 THEN
      SELECT i.id INTO v_equipment FROM public.game_items i
        WHERE i.category IN ('weapon','armor','accessory') AND NOT i.is_consumable
          AND i.effect IS NULL AND NOT i.is_starter AND i.boss_drop_level IS NULL
          AND i.required_attribute IS NULL AND i.unlocks_node_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM app_private.boss_recipe_catalog r WHERE r.item_id=i.id)
          AND i.level_required<=NEW.hero_level
          AND (i.starter_class IS NULL OR lower(i.starter_class)=v_equipment_class)
          AND CASE lower(i.rarity) WHEN 'comum' THEN 1 WHEN 'incomum' THEN 2
                WHEN 'raro' THEN 3 WHEN 'epico' THEN 4 WHEN 'lendario' THEN 5 ELSE 99 END
              <=v_equipment_rarity
          AND (CASE WHEN v_equipment_class IN ('mago','clerico') THEN
               i.matk_bonus>0 OR (i.category<>'weapon' AND
                 (i.def_bonus>0 OR i.hp_bonus>0 OR i.mp_bonus>0))
             ELSE i.atk_bonus>0 OR (i.category<>'weapon' AND
                 (i.def_bonus>0 OR i.hp_bonus>0 OR i.agi_bonus>0)) END)
        ORDER BY CASE lower(i.rarity) WHEN 'lendario' THEN 5 WHEN 'epico' THEN 4
                   WHEN 'raro' THEN 3 WHEN 'incomum' THEN 2 ELSE 1 END DESC,i.id
        OFFSET app_private.adventure_chest_roll(NEW.id,'item') % v_equipment_count LIMIT 1;
    END IF;
  END IF;
  -- If a potion disappears from the catalog, its guaranteed value becomes
  -- scrap. The battle must still settle and the missing reward is visible.
  v_scrap := v_rule.scrap_amount+CASE WHEN v_potion IS NULL THEN v_rule.potion_amount ELSE 0 END;
  v_loot := jsonb_build_object('gold',v_rule.gold_amount,'scrap',v_scrap,
    'essence_material',v_essence,'essence',v_rule.essence_amount,
    'potion_item_id',v_potion,'potions',v_potion_count,
    'equipment_item_id',v_equipment,'battle_hero_class',NEW.hero_class,
    'equipment_class',v_equipment_class,'hero_level',NEW.hero_level,'xp',0);
  SELECT count(*) INTO v_occupied FROM app_private.adventure_chests
    WHERE user_id=NEW.user_id AND status<>'claimed';
  IF v_occupied<4 THEN
    INSERT INTO app_private.adventure_chests
      (user_id,battle_id,rarity,hero_class,hero_level,gold_amount,scrap_amount,
       essence_material,essence_amount,potion_item_id,potion_amount,
       equipment_item_id,open_hours,acquired_at)
    VALUES(NEW.user_id,NEW.id,v_rarity,v_equipment_class,NEW.hero_level,
      v_rule.gold_amount,v_scrap,v_essence,v_rule.essence_amount,
      v_potion,v_potion_count,v_equipment,v_rule.open_hours,NEW.ends_at)
    RETURNING id INTO v_chest;
    INSERT INTO app_private.adventure_chest_win_receipts
      (battle_id,user_id,ended_at,disposition,rarity,chest_id,frozen_loot)
    VALUES(NEW.id,NEW.user_id,NEW.ends_at,'queued',v_rarity,v_chest,v_loot);
  ELSE
    -- Full slots turn every rarity into its frozen gold and materials. Extra
    -- scrap pays for potions/equipment that no longer fit in the queue.
    v_scrap := v_scrap+v_rule.overflow_scrap_bonus+v_potion_count
      +CASE WHEN v_equipment IS NULL THEN 0 ELSE v_rule.overflow_scrap_bonus END;
    INSERT INTO public.user_balance(user_id,gold) VALUES(NEW.user_id,100)
      ON CONFLICT(user_id) DO NOTHING;
    UPDATE public.user_balance SET gold=gold+v_rule.gold_amount,
      updated_at=clock_timestamp() WHERE user_id=NEW.user_id;
    INSERT INTO public.gold_history(user_id,type,amount,reason)
      VALUES(NEW.user_id,'adventure_chest_overflow',v_rule.gold_amount,
        'Baú excedente da etapa '||NEW.stage);
    PERFORM app_private.credit_adventure_material(NEW.user_id,'scrap',v_scrap,
      'chest_overflow',NEW.id);
    IF v_rule.essence_amount>0 THEN
      PERFORM app_private.credit_adventure_material(NEW.user_id,v_essence,
        v_rule.essence_amount,'chest_overflow',NEW.id);
    END IF;
    INSERT INTO app_private.adventure_chest_win_receipts
      (battle_id,user_id,ended_at,disposition,rarity,frozen_loot,overflow_gold,overflow_scrap)
    VALUES(NEW.id,NEW.user_id,NEW.ends_at,'overflow',v_rarity,v_loot,
      v_rule.gold_amount,v_scrap);
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION app_private.on_adventure_chest_win() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER adventure_00_chest_win
  AFTER UPDATE OF status ON app_private.adventure_battles
  FOR EACH ROW WHEN (OLD.status='fighting' AND NEW.status='won')
  EXECUTE FUNCTION app_private.on_adventure_chest_win();

CREATE FUNCTION app_private.adventure_chest_payload(p_chest app_private.adventure_chests)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
  SELECT jsonb_build_object('id',p_chest.id,'rarity',p_chest.rarity,
    'status',p_chest.status,'acquired_at',p_chest.acquired_at,
    'started_at',p_chest.started_at,'ready_at',p_chest.ready_at,
    'minimum',jsonb_build_object('gold',p_chest.gold_amount,'scrap',p_chest.scrap_amount,
      'essence_material',p_chest.essence_material,'essence',p_chest.essence_amount,
      'potions',p_chest.potion_amount),
    'open_hours',p_chest.open_hours);
$fn$;
REVOKE ALL ON FUNCTION app_private.adventure_chest_payload(app_private.adventure_chests)
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.get_adventure_chests()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_user uuid := auth.uid(); v_now timestamptz := clock_timestamp();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE='28000'; END IF;
  RETURN jsonb_build_object('server_now',v_now,'slots_total',4,
    'occupied',(SELECT count(*) FROM app_private.adventure_chests
      WHERE user_id=v_user AND status<>'claimed'),
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
END;
$fn$;
REVOKE ALL ON FUNCTION public.get_adventure_chests() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_adventure_chests() TO authenticated;

CREATE FUNCTION public.start_adventure_chest(p_chest_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_user uuid := auth.uid(); v_chest app_private.adventure_chests%ROWTYPE;
        v_now timestamptz;
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
      'chest',app_private.adventure_chest_payload(v_chest));
  END IF;
  IF v_chest.status<>'queued' THEN RAISE EXCEPTION 'CHEST_ALREADY_CLAIMED' USING ERRCODE='22023'; END IF;
  IF EXISTS (SELECT 1 FROM app_private.adventure_chests
      WHERE user_id=v_user AND status='opening') THEN
    RAISE EXCEPTION 'CHEST_OPENING_ACTIVE' USING ERRCODE='22023';
  END IF;
  UPDATE app_private.adventure_chests
    SET status='opening',started_at=v_now,ready_at=v_now+make_interval(hours=>v_chest.open_hours)
    WHERE id=p_chest_id RETURNING * INTO v_chest;
  RETURN jsonb_build_object('ok',true,'replayed',false,'server_now',v_now,
    'chest',app_private.adventure_chest_payload(v_chest));
END;
$fn$;
REVOKE ALL ON FUNCTION public.start_adventure_chest(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.start_adventure_chest(uuid) TO authenticated;

CREATE FUNCTION public.claim_adventure_chest(p_chest_id uuid)
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
    RETURN jsonb_build_object('ok',true,'replayed',true,'receipt',v_payout);
  END IF;
  v_now := clock_timestamp();
  IF v_chest.status<>'opening' THEN RAISE EXCEPTION 'CHEST_NOT_OPENING' USING ERRCODE='22023'; END IF;
  IF v_now<v_chest.ready_at THEN RAISE EXCEPTION 'CHEST_NOT_READY' USING ERRCODE='22023'; END IF;

  -- Profile -> balance -> material -> inventory. Every mutation and the receipt
  -- commit together; a second tab waits on the profile and reads the receipt.
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
    'claimed_at',v_now,'gold',v_chest.gold_amount,'scrap',v_chest.scrap_amount,
    'essence_material',v_chest.essence_material,'essence',v_chest.essence_amount,
    'potion_item_id',v_chest.potion_item_id,'potions',v_chest.potion_amount,
    'equipment',CASE WHEN v_chest.equipment_item_id IS NULL THEN NULL
      ELSE jsonb_build_object('id',v_item.id,'name',v_item.name,'icon',v_item.icon,
        'rarity',v_item.rarity,'level_required',v_item.level_required) END,
    'xp',0);
  INSERT INTO app_private.adventure_chest_claim_receipts(chest_id,user_id,payout,claimed_at)
    VALUES(v_chest.id,v_user,v_payout,v_now);
  UPDATE app_private.adventure_chests SET status='claimed',claimed_at=v_now
    WHERE id=v_chest.id;
  RETURN jsonb_build_object('ok',true,'replayed',false,'receipt',v_payout);
END;
$fn$;
REVOKE ALL ON FUNCTION public.claim_adventure_chest(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.claim_adventure_chest(uuid) TO authenticated;
COMMIT;
