BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- Source hashes are LF-normalized pg_get_functiondef from the composed PG17
-- horde + mage + auto-potions chain through 20261029043726. The subsequent
-- mission migration is independent of these functions in the reduced clone.
DO $preflight$
DECLARE v_bad text;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'PET_CARE_OWNER_DRIFT: %',current_user USING ERRCODE='22023';
  END IF;
  SELECT e.signature INTO v_bad FROM (VALUES
    ('app_private.sync_auto_adventure()', '0ff67dedf2dbc3fe216293c3e794372b', true, 'v', '{postgres=X/postgres,authenticated=X/postgres}',true,false),
    ('app_private.adventure_simulate_horde_potions(timestamptz,integer,integer,integer,integer,jsonb,jsonb,text,integer,jsonb,jsonb,jsonb)', 'f38543725dc3306fc2fb882e5c17fce0', false, 's', '{postgres=X/postgres}',false,false),
    ('public.consume_inventory_item(uuid)', '758fca4a260de7aea24758c03b9ffafd', true, 'v', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}',true,true),
    ('app_private.adventure_pet_at(uuid,timestamptz)', '6c7e7df6f03a7e2daded80dfaa215311', true, 's', '{postgres=X/postgres}',false,false),
    ('app_private.adventure_pet_catalog(text)', 'a71c1785c5e9fc32705e5156f1064824', false, 'i', '{postgres=X/postgres}',false,false),
    ('app_private.adventure_pet_sustain(text)', '460737d8e9028610bb97b2fa2dbb538b', false, 'i', '{postgres=X/postgres}',false,false),
    ('public.purchase_game_item(uuid,uuid)', 'b7fdf1a6af2cf4a79f6ed77c45a48768', true, 'v', '{postgres=X/postgres,authenticated=X/postgres}',true,false),
    ('public.get_adventure_pet_state()', '14f3543f91af76d43d305d0e97493617', true, 's', '{postgres=X/postgres,authenticated=X/postgres}',true,false),
    ('public.set_active_adventure_pet(uuid)', 'a26f64671d2c9d49ebf019ea65bd1a94', true, 'v', '{postgres=X/postgres,authenticated=X/postgres}',true,false),
    ('public._guard_inventory_forage_pet()', '423398434368af62d442377478d76e15', false, 'v', '{postgres=X/postgres,service_role=X/postgres}',false,true)
  ) e(signature,body_md5,security_definer,volatility,acl,auth_execute,service_execute)
  LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)
  WHERE p.oid IS NULL OR md5(replace(pg_get_functiondef(p.oid),chr(13)||chr(10),chr(10)))<>e.body_md5
    OR p.proowner<>'postgres'::regrole OR p.prosecdef<>e.security_definer
    OR p.provolatile<>e.volatility::"char" OR p.proacl::text IS DISTINCT FROM e.acl
    OR p.proconfig IS DISTINCT FROM CASE WHEN e.signature IN
      ('public.consume_inventory_item(uuid)','public.purchase_game_item(uuid,uuid)',
       'public._guard_inventory_forage_pet()')
       THEN ARRAY['search_path=pg_catalog, public']::text[] ELSE ARRAY['search_path=""']::text[] END
    OR has_function_privilege('anon',p.oid,'EXECUTE')
    OR has_function_privilege('authenticated',p.oid,'EXECUTE') IS DISTINCT FROM e.auth_execute
    OR has_function_privilege('service_role',p.oid,'EXECUTE') IS DISTINCT FROM e.service_execute
  LIMIT 1;
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'PET_CARE_SOURCE_OR_ACL_DRIFT: %',v_bad USING ERRCODE='22023'; END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE (n.nspname,p.proname) IN (VALUES
        ('app_private','sync_auto_adventure'),('app_private','adventure_simulate_horde_potions'),
        ('public','consume_inventory_item'),('app_private','adventure_pet_at'),
        ('app_private','adventure_pet_catalog'),('app_private','adventure_pet_sustain'),
        ('public','purchase_game_item'),('public','get_adventure_pet_state'),
        ('public','set_active_adventure_pet'),('public','_guard_inventory_forage_pet')))<>10
    OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE (n.nspname,p.proname) IN (VALUES
        ('public','get_pet_food_catalog'),('public','buy_pet_food'),
        ('public','get_pet_food_purchase_receipt'),('public','interact_pet_care'),
        ('public','get_pet_care_state'),('app_private','settle_pet_care'),
        ('app_private','pet_care_snapshot'),('app_private','pet_care_participation'),
        ('app_private','pet_care_on_acquisition')))
    OR to_regclass('app_private.pet_food_catalog') IS NOT NULL
    OR to_regclass('app_private.pet_care_state') IS NOT NULL
  THEN RAISE EXCEPTION 'PET_CARE_OVERLOAD_OR_OBJECT_DRIFT' USING ERRCODE='22023'; END IF;
  -- Default grants to a parent role survive REVOKE from anon/authenticated.
  -- MEMBER includes nested and non-inheriting memberships (SET ROLE paths).
  IF EXISTS (SELECT 1 FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
      WHERE d.defaclrole='postgres'::regrole
        AND ((d.defaclobjtype='r' AND (d.defaclnamespace=0 OR n.nspname='app_private'))
          OR (d.defaclobjtype='f' AND (d.defaclnamespace=0 OR n.nspname IN ('public','app_private')))
          OR (d.defaclobjtype='r' AND n.nspname='public'
            AND EXISTS (SELECT 1 FROM aclexplode(d.defaclacl) x
              WHERE x.privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE'))))
        AND EXISTS (SELECT 1 FROM aclexplode(d.defaclacl) a
          WHERE CASE WHEN a.grantee=0 THEN true ELSE
            pg_has_role('anon'::regrole,a.grantee,'MEMBER')
            OR pg_has_role('authenticated'::regrole,a.grantee,'MEMBER') END))
    OR EXISTS (SELECT 1 FROM (VALUES ('public.user_inventory'::regclass),
      ('public.game_items'::regclass),('public.user_balance'::regclass),
      ('public.gold_history'::regclass),('public.companions'::regclass)) t(oid)
      JOIN pg_class c ON c.oid=t.oid
      WHERE c.relowner<>'postgres'::regrole OR NOT c.relrowsecurity)
    OR has_table_privilege('authenticated','public.user_inventory','INSERT')
    OR has_table_privilege('authenticated','public.user_inventory','UPDATE')
    OR has_table_privilege('authenticated','public.user_inventory','DELETE')
    OR has_table_privilege('authenticated','public.user_balance','UPDATE')
    OR has_table_privilege('authenticated','public.gold_history','INSERT')
    OR has_table_privilege('authenticated','public.game_items','INSERT')
    OR has_table_privilege('authenticated','public.game_items','UPDATE')
    OR has_table_privilege('authenticated','public.game_items','DELETE')
    OR has_table_privilege('authenticated','public.companions','INSERT')
    OR has_table_privilege('anon','public.companions','UPDATE')
    OR EXISTS (SELECT 1 FROM pg_attribute a
      WHERE a.attrelid IN ('public.game_items'::regclass,'public.user_inventory'::regclass)
        AND a.attnum>0 AND NOT a.attisdropped
        AND (has_column_privilege('anon',a.attrelid,a.attname,'INSERT')
          OR has_column_privilege('anon',a.attrelid,a.attname,'UPDATE')
          OR has_column_privilege('authenticated',a.attrelid,a.attname,'INSERT')
          OR has_column_privilege('authenticated',a.attrelid,a.attname,'UPDATE')))
    OR NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid='public.companions'::regclass
      AND t.tgname='guard_inventory_forage_pet' AND t.tgenabled='O'
      AND t.tgfoid='public._guard_inventory_forage_pet()'::regprocedure
      AND t.tgqual IS NULL AND t.tgtype=19 AND t.tgattr::text='')
  THEN RAISE EXCEPTION 'PET_CARE_TABLE_OR_DEFAULT_ACL_DRIFT' USING ERRCODE='22023'; END IF;
END $preflight$;

CREATE TABLE app_private.pet_food_catalog (
  pet_type text PRIMARY KEY,
  item_id uuid NOT NULL UNIQUE REFERENCES public.game_items(id) ON DELETE RESTRICT,
  unit_price integer NOT NULL CHECK (unit_price>0),
  enabled boolean NOT NULL DEFAULT true
);
ALTER TABLE app_private.pet_food_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.pet_food_catalog FROM PUBLIC,anon,authenticated,service_role;

-- Reserved IDs make the SKU mapping reviewable without a name lookup.
INSERT INTO public.game_items(id,name,description,category,rarity,icon,effect,
  is_starter,shop_price,stackable,is_consumable,level_required)
SELECT ('b45e1000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'Alimento para '||label,'Uma refeição para '||label||'.',
  'consumable','comum','🥣',NULL,false,NULL,true,true,1
FROM (VALUES
  (1,'dog','Cachorro'),(2,'cat','Gato'),(3,'calopsita','Calopsita'),
  (4,'spirit_fox','Raposa espiritual'),(5,'golem_guardian','Golem guardião'),
  (6,'mini_relampago','Mini Relâmpago'),(7,'mini_leviata','Mini Leviatã'),
  (8,'mini_kraken','Mini Kraken'),(9,'mini_dragao_sombrio','Mini Dragão Sombrio'),
  (10,'mini_demonio_fome','Mini Demônio da Fome'),
  (11,'mini_necromante','Mini Necromante'),(12,'mini_wyrm_gelo','Mini Wyrm de Gelo'),
  (13,'skeleton_pup','Filhote esqueleto')) sku(n,pet_type,label);
INSERT INTO app_private.pet_food_catalog(pet_type,item_id,unit_price)
SELECT pet_type,('b45e1000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,25
FROM (VALUES
  (1,'dog'),(2,'cat'),(3,'calopsita'),(4,'spirit_fox'),
  (5,'golem_guardian'),(6,'mini_relampago'),(7,'mini_leviata'),
  (8,'mini_kraken'),(9,'mini_dragao_sombrio'),(10,'mini_demonio_fome'),
  (11,'mini_necromante'),(12,'mini_wyrm_gelo'),(13,'skeleton_pup')) sku(n,pet_type);

CREATE TABLE app_private.pet_care_state (
  companion_id uuid PRIMARY KEY REFERENCES public.companions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pet_type text NOT NULL,
  baseline_at timestamptz NOT NULL,
  next_feed_at timestamptz NOT NULL,
  last_feed_at timestamptz NOT NULL,
  last_care_at timestamptz NOT NULL,
  settled_through_at timestamptz NOT NULL
);
CREATE INDEX pet_care_state_user ON app_private.pet_care_state(user_id,companion_id);
CREATE INDEX pet_care_state_due ON app_private.pet_care_state(user_id,next_feed_at);
ALTER TABLE app_private.pet_care_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.pet_care_state FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE app_private.pet_feed_receipts (
  companion_id uuid NOT NULL REFERENCES public.companions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.game_items(id) ON DELETE RESTRICT,
  event_at timestamptz NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity=1),
  PRIMARY KEY (companion_id,event_at)
);
CREATE INDEX pet_feed_receipts_asof ON app_private.pet_feed_receipts(companion_id,event_at DESC);
ALTER TABLE app_private.pet_feed_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.pet_feed_receipts FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE app_private.pet_care_events (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  companion_id uuid NOT NULL REFERENCES public.companions(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('care','play')),
  effective boolean NOT NULL,
  event_at timestamptz,
  requested_at timestamptz NOT NULL,
  PRIMARY KEY (user_id,request_id),
  CHECK ((effective AND event_at IS NOT NULL) OR (NOT effective AND event_at IS NULL))
);
CREATE INDEX pet_care_events_asof ON app_private.pet_care_events(companion_id,event_at DESC)
  WHERE effective;
ALTER TABLE app_private.pet_care_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.pet_care_events FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE app_private.pet_food_purchase_requests (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  pet_type text NOT NULL,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 30),
  unit_price integer NOT NULL,
  total integer NOT NULL,
  item_id uuid NOT NULL REFERENCES public.game_items(id) ON DELETE RESTRICT,
  gold_after integer NOT NULL,
  stock_after integer NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (user_id,request_id)
);
ALTER TABLE app_private.pet_food_purchase_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.pet_food_purchase_requests FROM PUBLIC,anon,authenticated,service_role;

-- Existing pets start at this cutover; new pets start at server acquisition.
INSERT INTO app_private.pet_care_state
  (companion_id,user_id,pet_type,baseline_at,next_feed_at,last_feed_at,last_care_at,settled_through_at)
SELECT c.id,c.user_id,c.companion_type,t.at,t.at+interval '24 hours',t.at,t.at,t.at
FROM public.companions c CROSS JOIN (SELECT clock_timestamp() AS at) t;

CREATE FUNCTION app_private.pet_care_on_acquisition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $trigger$
DECLARE v_at timestamptz:=clock_timestamp();
BEGIN
  INSERT INTO app_private.pet_care_state
    (companion_id,user_id,pet_type,baseline_at,next_feed_at,last_feed_at,last_care_at,settled_through_at)
  VALUES(NEW.id,NEW.user_id,NEW.companion_type,v_at,v_at+interval '24 hours',v_at,v_at,v_at);
  RETURN NEW;
END $trigger$;
CREATE TRIGGER pet_care_on_acquisition AFTER INSERT ON public.companions
FOR EACH ROW EXECUTE FUNCTION app_private.pet_care_on_acquisition();
REVOKE ALL ON FUNCTION app_private.pet_care_on_acquisition() FROM PUBLIC,anon,authenticated,service_role;

-- The caller already owns the profile lock in adventure/buy/care RPCs. Taking
-- it again keeps this helper safe if called from a future internal path.
CREATE FUNCTION app_private.settle_pet_care(p_user uuid,p_until timestamptz)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $settle$
DECLARE v_pet app_private.pet_care_state%ROWTYPE;
  v_item uuid; v_stock integer; v_due bigint; v_take integer;
  v_last timestamptz;
BEGIN
  IF p_user IS NULL OR p_until IS NULL OR p_until>clock_timestamp()+interval '1 second' THEN
    RAISE EXCEPTION 'PET_CARE_INVALID_CLOCK' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM public.profiles WHERE user_id=p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND' USING ERRCODE='22023'; END IF;
  FOR v_pet IN SELECT * FROM app_private.pet_care_state s
    WHERE s.user_id=p_user AND s.next_feed_at<=p_until
      AND s.settled_through_at<p_until
    ORDER BY s.companion_id FOR UPDATE LOOP
    v_due:=CASE WHEN p_until>=v_pet.next_feed_at
      THEN floor(extract(epoch FROM (p_until-v_pet.next_feed_at))/86400)::bigint+1
      ELSE 0 END;
    IF v_due>0 THEN
      SELECT f.item_id,ui.quantity INTO v_item,v_stock
      FROM app_private.pet_food_catalog f
      JOIN public.user_inventory ui ON ui.item_id=f.item_id AND ui.user_id=p_user
      WHERE f.pet_type=v_pet.pet_type AND f.enabled AND ui.quantity>0
      FOR UPDATE OF ui;
      v_take:=least(v_due,coalesce(v_stock,0))::integer;
      -- Receipt generation is set-based and capped. No loop per missed day.
      IF v_take>4096 THEN RAISE EXCEPTION 'PET_CARE_RECEIPT_LIMIT' USING ERRCODE='54000'; END IF;
      IF v_take>0 THEN
        INSERT INTO app_private.pet_feed_receipts(companion_id,user_id,item_id,event_at)
        SELECT v_pet.companion_id,p_user,v_item,
          v_pet.next_feed_at+g.n*interval '24 hours'
        FROM generate_series(0,v_take-1) AS g(n);
        v_last:=v_pet.next_feed_at+(v_take-1)*interval '24 hours';
        IF v_take=v_stock THEN
          DELETE FROM public.user_inventory WHERE user_id=p_user AND item_id=v_item;
        ELSE
          UPDATE public.user_inventory SET quantity=quantity-v_take
            WHERE user_id=p_user AND item_id=v_item;
        END IF;
        v_pet.last_feed_at:=v_last;
      END IF;
      v_pet.next_feed_at:=v_pet.next_feed_at+v_due*interval '24 hours';
    END IF;
    UPDATE app_private.pet_care_state SET next_feed_at=v_pet.next_feed_at,
      last_feed_at=v_pet.last_feed_at,settled_through_at=p_until
      WHERE companion_id=v_pet.companion_id;
  END LOOP;
END $settle$;
REVOKE ALL ON FUNCTION app_private.settle_pet_care(uuid,timestamptz)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION app_private.pet_care_participation(p_companion uuid,p_as_of timestamptz)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $part$
DECLARE v_state app_private.pet_care_state%ROWTYPE;
  v_feed timestamptz; v_care timestamptz;
  v_feed_hours numeric; v_care_hours numeric;
BEGIN
  SELECT * INTO v_state FROM app_private.pet_care_state WHERE companion_id=p_companion;
  IF NOT FOUND OR p_as_of<=v_state.baseline_at THEN RETURN 1; END IF;
  SELECT max(r.event_at) INTO v_feed FROM app_private.pet_feed_receipts r
    WHERE r.companion_id=p_companion AND r.event_at<=p_as_of;
  SELECT max(e.event_at) INTO v_care FROM app_private.pet_care_events e
    WHERE e.companion_id=p_companion AND e.effective AND e.event_at<=p_as_of;
  v_feed_hours:=greatest(0,extract(epoch FROM (p_as_of-coalesce(v_feed,v_state.baseline_at)))/3600);
  v_care_hours:=greatest(0,extract(epoch FROM (p_as_of-coalesce(v_care,v_state.baseline_at)))/3600);
  RETURN round(least(
    greatest(0.5,1-0.5*greatest(0,v_feed_hours-24)/48),
    greatest(0.5,1-0.5*greatest(0,v_care_hours-24)/48)),6);
END $part$;
REVOKE ALL ON FUNCTION app_private.pet_care_participation(uuid,timestamptz)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION app_private.pet_care_snapshot(p_pet jsonb,p_as_of timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $snapshot$
DECLARE v_part numeric; v_bonus jsonb; v_sustain jsonb;
BEGIN
  IF p_pet IS NULL THEN RETURN NULL; END IF;
  v_part:=app_private.pet_care_participation((p_pet->>'companion_id')::uuid,p_as_of);
  v_bonus:=jsonb_set(p_pet->'bonus','{pct}',
    to_jsonb(round((p_pet->'bonus'->>'pct')::numeric*v_part,6)));
  IF p_pet->'sustain' IS NOT NULL AND p_pet->'sustain'<>'null'::jsonb THEN
    v_sustain:=jsonb_set(p_pet->'sustain','{pct}',
      to_jsonb(round((p_pet->'sustain'->>'pct')::numeric*v_part,6)));
  END IF;
  RETURN p_pet||jsonb_build_object('participation',v_part,'care_as_of',p_as_of,
    'effective_bonus',v_bonus,'effective_sustain',v_sustain);
END $snapshot$;
REVOKE ALL ON FUNCTION app_private.pet_care_snapshot(jsonb,timestamptz)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.get_pet_food_catalog()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $get$
DECLARE v_uid uuid:=auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('pet_type',f.pet_type,
    'item_id',f.item_id,'name',i.name,'unit_price',f.unit_price,
    'owned',true,'quantity',coalesce(ui.quantity,0)) ORDER BY f.pet_type)
    FROM app_private.pet_food_catalog f JOIN public.game_items i ON i.id=f.item_id
    LEFT JOIN public.user_inventory ui ON ui.user_id=v_uid AND ui.item_id=f.item_id
    WHERE f.enabled AND EXISTS (SELECT 1 FROM public.companions c
      WHERE c.user_id=v_uid AND c.companion_type=f.pet_type)),'[]'::jsonb);
END $get$;

CREATE FUNCTION public.get_pet_food_purchase_receipt(p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $receipt$
DECLARE v_uid uuid:=auth.uid(); v_row app_private.pet_food_purchase_requests%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'PET_FOOD_INVALID_REQUEST' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_row FROM app_private.pet_food_purchase_requests
    WHERE user_id=v_uid AND request_id=p_request_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('found',false,'request_id',p_request_id); END IF;
  RETURN jsonb_build_object('found',true,'ok',true,'replayed',true,
    'request_id',v_row.request_id,'pet_type',v_row.pet_type,
    'quantity',v_row.quantity,'unit_price',v_row.unit_price,
    'total',v_row.total,'gold',v_row.gold_after,'stock',v_row.stock_after,
    'created_at',v_row.created_at);
END $receipt$;

CREATE FUNCTION public.buy_pet_food(p_pet_type text,p_quantity integer,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $buy$
DECLARE v_uid uuid:=auth.uid(); v_now timestamptz;
  v_catalog app_private.pet_food_catalog%ROWTYPE;
  v_receipt app_private.pet_food_purchase_requests%ROWTYPE;
  v_gold integer; v_total bigint; v_stock integer; v_pet app_private.pet_care_state%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
  IF p_request_id IS NULL OR p_pet_type IS NULL OR p_quantity IS NULL
    OR p_quantity NOT BETWEEN 1 AND 30 THEN
    RAISE EXCEPTION 'PET_FOOD_INVALID_REQUEST' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.profiles WHERE user_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_receipt FROM app_private.pet_food_purchase_requests
    WHERE user_id=v_uid AND request_id=p_request_id;
  IF FOUND THEN
    IF (v_receipt.pet_type,v_receipt.quantity) IS DISTINCT FROM (p_pet_type,p_quantity) THEN
      RAISE EXCEPTION 'PET_FOOD_REQUEST_CONFLICT' USING ERRCODE='22023'; END IF;
    RETURN public.get_pet_food_purchase_receipt(p_request_id);
  END IF;
  SELECT * INTO v_catalog FROM app_private.pet_food_catalog
    WHERE pet_type=p_pet_type AND enabled;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.companions c
      WHERE c.user_id=v_uid AND c.companion_type=p_pet_type) THEN
    RAISE EXCEPTION 'PET_NOT_OWNED' USING ERRCODE='22023'; END IF;
  v_total:=v_catalog.unit_price::bigint*p_quantity;
  IF v_total>2147483647 THEN RAISE EXCEPTION 'PET_FOOD_PRICE_OVERFLOW' USING ERRCODE='22003'; END IF;
  v_now:=clock_timestamp();
  PERFORM app_private.settle_pet_care(v_uid,v_now);
  SELECT gold INTO v_gold FROM public.user_balance WHERE user_id=v_uid FOR UPDATE;
  IF v_gold IS NULL OR v_gold<v_total THEN
    RAISE EXCEPTION 'INSUFFICIENT_GOLD' USING ERRCODE='22023'; END IF;
  UPDATE public.user_balance SET gold=gold-v_total::integer,updated_at=v_now
    WHERE user_id=v_uid;
  INSERT INTO public.gold_history(user_id,type,amount,reason,created_at)
  VALUES(v_uid,'compra_alimento_pet',-v_total::integer,
    'Pet food request '||p_request_id::text,v_now);
  INSERT INTO public.user_inventory(user_id,item_id,quantity,equipped)
  VALUES(v_uid,v_catalog.item_id,p_quantity,false)
  ON CONFLICT (user_id,item_id) DO UPDATE
    SET quantity=public.user_inventory.quantity+excluded.quantity;

  -- A late lot never fills missed slots; one current meal may break a fast.
  FOR v_pet IN SELECT * FROM app_private.pet_care_state s
    WHERE s.user_id=v_uid AND s.pet_type=p_pet_type AND s.last_feed_at<=v_now-interval '24 hours'
    ORDER BY s.companion_id FOR UPDATE LOOP
    SELECT quantity INTO v_stock FROM public.user_inventory
      WHERE user_id=v_uid AND item_id=v_catalog.item_id FOR UPDATE;
    EXIT WHEN coalesce(v_stock,0)=0;
    INSERT INTO app_private.pet_feed_receipts(companion_id,user_id,item_id,event_at)
    VALUES(v_pet.companion_id,v_uid,v_catalog.item_id,v_now);
    IF v_stock=1 THEN
      DELETE FROM public.user_inventory WHERE user_id=v_uid AND item_id=v_catalog.item_id;
    ELSE
      UPDATE public.user_inventory SET quantity=quantity-1
        WHERE user_id=v_uid AND item_id=v_catalog.item_id;
    END IF;
    UPDATE app_private.pet_care_state SET last_feed_at=v_now,
      next_feed_at=v_now+interval '24 hours' WHERE companion_id=v_pet.companion_id;
  END LOOP;
  SELECT coalesce((SELECT quantity FROM public.user_inventory
    WHERE user_id=v_uid AND item_id=v_catalog.item_id),0) INTO v_stock;
  INSERT INTO app_private.pet_food_purchase_requests
    (user_id,request_id,pet_type,quantity,unit_price,total,item_id,gold_after,stock_after,created_at)
  VALUES(v_uid,p_request_id,p_pet_type,p_quantity,v_catalog.unit_price,
    v_total::integer,v_catalog.item_id,v_gold-v_total::integer,v_stock,v_now);
  RETURN jsonb_build_object('ok',true,'replayed',false,'request_id',p_request_id,
    'pet_type',p_pet_type,'quantity',p_quantity,'unit_price',v_catalog.unit_price,
    'total',v_total::integer,'gold',v_gold-v_total::integer,'stock',v_stock,
    'created_at',v_now);
END $buy$;

CREATE FUNCTION public.interact_pet_care(p_companion_id uuid,p_action text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $interact$
DECLARE v_uid uuid:=auth.uid(); v_now timestamptz; v_state app_private.pet_care_state%ROWTYPE;
  v_old app_private.pet_care_events%ROWTYPE; v_count integer; v_effective boolean;
  v_next timestamptz; v_last_event timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
  IF p_companion_id IS NULL OR p_request_id IS NULL OR p_action NOT IN ('care','play')
    OR p_action IS NULL THEN
    RAISE EXCEPTION 'PET_CARE_INVALID_REQUEST' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.profiles WHERE user_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_old FROM app_private.pet_care_events
    WHERE user_id=v_uid AND request_id=p_request_id;
  IF FOUND THEN
    IF (v_old.companion_id,v_old.action) IS DISTINCT FROM (p_companion_id,p_action) THEN
      RAISE EXCEPTION 'PET_CARE_REQUEST_CONFLICT' USING ERRCODE='22023'; END IF;
    RETURN jsonb_build_object('ok',true,'replayed',true,'effective',v_old.effective,
      'request_id',p_request_id,'companion_id',p_companion_id,'action',p_action,
      'event_at',v_old.event_at);
  END IF;
  SELECT * INTO v_state FROM app_private.pet_care_state
    WHERE companion_id=p_companion_id AND user_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PET_NOT_OWNED' USING ERRCODE='22023'; END IF;
  v_now:=clock_timestamp();
  PERFORM app_private.settle_pet_care(v_uid,v_now);
  SELECT count(*) INTO v_count FROM app_private.pet_care_events
    WHERE companion_id=p_companion_id AND effective AND event_at>v_now-interval '24 hours';
  SELECT max(event_at) INTO v_last_event FROM app_private.pet_care_events
    WHERE companion_id=p_companion_id AND effective;
  v_effective:=(v_last_event IS NULL OR v_last_event<=v_now-interval '12 hours')
    AND v_count<2;
  IF v_effective THEN
    v_next:=v_now+interval '12 hours';
    UPDATE app_private.pet_care_state SET last_care_at=v_now
      WHERE companion_id=p_companion_id;
  ELSE
    SELECT max(event_at)+interval '12 hours' INTO v_next
      FROM app_private.pet_care_events
      WHERE companion_id=p_companion_id AND effective;
    v_next:=greatest(coalesce(v_next,v_now),coalesce((
      SELECT min(event_at)+interval '24 hours' FROM app_private.pet_care_events
      WHERE companion_id=p_companion_id AND effective
        AND event_at>v_now-interval '24 hours' HAVING count(*)>=2),v_now));
  END IF;
  INSERT INTO app_private.pet_care_events
    (user_id,companion_id,request_id,action,effective,event_at,requested_at)
  VALUES(v_uid,p_companion_id,p_request_id,p_action,v_effective,
    CASE WHEN v_effective THEN v_now ELSE NULL END,v_now);
  RETURN jsonb_build_object('ok',true,'replayed',false,'effective',v_effective,
    'request_id',p_request_id,'companion_id',p_companion_id,'action',p_action,
    'event_at',CASE WHEN v_effective THEN v_now ELSE NULL END,
    'next_care_at',v_next,'participation',
    app_private.pet_care_participation(p_companion_id,v_now));
END $interact$;

CREATE FUNCTION public.get_pet_care_state()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $state$
DECLARE v_uid uuid:=auth.uid(); v_now timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
  PERFORM 1 FROM public.profiles WHERE user_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND' USING ERRCODE='22023'; END IF;
  v_now:=clock_timestamp();
  PERFORM app_private.settle_pet_care(v_uid,v_now);
  RETURN jsonb_build_object('server_now',v_now,'pets',coalesce((
    SELECT jsonb_agg(jsonb_build_object('companion_id',s.companion_id,
      'pet_type',s.pet_type,'name',c.name,'stock',coalesce(ui.quantity,0),
      'last_feed_at',s.last_feed_at,'next_feed_at',s.next_feed_at,
      'last_care_at',s.last_care_at,
      'next_care_at',greatest(coalesce((SELECT max(e.event_at)+interval '12 hours'
          FROM app_private.pet_care_events e WHERE e.companion_id=s.companion_id
            AND e.effective),v_now),
        coalesce((SELECT min(e.event_at)+interval '24 hours'
          FROM app_private.pet_care_events e WHERE e.companion_id=s.companion_id
            AND e.effective AND e.event_at>v_now-interval '24 hours'
          HAVING count(*)>=2),v_now)),
      'participation',app_private.pet_care_participation(s.companion_id,v_now))
      ORDER BY s.companion_id)
    FROM app_private.pet_care_state s JOIN public.companions c ON c.id=s.companion_id
    LEFT JOIN app_private.pet_food_catalog f ON f.pet_type=s.pet_type AND f.enabled
    LEFT JOIN public.user_inventory ui ON ui.user_id=v_uid AND ui.item_id=f.item_id
    WHERE s.user_id=v_uid),'[]'::jsonb));
END $state$;

-- The legacy generic consumer must never use reserved food, even when the
-- client sends a known inventory row ID directly.
CREATE FUNCTION pg_temp.pet_care_replace_once(p_source text,p_old text,p_new text)
RETURNS text LANGUAGE plpgsql AS $once$
BEGIN
  IF p_old='' OR (length(p_source)-length(replace(p_source,p_old,'')))<>length(p_old) THEN
    RAISE EXCEPTION 'PET_CARE_REPLACEMENT_DRIFT: %',left(p_old,120) USING ERRCODE='22023';
  END IF;
  RETURN replace(p_source,p_old,p_new);
END $once$;

DO $patch_consume$
DECLARE v_source text;
BEGIN
  v_source:=pg_get_functiondef('public.consume_inventory_item(uuid)'::regprocedure);
  v_source:=pg_temp.pet_care_replace_once(v_source,
    '  SELECT * INTO v_row FROM public.user_inventory',
    '  IF EXISTS (SELECT 1 FROM public.user_inventory ui
      JOIN app_private.pet_food_catalog f ON f.item_id=ui.item_id
      WHERE ui.id=p_inventory_id AND ui.user_id=v_user) THEN
    RAISE EXCEPTION ''PET_FOOD_RESERVED'' USING ERRCODE=''22023'';
  END IF;
  SELECT * INTO v_row FROM public.user_inventory');
  EXECUTE v_source;
END $patch_consume$;

-- Patch only the effective horde+auto-potions adventure source. No simulator
-- duplication and no per-enemy care query are introduced.
DO $patch_sync$
DECLARE v_source text;
BEGIN
  v_source:=pg_get_functiondef('app_private.sync_auto_adventure()'::regprocedure);
  v_source:=pg_temp.pet_care_replace_once(v_source,
    '      v_pet:=app_private.adventure_pet_at(v_uid,v_start);',
    '      PERFORM app_private.settle_pet_care(v_uid,v_start);
      v_pet:=app_private.adventure_pet_at(v_uid,v_start);
      IF v_pet IS NOT NULL THEN
        v_pet:=app_private.pet_care_snapshot(v_pet,v_start);
      END IF;');
  v_source:=pg_temp.pet_care_replace_once(v_source,
    'WHEN ''atk'' THEN v_hero_attack:=round(v_hero_attack*1.10)::integer;',
    'WHEN ''atk'' THEN v_hero_attack:=round(v_hero_attack*(1+(v_pet->''effective_bonus''->>''pct'')::numeric))::integer;');
  v_source:=pg_temp.pet_care_replace_once(v_source,
    'WHEN ''def'' THEN v_hero_defense:=round(v_hero_defense*1.10)::integer;',
    'WHEN ''def'' THEN v_hero_defense:=round(v_hero_defense*(1+(v_pet->''effective_bonus''->>''pct'')::numeric))::integer;');
  v_source:=pg_temp.pet_care_replace_once(v_source,
    'WHEN ''hp'' THEN v_hero_max:=round(v_hero_max*1.10)::integer;',
    'WHEN ''hp'' THEN v_hero_max:=round(v_hero_max*(1+(v_pet->''effective_bonus''->>''pct'')::numeric))::integer;');
  v_source:=pg_temp.pet_care_replace_once(v_source,
    'WHEN ''mp'' THEN v_hero_max_mp:=round(v_hero_max_mp*1.10)::integer;',
    'WHEN ''mp'' THEN v_hero_max_mp:=round(v_hero_max_mp*(1+(v_pet->''effective_bonus''->>''pct'')::numeric))::integer;');
  v_source:=pg_temp.pet_care_replace_once(v_source,
    'v_rules_snapshot->''pet''->''sustain'',',
    'v_rules_snapshot->''pet''->''effective_sustain'',');
  EXECUTE v_source;
END $patch_sync$;

REVOKE ALL ON FUNCTION public.get_pet_food_catalog(),
  public.get_pet_food_purchase_receipt(uuid),
  public.buy_pet_food(text,integer,uuid),
  public.interact_pet_care(uuid,text,uuid),
  public.get_pet_care_state() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_pet_food_catalog(),
  public.get_pet_food_purchase_receipt(uuid),
  public.buy_pet_food(text,integer,uuid),
  public.interact_pet_care(uuid,text,uuid),
  public.get_pet_care_state() TO authenticated;

-- Check effective grants after all default ACLs, REVOKEs and explicit grants.
-- RLS does not constrain TRUNCATE, REFERENCES, TRIGGER or MAINTAIN.
DO $acl_postflight$
DECLARE v_bad text;
BEGIN
  SELECT t.name||' '||r.role_name||' '||p.privilege INTO v_bad
  FROM (VALUES
    ('app_private.pet_food_catalog'),('app_private.pet_care_state'),
    ('app_private.pet_feed_receipts'),('app_private.pet_care_events'),
    ('app_private.pet_food_purchase_requests')) t(name)
  CROSS JOIN (VALUES ('anon'),('authenticated'),('service_role')) r(role_name)
  CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),
    ('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) p(privilege)
  WHERE has_table_privilege(r.role_name,t.name,p.privilege)
  LIMIT 1;
  IF v_bad IS NULL THEN
    SELECT c.oid::regclass::text||' PUBLIC '||a.privilege_type INTO v_bad
    FROM pg_class c CROSS JOIN LATERAL
      aclexplode(coalesce(c.relacl,acldefault('r'::"char",c.relowner))) a
    WHERE c.oid IN ('app_private.pet_food_catalog'::regclass,
      'app_private.pet_care_state'::regclass,'app_private.pet_feed_receipts'::regclass,
      'app_private.pet_care_events'::regclass,
      'app_private.pet_food_purchase_requests'::regclass)
      AND a.grantee=0 LIMIT 1;
  END IF;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'PET_CARE_PRIVATE_TABLE_ACL_DRIFT: %',v_bad USING ERRCODE='22023';
  END IF;

  SELECT f.signature||' '||r.role_name INTO v_bad
  FROM (VALUES
    ('app_private.pet_care_on_acquisition()'),
    ('app_private.settle_pet_care(uuid,timestamptz)'),
    ('app_private.pet_care_participation(uuid,timestamptz)'),
    ('app_private.pet_care_snapshot(jsonb,timestamptz)')) f(signature)
  CROSS JOIN (VALUES ('anon'),('authenticated'),('service_role')) r(role_name)
  WHERE has_function_privilege(r.role_name,f.signature,'EXECUTE') LIMIT 1;
  IF v_bad IS NULL THEN
    SELECT p.oid::regprocedure::text||' PUBLIC EXECUTE' INTO v_bad
    FROM pg_proc p CROSS JOIN LATERAL
      aclexplode(coalesce(p.proacl,acldefault('f'::"char",p.proowner))) a
    WHERE p.oid IN ('app_private.pet_care_on_acquisition()'::regprocedure,
      'app_private.settle_pet_care(uuid,timestamptz)'::regprocedure,
      'app_private.pet_care_participation(uuid,timestamptz)'::regprocedure,
      'app_private.pet_care_snapshot(jsonb,timestamptz)'::regprocedure)
      AND a.grantee=0 AND a.privilege_type='EXECUTE' LIMIT 1;
  END IF;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'PET_CARE_PRIVATE_FUNCTION_ACL_DRIFT: %',v_bad USING ERRCODE='22023';
  END IF;

  SELECT f.signature INTO v_bad FROM (VALUES
    ('public.get_pet_food_catalog()'),
    ('public.get_pet_food_purchase_receipt(uuid)'),
    ('public.buy_pet_food(text,integer,uuid)'),
    ('public.interact_pet_care(uuid,text,uuid)'),
    ('public.get_pet_care_state()')) f(signature)
  WHERE has_function_privilege('anon',f.signature,'EXECUTE')
    OR NOT has_function_privilege('authenticated',f.signature,'EXECUTE')
  LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'PET_CARE_PUBLIC_FUNCTION_ACL_DRIFT: %',v_bad USING ERRCODE='22023';
  END IF;
END $acl_postflight$;

COMMIT;
