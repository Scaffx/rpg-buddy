BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- AoE is a frozen prerequisite. The LF hashes are of pg_get_functiondef.
DO $preflight$
DECLARE v_bad text;
BEGIN
  SELECT e.signature INTO v_bad FROM (VALUES
    ('app_private.sync_auto_adventure()', '08464d437f42c43172ad033ae17506ee',true,'v','{postgres=X/postgres,authenticated=X/postgres}',true,false),
    ('app_private.adventure_simulate_horde(timestamptz,integer,integer,integer,integer,jsonb,jsonb,text,integer,jsonb)', '5d99024d389fb4fcf6bf574221fb3879',false,'s','{postgres=X/postgres}',false,false),
    ('public.sync_auto_adventure()', '1879a24abc08fec402ea5d96f4a199c6',false,'v','{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}',true,true)
  ) e(signature,body_md5,security_definer,volatility,acl,auth_execute,service_execute)
  LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)
  WHERE p.oid IS NULL OR md5(replace(pg_get_functiondef(p.oid),chr(13)||chr(10),chr(10)))<>e.body_md5
    OR p.proowner<>'postgres'::regrole OR p.prosecdef<>e.security_definer
    OR p.provolatile<>e.volatility::"char" OR p.proacl::text IS DISTINCT FROM e.acl
    OR p.proconfig<>ARRAY['search_path=""']::text[]
    OR has_function_privilege('anon',p.oid,'EXECUTE')
    OR has_function_privilege('authenticated',p.oid,'EXECUTE') IS DISTINCT FROM e.auth_execute
    OR has_function_privilege('service_role',p.oid,'EXECUTE') IS DISTINCT FROM e.service_execute
  LIMIT 1;
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'AUTO_POTIONS_SOURCE_OR_ACL_DRIFT: %',v_bad USING ERRCODE='22023'; END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE (n.nspname,p.proname) IN (VALUES
        ('app_private','sync_auto_adventure'),('app_private','adventure_simulate_horde'),
        ('public','sync_auto_adventure')))<>3
    OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE (n.nspname,p.proname) IN (VALUES
        ('public','get_adventure_auto_potions_state'),
        ('public','set_adventure_auto_potions_enabled'),
        ('app_private','adventure_simulate_horde_potions')))
    OR to_regclass('app_private.adventure_auto_potion_selection') IS NOT NULL
    OR to_regclass('app_private.adventure_auto_potion_receipts') IS NOT NULL
  THEN RAISE EXCEPTION 'AUTO_POTIONS_OVERLOAD_OR_OBJECT_DRIFT' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.user_inventory'::regclass
      AND relowner='postgres'::regrole AND relrowsecurity
      AND relacl::text='{postgres=arwdDxtm/postgres,authenticated=r/postgres}')
    OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.game_items'::regclass
      AND relowner='postgres'::regrole AND relrowsecurity
      AND relacl::text='{postgres=arwdDxtm/postgres,authenticated=r/postgres}')
    OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='app_private.adventure_battles'::regclass
      AND relowner='postgres'::regrole AND relrowsecurity)
    OR EXISTS (SELECT 1 FROM (VALUES
      ('public.game_items'::regclass),('public.user_inventory'::regclass)) t(table_oid)
      WHERE has_table_privilege('anon',t.table_oid,'SELECT')
        OR NOT has_table_privilege('authenticated',t.table_oid,'SELECT')
        OR has_table_privilege('authenticated',t.table_oid,'INSERT')
        OR has_table_privilege('authenticated',t.table_oid,'UPDATE')
        OR has_table_privilege('authenticated',t.table_oid,'DELETE')
        OR has_table_privilege('service_role',t.table_oid,'SELECT'))
  THEN RAISE EXCEPTION 'AUTO_POTIONS_TABLE_DRIFT' USING ERRCODE='22023'; END IF;
END $preflight$;

-- Absence of a row means OFF. History makes the switch apply to battle start
-- time, including a bounded offline catch-up batch.
CREATE TABLE app_private.adventure_auto_potion_selection (
  revision bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL,
  effective_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX adventure_auto_potion_selection_at
  ON app_private.adventure_auto_potion_selection(user_id,effective_at DESC,revision DESC);
ALTER TABLE app_private.adventure_auto_potion_selection ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.adventure_auto_potion_selection FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE app_private.adventure_auto_potion_selection_revision_seq FROM PUBLIC,anon,authenticated;

-- A receipt reserves one already-scheduled event. Its at timestamp determines
-- when the UI may call it used. No deferred debit and no profile HP/MP write.
CREATE TABLE app_private.adventure_auto_potion_receipts (
  -- Battle timelines are pruned after 127 rows; consumption evidence survives.
  battle_id uuid NOT NULL,
  potion_type text NOT NULL CHECK (potion_type IN ('hp','mp')),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.game_items(id) ON DELETE RESTRICT,
  item_name text NOT NULL,
  nominal_amount integer NOT NULL CHECK (nominal_amount>0),
  recovered integer NOT NULL CHECK (recovered>0),
  event_at timestamptz NOT NULL,
  PRIMARY KEY (battle_id,potion_type)
);
CREATE INDEX adventure_auto_potion_receipts_user ON app_private.adventure_auto_potion_receipts(user_id,battle_id);
ALTER TABLE app_private.adventure_auto_potion_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.adventure_auto_potion_receipts FROM PUBLIC,anon,authenticated;

CREATE FUNCTION pg_temp.auto_potion_replace_once(p_source text,p_old text,p_new text)
RETURNS text LANGUAGE plpgsql AS $once$
DECLARE v_old text:=replace(p_old,chr(13)||chr(10),chr(10));
  v_new text:=replace(p_new,chr(13)||chr(10),chr(10));
BEGIN
  IF v_old='' OR (length(p_source)-length(replace(p_source,v_old,'')))<>length(v_old) THEN
    RAISE EXCEPTION 'AUTO_POTIONS_REPLACEMENT_DRIFT: %',left(v_old,100) USING ERRCODE='22023';
  END IF;
  RETURN replace(p_source,v_old,v_new);
END $once$;

-- A separate simulator leaves all pre-existing v3/v4 snapshots and the AoE
-- function callable exactly as they were. It inserts at most two zero-time
-- consumable events after the event whose resulting resources cross a limit.
DO $sim_patch$
DECLARE v_source text;
BEGIN
  v_source:=pg_get_functiondef('app_private.adventure_simulate_horde(timestamptz,integer,integer,integer,integer,jsonb,jsonb,text,integer,jsonb)'::regprocedure);
  v_source:=pg_temp.auto_potion_replace_once(v_source,
    'CREATE OR REPLACE FUNCTION app_private.adventure_simulate_horde(',
    'CREATE FUNCTION app_private.adventure_simulate_horde_potions(');
  v_source:=pg_temp.auto_potion_replace_once(v_source,
    'p_rotation integer, p_sustain jsonb)',
    'p_rotation integer, p_sustain jsonb, p_hp_potion jsonb, p_mp_potion jsonb)');
  v_source:=pg_temp.auto_potion_replace_once(v_source,
    '  v_total integer;',
    '  v_total integer;
  v_hp_used boolean:=false;
  v_mp_used boolean:=false;
  v_restored integer;');
  v_source:=pg_temp.auto_potion_replace_once(v_source,
    '  FOR step IN 1..1200 LOOP
    v_at_ms:=v_hero_due;',
    '  FOR step IN 1..1200 LOOP
    EXIT WHEN coalesce(array_length(v_events,1),0)>=1200;
    v_at_ms:=v_hero_due;');
  v_source:=pg_temp.auto_potion_replace_once(v_source,
    '    EXIT WHEN v_hero_hp=0 OR v_total=0;',
    '    IF v_hero_hp>0 AND v_total>0 AND NOT v_hp_used AND p_hp_potion IS NOT NULL
       AND v_hero_hp::bigint*4<p_max_hp AND coalesce(array_length(v_events,1),0)<1200 THEN
      v_restored:=least(p_max_hp-v_hero_hp,(p_hp_potion->>''amount'')::integer);
      IF v_restored>0 THEN
        v_hero_hp:=v_hero_hp+v_restored; v_hp_used:=true;
        v_events:=array_append(v_events,jsonb_build_object(
          ''at'',p_start+v_at_ms*interval ''1 millisecond'',
          ''actor'',''hero'',''actor_slot'',NULL,''target_slot'',NULL,
          ''target_slots'',''[]''::jsonb,''hits'',''[]''::jsonb,
          ''kind'',''skill'',''skill_type'',''heal'',''skill_id'',''consumable.hp'',
          ''skill_name'',p_hp_potion->>''name'',''effect'',''light'',
          ''consumable_type'',''hp'',''consumable_item_id'',p_hp_potion->>''id'',
          ''consumable_amount'',(p_hp_potion->>''amount'')::integer,
          ''damage'',0,''raw_damage'',0,''damage_multiplier'',1,
          ''healing'',v_restored,''mp_cost'',0,''hero_hp'',v_hero_hp,''hero_mp'',v_hero_mp,
          ''enemy_hp'',v_total,''enemy_mp'',v_mp[1],
          ''enemies_hp'',to_jsonb(v_hp[1:v_enemy_count]),
          ''enemies_mp'',to_jsonb(v_mp[1:v_enemy_count])));
      END IF;
    END IF;
    IF v_hero_hp>0 AND v_total>0 AND p_max_mp>0 AND NOT v_mp_used AND p_mp_potion IS NOT NULL
       AND v_hero_mp::bigint*5<p_max_mp AND coalesce(array_length(v_events,1),0)<1200 THEN
      v_restored:=least(p_max_mp-v_hero_mp,(p_mp_potion->>''amount'')::integer);
      IF v_restored>0 THEN
        v_hero_mp:=v_hero_mp+v_restored; v_mp_used:=true;
        v_events:=array_append(v_events,jsonb_build_object(
          ''at'',p_start+v_at_ms*interval ''1 millisecond'',
          ''actor'',''hero'',''actor_slot'',NULL,''target_slot'',NULL,
          ''target_slots'',''[]''::jsonb,''hits'',''[]''::jsonb,
          ''kind'',''skill'',''skill_type'',''heal'',''skill_id'',''consumable.mp'',
          ''skill_name'',p_mp_potion->>''name'',''effect'',''arcane'',
          ''consumable_type'',''mp'',''consumable_item_id'',p_mp_potion->>''id'',
          ''consumable_amount'',(p_mp_potion->>''amount'')::integer,
          ''damage'',0,''raw_damage'',0,''damage_multiplier'',1,
          ''healing'',0,''mp_restored'',v_restored,''mp_cost'',0,
          ''hero_hp'',v_hero_hp,''hero_mp'',v_hero_mp,
          ''enemy_hp'',v_total,''enemy_mp'',v_mp[1],
          ''enemies_hp'',to_jsonb(v_hp[1:v_enemy_count]),
          ''enemies_mp'',to_jsonb(v_mp[1:v_enemy_count])));
      END IF;
    END IF;
    EXIT WHEN v_hero_hp=0 OR v_total=0;');
  EXECUTE v_source;
END $sim_patch$;
REVOKE ALL ON FUNCTION app_private.adventure_simulate_horde_potions(
  timestamptz,integer,integer,integer,integer,jsonb,jsonb,text,integer,jsonb,jsonb,jsonb)
  FROM PUBLIC,anon,authenticated;

DO $sync_patch$
DECLARE v_source text;
BEGIN
  v_source:=pg_get_functiondef('app_private.sync_auto_adventure()'::regprocedure);
  v_source:=pg_temp.auto_potion_replace_once(v_source,
    '  v_target_mode text;',
    '  v_target_mode text;
  v_auto_enabled boolean;
  v_auto_hp_potion jsonb;
  v_auto_mp_potion jsonb;
  v_auto_event jsonb;');
  v_source:=pg_temp.auto_potion_replace_once(v_source,
    '    IF v_engine_version=''v4_horde'' THEN
      v_events := app_private.adventure_simulate_horde(v_start,v_hero_attack,v_hero_defense,
        v_hero_max,v_hero_max_mp,v_enemies,v_skills,v_default_effect,
        v_state.skill_rotation,v_rules_snapshot->''pet''->''sustain'');',
    '    IF v_engine_version=''v4_horde'' THEN
      SELECT s.enabled INTO v_auto_enabled FROM app_private.adventure_auto_potion_selection s
        WHERE s.user_id=v_uid AND s.effective_at<=v_start
        ORDER BY s.effective_at DESC,s.revision DESC LIMIT 1;
      v_auto_hp_potion:=NULL; v_auto_mp_potion:=NULL;
      IF coalesce(v_auto_enabled,false) THEN
        SELECT jsonb_build_object(''id'',i.id,''name'',i.name,
          ''amount'',substring(i.effect from 6)::integer)
          INTO v_auto_hp_potion
          FROM public.user_inventory ui JOIN public.game_items i ON i.id=ui.item_id
         WHERE ui.user_id=v_uid AND ui.quantity>0 AND i.category=''consumable''
           AND i.is_consumable AND i.stackable AND i.level_required<=v_level
           AND (i.id,i.effect) IN (VALUES
             (''36aa16a5-153d-4c08-941e-ae3ee51d54d4''::uuid,''heal_30''),
             (''874346e5-c815-4de4-ae2d-099ce211f05e''::uuid,''heal_80''),
             (''3d99dfbe-2735-4eff-9928-5efca01fc254''::uuid,''heal_200''))
         ORDER BY substring(i.effect from 6)::integer,i.id LIMIT 1 FOR UPDATE OF ui;
        SELECT jsonb_build_object(''id'',i.id,''name'',i.name,
          ''amount'',substring(i.effect from 6)::integer)
          INTO v_auto_mp_potion
          FROM public.user_inventory ui JOIN public.game_items i ON i.id=ui.item_id
         WHERE ui.user_id=v_uid AND ui.quantity>0 AND i.category=''consumable''
           AND i.is_consumable AND i.stackable AND i.level_required<=v_level
           AND (i.id,i.effect) IN (VALUES
             (''ea63052e-8530-4c4e-98ed-9d62a9cbf781''::uuid,''mana_20''),
             (''125cd22f-a693-4e93-ac8e-9092bc1b3792''::uuid,''mana_60''))
         ORDER BY substring(i.effect from 6)::integer,i.id LIMIT 1 FOR UPDATE OF ui;
      END IF;
      v_rules_snapshot:=v_rules_snapshot||jsonb_build_object(''auto_potions'',
        jsonb_build_object(''enabled'',coalesce(v_auto_enabled,false),
          ''hp'',v_auto_hp_potion,''mp'',v_auto_mp_potion));
      v_events := app_private.adventure_simulate_horde_potions(v_start,v_hero_attack,v_hero_defense,
        v_hero_max,v_hero_max_mp,v_enemies,v_skills,v_default_effect,
        v_state.skill_rotation,v_rules_snapshot->''pet''->''sustain'',
        v_auto_hp_potion,v_auto_mp_potion);');
  v_source:=pg_temp.auto_potion_replace_once(v_source,
    '            v_engine_version,v_rules_snapshot) RETURNING * INTO v_battle;
    v_state.current_battle_id := v_battle.id;',
    '            v_engine_version,v_rules_snapshot) RETURNING * INTO v_battle;
    IF v_engine_version=''v4_horde'' THEN
      FOR v_auto_event IN SELECT x FROM jsonb_array_elements(v_events) x
        WHERE x->>''skill_id'' IN (''consumable.hp'',''consumable.mp'') LOOP
        -- Match the inventory consumer: the last unit removes its row.
        DELETE FROM public.user_inventory
          WHERE user_id=v_uid AND item_id=(v_auto_event->>''consumable_item_id'')::uuid
            AND quantity=1;
        IF NOT FOUND THEN
          UPDATE public.user_inventory SET quantity=quantity-1
            WHERE user_id=v_uid AND item_id=(v_auto_event->>''consumable_item_id'')::uuid
              AND quantity>1;
          IF NOT FOUND THEN RAISE EXCEPTION ''AUTO_POTION_STOCK_CHANGED'' USING ERRCODE=''40001''; END IF;
        END IF;
        INSERT INTO app_private.adventure_auto_potion_receipts
          (battle_id,potion_type,user_id,item_id,item_name,nominal_amount,recovered,event_at)
        VALUES(v_battle.id,v_auto_event->>''consumable_type'',v_uid,
          (v_auto_event->>''consumable_item_id'')::uuid,v_auto_event->>''skill_name'',
          (v_auto_event->>''consumable_amount'')::integer,
          CASE WHEN v_auto_event->>''consumable_type''=''hp''
            THEN (v_auto_event->>''healing'')::integer
            ELSE (v_auto_event->>''mp_restored'')::integer END,
          (v_auto_event->>''at'')::timestamptz);
      END LOOP;
    END IF;
    v_state.current_battle_id := v_battle.id;');
  EXECUTE v_source;
END $sync_patch$;

CREATE FUNCTION public.get_adventure_auto_potions_state()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $get$
DECLARE v_uid uuid:=auth.uid(); v_enabled boolean; v_now timestamptz:=clock_timestamp();
  v_battle_id uuid; v_reservations jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
  SELECT s.enabled INTO v_enabled FROM app_private.adventure_auto_potion_selection s
    WHERE s.user_id=v_uid ORDER BY s.effective_at DESC,s.revision DESC LIMIT 1;
  SELECT b.id INTO v_battle_id FROM app_private.adventure_battles b
    WHERE b.user_id=v_uid ORDER BY b.started_at DESC,b.id DESC LIMIT 1;
  SELECT coalesce(jsonb_agg(jsonb_build_object('type',r.potion_type,'item_id',r.item_id,
    'name',r.item_name,'amount',r.nominal_amount,'recovered',r.recovered,
    'at',r.event_at,'status',CASE WHEN r.event_at<=v_now THEN 'used' ELSE 'reserved' END)
    ORDER BY r.potion_type),'[]'::jsonb) INTO v_reservations
    FROM app_private.adventure_auto_potion_receipts r
    WHERE r.user_id=v_uid AND r.battle_id=v_battle_id;
  RETURN jsonb_build_object('enabled',coalesce(v_enabled,false),'server_now',v_now,
    'battle_id',v_battle_id,'reservations',v_reservations,
    'stock',coalesce((SELECT jsonb_agg(jsonb_build_object('type',CASE WHEN i.effect LIKE 'heal_%' THEN 'hp' ELSE 'mp' END,
      'item_id',i.id,'name',i.name,'quantity',ui.quantity,
      'amount',CASE WHEN i.effect LIKE 'heal_%' THEN substring(i.effect from 6)::integer
        ELSE substring(i.effect from 6)::integer END)
      ORDER BY CASE WHEN i.effect LIKE 'heal_%' THEN 'hp' ELSE 'mp' END,
        substring(i.effect from 6)::integer,i.id)
      FROM public.user_inventory ui JOIN public.game_items i ON i.id=ui.item_id
        JOIN public.profiles p ON p.user_id=ui.user_id
      WHERE ui.user_id=v_uid AND ui.quantity>0 AND i.category='consumable'
        AND i.is_consumable AND i.stackable AND i.level_required<=p.level
        AND (i.id,i.effect) IN (VALUES
          ('36aa16a5-153d-4c08-941e-ae3ee51d54d4'::uuid,'heal_30'),
          ('874346e5-c815-4de4-ae2d-099ce211f05e'::uuid,'heal_80'),
          ('3d99dfbe-2735-4eff-9928-5efca01fc254'::uuid,'heal_200'),
          ('ea63052e-8530-4c4e-98ed-9d62a9cbf781'::uuid,'mana_20'),
          ('125cd22f-a693-4e93-ac8e-9092bc1b3792'::uuid,'mana_60'))),'[]'::jsonb));
END $get$;

CREATE FUNCTION public.set_adventure_auto_potions_enabled(p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $set$
DECLARE v_uid uuid:=auth.uid(); v_current boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
  IF p_enabled IS NULL THEN RAISE EXCEPTION 'AUTO_POTIONS_INVALID_CHOICE' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.profiles WHERE user_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND' USING ERRCODE='22023'; END IF;
  SELECT s.enabled INTO v_current FROM app_private.adventure_auto_potion_selection s
    WHERE s.user_id=v_uid ORDER BY s.effective_at DESC,s.revision DESC LIMIT 1;
  IF coalesce(v_current,false) IS DISTINCT FROM p_enabled THEN
    INSERT INTO app_private.adventure_auto_potion_selection(user_id,enabled)
      VALUES(v_uid,p_enabled);
  END IF;
  RETURN public.get_adventure_auto_potions_state();
END $set$;
REVOKE ALL ON FUNCTION public.get_adventure_auto_potions_state(),
  public.set_adventure_auto_potions_enabled(boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_adventure_auto_potions_state(),
  public.set_adventure_auto_potions_enabled(boolean) TO authenticated;

COMMIT;
