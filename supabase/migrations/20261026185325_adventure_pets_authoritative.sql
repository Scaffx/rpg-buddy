-- Generated migration body. The corresponding migration file is created with the Supabase CLI.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- Fail before any schema change. These are the normalized PostgreSQL 17 live
-- definitions and ownership/ACL contracts from the 2026-10-26 source capture.
DO $preflight$
DECLARE v_bad text;
BEGIN
  SELECT e.signature INTO v_bad FROM (VALUES
    ('app_private.sync_auto_adventure()', '59914430e3b78e96f69deaf770f82910', true, 'v', '{postgres=X/postgres,authenticated=X/postgres}', false,true,false,true,false),
    ('app_private.advance_auto_adventure(uuid)', '09c5c400405def35917f1c63e4f58ac8', true, 'v', '{postgres=X/postgres,authenticated=X/postgres}', false,true,false,true,false),
    ('app_private.adventure_simulate_v3(timestamptz,integer,integer,integer,integer,integer,integer,jsonb,jsonb,text,integer)', '0f5ed37992ae1f5d91c181ca2b93e2f7', false, 's', '{postgres=X/postgres}', false,false,false,true,false),
    ('app_private.adventure_battle_payload(app_private.adventure_battles,timestamptz)', '25fb3388b1cefaa4cb00ae45640d428b', true, 's', '{postgres=X/postgres}', false,false,false,true,false),
    ('public.buy_pet(text)', '060c6f10eef481e35fb7b31dc2d1a23b', true, 'v', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}', false,true,true,true,false),
    ('public.choose_level3_companion(text,text)', '1a2a9f9cf7bbedd1136cd018d2428f4d', true, 'v', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}', false,true,true,true,false),
    ('public._guard_inventory_forage_pet()', '423398434368af62d442377478d76e15', false, 'v', '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}', true,true,true,true,true),
    ('public._record_inventory_forage_pet()', '418e2bcbf2f841562d70d15429fc9410', false, 'v', '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}', true,true,true,true,true)
  ) e(signature,body_md5,security_definer,volatility,acl,anon_execute,auth_execute,service_execute,owner_execute,public_execute)
  LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)
  WHERE p.oid IS NULL OR md5(replace(pg_get_functiondef(p.oid),chr(13)||chr(10),chr(10)))<>e.body_md5
     OR p.proowner<>'postgres'::regrole OR p.prosecdef<>e.security_definer
     OR p.provolatile<>e.volatility::"char" OR p.proacl::text IS DISTINCT FROM e.acl
     OR has_function_privilege('anon',p.oid,'EXECUTE') IS DISTINCT FROM e.anon_execute
     OR has_function_privilege('authenticated',p.oid,'EXECUTE') IS DISTINCT FROM e.auth_execute
     OR has_function_privilege('service_role',p.oid,'EXECUTE') IS DISTINCT FROM e.service_execute
     OR has_function_privilege('postgres',p.oid,'EXECUTE') IS DISTINCT FROM e.owner_execute
     OR EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
       WHERE a.grantee=0 AND a.privilege_type='EXECUTE') IS DISTINCT FROM e.public_execute
  LIMIT 1;
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'PET_SOURCE_OR_ACL_DRIFT: %',v_bad USING ERRCODE='22023'; END IF;
  -- CREATE OR REPLACE would leave a pre-existing overload callable, and a
  -- fresh RPC name must not already have a conflicting implementation.
  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('app_private','sync_auto_adventure'),
      ('app_private','advance_auto_adventure'),
      ('app_private','adventure_simulate_v3'),
      ('app_private','adventure_battle_payload'),
      ('public','buy_pet'),
      ('public','choose_level3_companion'),
      ('public','_guard_inventory_forage_pet'),
      ('public','_record_inventory_forage_pet')
    ) e(schema_name,function_name)
    JOIN pg_namespace n ON n.nspname=e.schema_name
    LEFT JOIN pg_proc p ON p.pronamespace=n.oid AND p.proname=e.function_name
    GROUP BY e.schema_name,e.function_name
    HAVING count(p.oid)<>1
  ) OR EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE (n.nspname,p.proname) IN (VALUES
      ('app_private','adventure_pet_gate_clock'),
      ('app_private','adventure_pet_gate_record'),
      ('app_private','adventure_pet_catalog'),
      ('app_private','adventure_pet_sustain'),
      ('app_private','adventure_pet_at'),
      ('public','get_adventure_pet_state'),
      ('public','set_active_adventure_pet')
    )
  ) THEN RAISE EXCEPTION 'PET_FUNCTION_OVERLOAD_DRIFT' USING ERRCODE='22023'; END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid IN (
      to_regprocedure('app_private.sync_auto_adventure()'),
      to_regprocedure('app_private.advance_auto_adventure(uuid)'),
      to_regprocedure('app_private.adventure_simulate_v3(timestamptz,integer,integer,integer,integer,integer,integer,jsonb,jsonb,text,integer)'),
      to_regprocedure('app_private.adventure_battle_payload(app_private.adventure_battles,timestamptz)'),
      to_regprocedure('public.buy_pet(text)'))
      AND p.proconfig<>ARRAY['search_path=""']::text[])
     OR EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid IN (
      to_regprocedure('public._guard_inventory_forage_pet()'),
      to_regprocedure('public._record_inventory_forage_pet()'),
      to_regprocedure('public.choose_level3_companion(text,text)'))
      AND p.proconfig<>ARRAY['search_path=pg_catalog, public']::text[])
  THEN RAISE EXCEPTION 'PET_FUNCTION_CONFIG_DRIFT' USING ERRCODE='22023'; END IF;
  IF to_regclass('public.companions') IS NULL
     OR to_regclass('app_private.adventure_battles') IS NULL
     OR to_regclass('public.profiles') IS NULL
     OR EXISTS (SELECT 1 FROM pg_class c WHERE c.oid IN
       ('public.companions'::regclass,'app_private.adventure_battles'::regclass)
       AND (c.relowner<>'postgres'::regrole OR NOT c.relrowsecurity))
     OR has_table_privilege('anon','public.companions','INSERT')
     OR has_table_privilege('authenticated','public.companions','INSERT')
     OR has_table_privilege('anon','app_private.adventure_battles','INSERT,UPDATE,DELETE,TRUNCATE')
     OR has_table_privilege('authenticated','app_private.adventure_battles','INSERT,UPDATE,DELETE,TRUNCATE')
     OR EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public.companions'::regclass
       AND a.attnum>0 AND NOT a.attisdropped AND
       (has_column_privilege('anon',a.attrelid,a.attname,'INSERT')
        OR has_column_privilege('authenticated',a.attrelid,a.attname,'INSERT')))
  THEN RAISE EXCEPTION 'PET_OWNERSHIP_SCHEMA_DRIFT' USING ERRCODE='22023'; END IF;
  IF EXISTS (SELECT 1 FROM (VALUES ('id','uuid'),('user_id','uuid'),
    ('companion_type','text'),('origin','text'),('name','text')) e(name,typ)
    LEFT JOIN pg_attribute a ON a.attrelid='public.companions'::regclass
      AND a.attname=e.name AND a.atttypid=e.typ::regtype AND a.attnotnull
    WHERE a.attname IS NULL)
    OR NOT EXISTS (SELECT 1 FROM pg_trigger t
      WHERE t.tgrelid='public.companions'::regclass
        AND t.tgname='guard_inventory_forage_pet' AND t.tgenabled='O'
        AND t.tgfoid='public._guard_inventory_forage_pet()'::regprocedure
        AND t.tgqual IS NULL AND t.tgtype=19 AND t.tgattr::text='')
    OR NOT EXISTS (SELECT 1 FROM pg_trigger t
      WHERE t.tgrelid='public.companions'::regclass
        AND t.tgname='record_inventory_forage_pet' AND t.tgenabled='O'
        AND t.tgfoid='public._record_inventory_forage_pet()'::regprocedure
        AND t.tgqual IS NULL AND t.tgtype=5 AND t.tgattr::text='')
  THEN RAISE EXCEPTION 'PET_IDENTITY_GUARD_DRIFT' USING ERRCODE='22023'; END IF;
END $preflight$;

CREATE TABLE app_private.adventure_pet_rollout (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  global_enabled boolean NOT NULL DEFAULT false,
  enabled_at timestamptz,
  CHECK (global_enabled = (enabled_at IS NOT NULL))
);
INSERT INTO app_private.adventure_pet_rollout(singleton,global_enabled) VALUES(true,false);
CREATE TABLE app_private.adventure_pet_allowlist (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE app_private.adventure_pet_selection (
  revision bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  companion_id uuid REFERENCES public.companions(id) ON DELETE SET NULL,
  companion_type text,
  name text,
  effective_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  -- ON DELETE SET NULL preserves the historical type/name but removes the FK.
  CHECK ((companion_type IS NULL)=(name IS NULL)
    AND (companion_id IS NULL OR companion_type IS NOT NULL))
);
CREATE INDEX adventure_pet_selection_at ON app_private.adventure_pet_selection(user_id,effective_at DESC,revision DESC);
CREATE TABLE app_private.adventure_pet_gate_history (
  revision bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scope text NOT NULL CHECK (scope IN ('global','user')),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL,
  effective_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((scope='global' AND user_id IS NULL) OR (scope='user' AND user_id IS NOT NULL))
);
CREATE INDEX adventure_pet_gate_at ON app_private.adventure_pet_gate_history
  (scope,user_id,effective_at DESC,revision DESC);
INSERT INTO app_private.adventure_pet_gate_history(scope,enabled)
  VALUES('global',false);
ALTER TABLE app_private.adventure_pet_rollout ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.adventure_pet_allowlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.adventure_pet_selection ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.adventure_pet_gate_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.adventure_pet_rollout, app_private.adventure_pet_allowlist,
  app_private.adventure_pet_selection, app_private.adventure_pet_gate_history
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE app_private.adventure_pet_selection_revision_seq,
  app_private.adventure_pet_gate_history_revision_seq FROM PUBLIC,anon,authenticated;

CREATE FUNCTION app_private.adventure_pet_gate_clock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $clock$
BEGIN
  IF TG_TABLE_NAME='adventure_pet_rollout' THEN
    IF TG_OP='UPDATE' THEN
      IF NEW.global_enabled IS DISTINCT FROM OLD.global_enabled THEN
        NEW.enabled_at:=CASE WHEN NEW.global_enabled THEN clock_timestamp() ELSE NULL END;
      ELSE NEW.enabled_at:=OLD.enabled_at; END IF;
    END IF;
  ELSIF TG_TABLE_NAME='adventure_pet_allowlist' THEN
    IF TG_OP='INSERT' THEN NEW.enabled_at:=clock_timestamp();
    ELSIF TG_OP='UPDATE' THEN
      IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
        RAISE EXCEPTION 'PET_ALLOWLIST_IDENTITY_PROTECTED' USING ERRCODE='22023';
      END IF;
      NEW.enabled_at:=OLD.enabled_at;
    END IF;
  END IF;
  RETURN NEW;
END $clock$;
CREATE FUNCTION app_private.adventure_pet_gate_record()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $record$
BEGIN
  IF TG_TABLE_NAME='adventure_pet_rollout' THEN
    IF NEW.global_enabled IS DISTINCT FROM OLD.global_enabled THEN
      INSERT INTO app_private.adventure_pet_gate_history(scope,enabled,effective_at)
      VALUES('global',NEW.global_enabled,clock_timestamp());
    END IF;
  ELSIF TG_OP='INSERT' THEN
    INSERT INTO app_private.adventure_pet_gate_history(scope,user_id,enabled,effective_at)
    VALUES('user',NEW.user_id,true,NEW.enabled_at);
  ELSIF TG_OP='DELETE' THEN
    INSERT INTO app_private.adventure_pet_gate_history(scope,user_id,enabled,effective_at)
    VALUES('user',OLD.user_id,false,clock_timestamp());
  END IF;
  RETURN NULL;
END $record$;
CREATE TRIGGER adventure_pet_rollout_clock BEFORE UPDATE ON app_private.adventure_pet_rollout
  FOR EACH ROW EXECUTE FUNCTION app_private.adventure_pet_gate_clock();
CREATE TRIGGER adventure_pet_rollout_history AFTER UPDATE ON app_private.adventure_pet_rollout
  FOR EACH ROW EXECUTE FUNCTION app_private.adventure_pet_gate_record();
CREATE TRIGGER adventure_pet_allowlist_clock BEFORE INSERT OR UPDATE ON app_private.adventure_pet_allowlist
  FOR EACH ROW EXECUTE FUNCTION app_private.adventure_pet_gate_clock();
CREATE TRIGGER adventure_pet_allowlist_history AFTER INSERT OR DELETE ON app_private.adventure_pet_allowlist
  FOR EACH ROW EXECUTE FUNCTION app_private.adventure_pet_gate_record();
REVOKE ALL ON FUNCTION app_private.adventure_pet_gate_clock(),
  app_private.adventure_pet_gate_record() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION app_private.adventure_pet_catalog(p_type text)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $catalog$
  SELECT CASE p_type
    WHEN 'spirit_fox' THEN '{"stat":"mp","pct":0.10}'::jsonb
    WHEN 'calopsita' THEN '{"stat":"mp","pct":0.10}'::jsonb
    WHEN 'mini_necromante' THEN '{"stat":"mp","pct":0.10}'::jsonb
    WHEN 'mini_leviata' THEN '{"stat":"mp","pct":0.10}'::jsonb
    WHEN 'golem_guardian' THEN '{"stat":"hp","pct":0.10}'::jsonb
    WHEN 'mini_kraken' THEN '{"stat":"hp","pct":0.10}'::jsonb
    WHEN 'dog' THEN '{"stat":"hp","pct":0.10}'::jsonb
    WHEN 'mini_dragao_sombrio' THEN '{"stat":"atk","pct":0.10}'::jsonb
    WHEN 'mini_demonio_fome' THEN '{"stat":"atk","pct":0.10}'::jsonb
    WHEN 'mini_relampago' THEN '{"stat":"def","pct":0.10}'::jsonb
    WHEN 'mini_wyrm_gelo' THEN '{"stat":"def","pct":0.10}'::jsonb
    WHEN 'cat' THEN '{"stat":"def","pct":0.10}'::jsonb
    ELSE NULL END
$catalog$;
CREATE FUNCTION app_private.adventure_pet_sustain(p_type text)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $sustain$
  SELECT CASE p_type
    WHEN 'mini_kraken' THEN '{"kind":"regen_hp","pct":0.05}'::jsonb
    WHEN 'mini_necromante' THEN '{"kind":"regen_mp","pct":0.08}'::jsonb
    WHEN 'mini_leviata' THEN '{"kind":"mp_cost","pct":0.20}'::jsonb
    ELSE NULL END
$sustain$;

CREATE FUNCTION app_private.adventure_pet_at(p_user uuid,p_started_at timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $at$
  SELECT jsonb_build_object('companion_id',c.id,'companion_type',s.companion_type,
    'name',s.name,'bonus',app_private.adventure_pet_catalog(s.companion_type),
    'sustain',app_private.adventure_pet_sustain(s.companion_type))
  FROM app_private.adventure_pet_selection s
  JOIN public.companions c ON c.id=s.companion_id AND c.user_id=s.user_id
    AND c.companion_type=s.companion_type
  WHERE s.user_id=p_user AND s.effective_at<=p_started_at
    AND app_private.adventure_pet_catalog(s.companion_type) IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM (
        SELECT h.enabled,h.effective_at FROM app_private.adventure_pet_gate_history h
        WHERE h.scope='global' AND h.effective_at<=p_started_at
        ORDER BY h.effective_at DESC,h.revision DESC LIMIT 1
      ) g WHERE g.enabled AND s.effective_at>=g.effective_at
      UNION ALL
      SELECT 1 FROM (
        SELECT h.enabled,h.effective_at FROM app_private.adventure_pet_gate_history h
        WHERE h.scope='user' AND h.user_id=p_user AND h.effective_at<=p_started_at
        ORDER BY h.effective_at DESC,h.revision DESC LIMIT 1
      ) a WHERE a.enabled AND s.effective_at>=a.effective_at)
    AND s.revision=(SELECT x.revision FROM app_private.adventure_pet_selection x
      WHERE x.user_id=p_user AND x.effective_at<=p_started_at
      ORDER BY x.effective_at DESC,x.revision DESC LIMIT 1)
$at$;
REVOKE ALL ON FUNCTION app_private.adventure_pet_catalog(text),
  app_private.adventure_pet_sustain(text),
  app_private.adventure_pet_at(uuid,timestamptz) FROM PUBLIC,anon,authenticated;
-- These trigger helpers were callable by PUBLIC in the captured source even
-- though trigger-returning functions cannot be invoked directly by SQL.
REVOKE ALL ON FUNCTION public._guard_inventory_forage_pet(),
  public._record_inventory_forage_pet() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.get_adventure_pet_state()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $get$
DECLARE v_uid uuid:=auth.uid(); v_enabled boolean; v_active uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
  SELECT ((r.global_enabled AND r.enabled_at<=clock_timestamp()) OR EXISTS(SELECT 1 FROM app_private.adventure_pet_allowlist a
    WHERE a.user_id=v_uid AND a.enabled_at<=clock_timestamp())) INTO v_enabled
    FROM app_private.adventure_pet_rollout r WHERE r.singleton;
  IF v_enabled THEN
    v_active:=(app_private.adventure_pet_at(v_uid,clock_timestamp())->>'companion_id')::uuid;
  END IF;
  RETURN jsonb_build_object('enabled',coalesce(v_enabled,false),
    'active_companion_id',v_active,'pets',coalesce((SELECT jsonb_agg(
      jsonb_build_object('id',c.id,'companion_type',c.companion_type,'name',c.name,
        'bonus',app_private.adventure_pet_catalog(c.companion_type),
        'sustain',app_private.adventure_pet_sustain(c.companion_type)) ORDER BY c.created_at,c.id)
      FROM public.companions c WHERE c.user_id=v_uid
        AND app_private.adventure_pet_catalog(c.companion_type) IS NOT NULL),'[]'::jsonb));
END $get$;

CREATE FUNCTION public.set_active_adventure_pet(p_companion_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $set$
DECLARE v_uid uuid:=auth.uid(); v_enabled boolean; v_pet public.companions%ROWTYPE;
  v_current uuid; v_effective_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
  PERFORM 1 FROM public.profiles WHERE user_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND' USING ERRCODE='22023'; END IF;
  SELECT ((r.global_enabled AND r.enabled_at<=clock_timestamp()) OR EXISTS(SELECT 1 FROM app_private.adventure_pet_allowlist a
    WHERE a.user_id=v_uid AND a.enabled_at<=clock_timestamp())) INTO v_enabled
    FROM app_private.adventure_pet_rollout r WHERE r.singleton;
  IF NOT coalesce(v_enabled,false) THEN RAISE EXCEPTION 'PET_ROLLOUT_DISABLED' USING ERRCODE='22023'; END IF;
  IF p_companion_id IS NOT NULL THEN
    SELECT * INTO v_pet FROM public.companions c
      WHERE c.id=p_companion_id AND c.user_id=v_uid FOR KEY SHARE;
    IF NOT FOUND OR app_private.adventure_pet_catalog(v_pet.companion_type) IS NULL THEN
      RAISE EXCEPTION 'PET_NOT_OWNED' USING ERRCODE='22023';
    END IF;
  END IF;
  v_current:=(app_private.adventure_pet_at(v_uid,clock_timestamp())->>'companion_id')::uuid;
  IF v_current IS DISTINCT FROM p_companion_id THEN
    v_effective_at:=clock_timestamp();
    INSERT INTO app_private.adventure_pet_selection
      (user_id,companion_id,companion_type,name,effective_at)
    VALUES(v_uid,p_companion_id,v_pet.companion_type,v_pet.name,v_effective_at);
  END IF;
  RETURN public.get_adventure_pet_state();
END $set$;
REVOKE ALL ON FUNCTION public.get_adventure_pet_state(),
  public.set_active_adventure_pet(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_adventure_pet_state(),
  public.set_active_adventure_pet(uuid) TO authenticated;

-- Exact, one-occurrence source surgery keeps the 32 KB economic engine intact.
CREATE FUNCTION pg_temp.pet_replace_once(p_source text,p_old text,p_new text)
RETURNS text LANGUAGE plpgsql AS $once$
BEGIN
  IF p_old='' OR (length(p_source)-length(replace(p_source,p_old,'')))<>length(p_old) THEN
    RAISE EXCEPTION 'PET_REPLACEMENT_DRIFT: %',left(p_old,100) USING ERRCODE='22023';
  END IF;
  RETURN replace(p_source,p_old,p_new);
END $once$;

DO $patch$
DECLARE v_source text;
BEGIN
  v_source:=pg_get_functiondef('app_private.adventure_simulate_v3(timestamptz,integer,integer,integer,integer,integer,integer,jsonb,jsonb,text,integer)'::regprocedure);
  v_source:=pg_temp.pet_replace_once(v_source,
    'p_rotation integer)', 'p_rotation integer, p_sustain jsonb)');
  v_source:=pg_temp.pet_replace_once(v_source,
    'v_cost := (v_skill->>''mp_cost'')::integer;',
    'v_cost := (v_skill->>''mp_cost'')::integer;
        IF p_sustain->>''kind''=''mp_cost'' THEN
          v_cost := greatest(0,round(v_cost*(1-(p_sustain->>''pct'')::numeric))::integer);
        END IF;');
  v_source:=pg_temp.pet_replace_once(v_source,
    '    v_events := v_events || jsonb_build_array(jsonb_build_object(',
    '    IF i%2=0 AND v_hero_hp>0 AND v_enemy_hp>0 THEN
      IF p_sustain->>''kind''=''regen_hp'' THEN
        v_heal:=least(p_max_hp-v_hero_hp,round(p_max_hp*(p_sustain->>''pct'')::numeric)::integer);
        v_hero_hp:=v_hero_hp+v_heal;
      ELSIF p_sustain->>''kind''=''regen_mp'' THEN
        v_mp:=least(p_max_mp,v_mp+round(p_max_mp*(p_sustain->>''pct'')::numeric)::integer);
      END IF;
    END IF;
    v_events := v_events || jsonb_build_array(jsonb_build_object(');
  EXECUTE v_source;
  EXECUTE 'REVOKE ALL ON FUNCTION app_private.adventure_simulate_v3(timestamptz,integer,integer,integer,integer,integer,integer,jsonb,jsonb,text,integer,jsonb) FROM PUBLIC,anon,authenticated';

  v_source:=pg_get_functiondef('app_private.adventure_battle_payload(app_private.adventure_battles,timestamptz)'::regprocedure);
  v_source:=pg_temp.pet_replace_once(v_source,
    '''enemy_resistances'',p_battle.enemy_resistances) ELSE ''{}''::jsonb END;',
    '''enemy_resistances'',p_battle.enemy_resistances,
      ''pet'',p_battle.rules_snapshot->''pet'') ELSE jsonb_build_object(''pet'',NULL) END;');
  EXECUTE v_source;

  v_source:=pg_get_functiondef('app_private.sync_auto_adventure()'::regprocedure);
  v_source:=pg_temp.pet_replace_once(v_source,
    '  v_rules_snapshot jsonb;',
    '  v_rules_snapshot jsonb;
  v_pet jsonb;
  v_base_stats jsonb;');
  v_source:=pg_temp.pet_replace_once(v_source,
    '    IF v_skills <> ''[]''::jsonb THEN',
    '    IF v_engine_version=''v3'' THEN
      v_base_stats:=CASE WHEN v_prior.id IS NOT NULL AND v_start<v_now-interval ''30 seconds''
        THEN coalesce(v_prior.rules_snapshot->''pet''->''base_stats'',
          jsonb_build_object(''atk'',v_prior.hero_attack,''def'',v_prior.hero_defense,
            ''hp'',v_prior.hero_max_hp,''mp'',v_prior.hero_max_mp))
        ELSE jsonb_build_object(''atk'',v_hero_attack,''def'',v_hero_defense,
          ''hp'',v_hero_max,''mp'',v_hero_max_mp) END;
      v_hero_attack:=(v_base_stats->>''atk'')::integer;
      v_hero_defense:=(v_base_stats->>''def'')::integer;
      v_hero_max:=(v_base_stats->>''hp'')::integer;
      v_hero_max_mp:=(v_base_stats->>''mp'')::integer;
      v_pet:=app_private.adventure_pet_at(v_uid,v_start);
      IF v_pet IS NOT NULL THEN
        CASE v_pet->''bonus''->>''stat''
          WHEN ''atk'' THEN v_hero_attack:=round(v_hero_attack*1.10)::integer;
          WHEN ''def'' THEN v_hero_defense:=round(v_hero_defense*1.10)::integer;
          WHEN ''hp'' THEN v_hero_max:=round(v_hero_max*1.10)::integer;
          WHEN ''mp'' THEN v_hero_max_mp:=round(v_hero_max_mp*1.10)::integer;
        END CASE;
        v_pet:=v_pet || jsonb_build_object(''base_stats'',v_base_stats,
          ''effective_stats'',jsonb_build_object(''atk'',v_hero_attack,''def'',v_hero_defense,
            ''hp'',v_hero_max,''mp'',v_hero_max_mp));
      END IF;
      v_hero:=v_hero_attack+v_hero_defense/2+v_hero_max/10;
      v_rules_snapshot:=v_rules_snapshot || jsonb_build_object(''hero_attack'',v_hero_attack,
        ''hero_defense'',v_hero_defense,''hero_max_hp'',v_hero_max,
        ''hero_max_mp'',v_hero_max_mp,''pet'',v_pet);
    END IF;
    IF v_skills <> ''[]''::jsonb THEN');
  v_source:=pg_temp.pet_replace_once(v_source,
    'v_default_effect,v_state.skill_rotation);',
    'v_default_effect,v_state.skill_rotation,v_rules_snapshot->''pet''->''sustain'');');
  EXECUTE v_source;
END $patch$;

COMMIT;
