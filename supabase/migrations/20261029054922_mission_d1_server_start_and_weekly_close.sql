-- D-1 server correction. Source provenance is pg_get_functiondef normalized to
-- UTF-8/LF, observed both in Primary on 2026-10-29 and in the reduced PG17
-- progression chain. Unknown bodies or authority metadata stop before DDL.
DO $preflight$
DECLARE
  v_expected record;
  v_proc pg_proc%ROWTYPE;
  v_definition text;
  v_trigger record;
  v_table pg_class%ROWTYPE;
BEGIN
  FOR v_expected IN SELECT * FROM (VALUES
    ('public.complete_mission(uuid,date)',
     '34317f24abdf4215c1837db9bbf3887f0aa6f6babc0e8d2a58ff5033f93e177f',
     '82433359e2073b0c64718561d3f813f9', true,
     ARRAY['search_path=public']::text[],
     '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}', true),
    ('public._evaluate_weekly_missions(uuid,date)',
     '893a3ffa2e1fbc0f78998f1a1e645009adebffc48bc822516fa057c6b628c023',
     '008e79df2d309ed0e73f2b0b645491cb', true,
     ARRAY['search_path=""','TimeZone=America/Sao_Paulo']::text[],
     '{postgres=X/postgres,service_role=X/postgres}', false),
    ('public._set_mission_weekly_started_at()',
     'b006cbb29ee54fdc2e498b0557232f38c029193e4ebdcffc1bb67fbda52371fc',
     'b008022b2984cdd095d75a893b8eec23', false,
     ARRAY['search_path=""']::text[],
     '{postgres=X/postgres,service_role=X/postgres}', false)
  ) AS e(signature, sha256_lf, md5_lf, definer, config, acl, client_execute) LOOP
    SELECT * INTO v_proc FROM pg_proc WHERE oid=to_regprocedure(v_expected.signature);
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='MISSION_D1_SOURCE_MISSING: '||v_expected.signature;
    END IF;
    v_definition := replace(pg_get_functiondef(v_proc.oid), E'\r\n', E'\n');
    IF v_proc.prokind <> 'f'
       OR pg_get_userbyid(v_proc.proowner) <> 'postgres'
       OR v_proc.prosecdef IS DISTINCT FROM v_expected.definer
       OR v_proc.proconfig IS DISTINCT FROM v_expected.config
       OR v_proc.proacl::text IS DISTINCT FROM v_expected.acl
       OR has_function_privilege('authenticated',v_proc.oid,'EXECUTE') IS DISTINCT FROM v_expected.client_execute
       OR has_function_privilege('anon',v_proc.oid,'EXECUTE')
       OR NOT has_function_privilege('service_role',v_proc.oid,'EXECUTE')
       OR strpos(v_definition,chr(13)) > 0
       OR md5(convert_to(v_definition,'UTF8')) <> v_expected.md5_lf
       OR encode(sha256(convert_to(v_definition,'UTF8')),'hex') <> v_expected.sha256_lf THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='MISSION_D1_SOURCE_DRIFT: '||v_expected.signature;
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='complete_mission') <> 1
     OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname='_evaluate_weekly_missions') <> 1
     OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname='_set_mission_weekly_started_at') <> 1
     OR to_regprocedure('private.guard_mission_created_at()') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_trigger
         WHERE tgrelid='public.missions'::regclass AND tgname='guard_mission_created_at') THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='MISSION_D1_SIGNATURE_OR_TRIGGER_DRIFT';
  END IF;
  SELECT t.tgenabled, pg_get_triggerdef(t.oid) AS definition INTO v_trigger
    FROM pg_trigger t WHERE t.tgrelid='public.missions'::regclass
      AND t.tgname='set_mission_weekly_started_at' AND NOT t.tgisinternal;
  IF NOT FOUND OR v_trigger.tgenabled <> 'O' OR v_trigger.definition <>
    'CREATE TRIGGER set_mission_weekly_started_at BEFORE INSERT OR UPDATE OF frequency_type, weekly_started_at ON public.missions FOR EACH ROW EXECUTE FUNCTION _set_mission_weekly_started_at()'
    OR (SELECT count(*) FROM pg_attribute WHERE attrelid='public.missions'::regclass
        AND attname='created_at' AND atttypid='timestamptz'::regtype
        AND attnotnull AND NOT attisdropped) <> 1
    OR (SELECT count(*) FROM pg_attribute WHERE attrelid='public.missions'::regclass
        AND attname='weekly_started_at' AND atttypid='timestamptz'::regtype
        AND NOT attisdropped) <> 1
    OR NOT has_column_privilege('authenticated','public.missions','created_at','INSERT')
    OR NOT has_column_privilege('authenticated','public.missions','created_at','UPDATE') THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='MISSION_D1_SCHEMA_DRIFT';
  END IF;

  -- The live author policy and every BEFORE trigger are part of the timestamp
  -- authority boundary. An extra trigger could overwrite created_at later.
  SELECT * INTO v_table FROM pg_class WHERE oid='public.missions'::regclass;
  IF pg_get_userbyid(v_table.relowner) <> 'postgres'
     OR v_table.relrowsecurity IS NOT TRUE OR v_table.relforcerowsecurity IS NOT FALSE
     OR (SELECT count(*) FROM pg_policy WHERE polrelid=v_table.oid) <> 4
     OR EXISTS (
       SELECT 1 FROM pg_policy p WHERE p.polrelid=v_table.oid AND NOT EXISTS (
         SELECT 1 FROM (VALUES
           ('Users can create own missions','a',NULL::text,'(auth.uid() = user_id)'),
           ('Users can delete own missions','d','(auth.uid() = user_id)',NULL::text),
           ('Users can update own missions','w','(auth.uid() = user_id)',NULL::text),
           ('Users can view own missions','r','(auth.uid() = user_id)',NULL::text)
         ) e(name,cmd,using_expr,check_expr)
         WHERE p.polname=e.name AND p.polcmd::text=e.cmd
           AND p.polpermissive IS TRUE AND p.polroles='{0}'::oid[]
           AND pg_get_expr(p.polqual,p.polrelid) IS NOT DISTINCT FROM e.using_expr
           AND pg_get_expr(p.polwithcheck,p.polrelid) IS NOT DISTINCT FROM e.check_expr
       ))
     OR (SELECT count(*) FROM pg_trigger t WHERE t.tgrelid=v_table.oid AND NOT t.tgisinternal) <> 5 THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='MISSION_D1_TABLE_AUTHORITY_DRIFT';
  END IF;
  FOR v_expected IN SELECT * FROM (VALUES
    ('before_mission_status_normalize',
     'CREATE TRIGGER before_mission_status_normalize BEFORE INSERT OR UPDATE ON public.missions FOR EACH ROW EXECUTE FUNCTION private.normalize_mission_status()',
     '733fa727c52c34bd196158f4ab13a4dc0375531221ba3727bc4bdfc16e4b94c1', false, '{postgres=X/postgres}'),
    ('enforce_mission_priority',
     'CREATE TRIGGER enforce_mission_priority BEFORE INSERT OR DELETE OR UPDATE ON public.missions FOR EACH ROW EXECUTE FUNCTION private.enforce_mission_priority()',
     '3a6ea96cb52fde90734c88e31c337a67f6a05acd74e804c9ed37c6dd29790874', true, '{postgres=X/postgres}'),
    ('lock_mission_priority_statement',
     'CREATE TRIGGER lock_mission_priority_statement BEFORE INSERT OR DELETE OR UPDATE ON public.missions FOR EACH STATEMENT EXECUTE FUNCTION private.lock_mission_priority_statement()',
     'b4283a234c9db71f5565723f2b3672a7c8eca6c7d4396f0af371ff52edcce68d', false, '{postgres=X/postgres}'),
    ('set_mission_weekly_started_at',
     'CREATE TRIGGER set_mission_weekly_started_at BEFORE INSERT OR UPDATE OF frequency_type, weekly_started_at ON public.missions FOR EACH ROW EXECUTE FUNCTION _set_mission_weekly_started_at()',
     'b006cbb29ee54fdc2e498b0557232f38c029193e4ebdcffc1bb67fbda52371fc', false, '{postgres=X/postgres,service_role=X/postgres}'),
    ('sync_weekly_mission_target_cap',
     'CREATE TRIGGER sync_weekly_mission_target_cap BEFORE INSERT OR UPDATE OF frequency_type, target_count, max_count ON public.missions FOR EACH ROW EXECUTE FUNCTION _sync_weekly_mission_target_cap()',
     '6d5bc03b9325aa54f96d31db7315391135cc4a97098aa3e6ba98c19cba781966', false, '{postgres=X/postgres,service_role=X/postgres}')
  ) e(name,definition,sha256_lf,definer,acl) LOOP
    SELECT t.tgenabled,pg_get_triggerdef(t.oid) AS definition,p.* INTO v_trigger
      FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
      WHERE t.tgrelid=v_table.oid AND t.tgname=v_expected.name AND NOT t.tgisinternal;
    IF NOT FOUND OR v_trigger.tgenabled <> 'O'
       OR v_trigger.definition <> v_expected.definition
       OR pg_get_userbyid(v_trigger.proowner) <> 'postgres'
       OR v_trigger.prosecdef IS DISTINCT FROM v_expected.definer
       OR v_trigger.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
       OR v_trigger.proacl::text IS DISTINCT FROM v_expected.acl
       OR encode(sha256(convert_to(replace(pg_get_functiondef(v_trigger.oid),E'\r\n',E'\n'),'UTF8')),'hex') <> v_expected.sha256_lf THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='MISSION_D1_TABLE_TRIGGER_DRIFT: '||v_expected.name;
    END IF;
  END LOOP;
END;
$preflight$;

-- Preserve the three known bodies, replacing exactly one audited anchor each.
DO $install$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
  v_count integer;
BEGIN
  v_definition := replace(pg_get_functiondef('public.complete_mission(uuid,date)'::regprocedure),E'\r\n',E'\n');
  v_old := '  IF private.mission_priority_occurs_on(v_m, v_target) IS NOT TRUE THEN';
  v_new := $guard$
  IF v_target < (v_m.created_at AT TIME ZONE 'America/Sao_Paulo')::date
     OR (v_m.frequency_type = 'weekly' AND
         v_target < (COALESCE(v_m.weekly_started_at,v_m.created_at)
           AT TIME ZONE 'America/Sao_Paulo')::date) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='MISSION_BEFORE_START';
  END IF;
  IF private.mission_priority_occurs_on(v_m, v_target) IS NOT TRUE THEN$guard$;
  v_count := (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old);
  IF v_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='MISSION_D1_COMPLETE_ANCHOR_DRIFT';
  END IF;
  EXECUTE replace(v_definition,v_old,v_new);

  v_definition := replace(pg_get_functiondef('public._evaluate_weekly_missions(uuid,date)'::regprocedure),E'\r\n',E'\n');
  v_old := '  v_last_closed_week date := v_current_week - 7;';
  v_new := E'  v_last_closed_week date := CASE\n    WHEN EXTRACT(isodow FROM p_today)::integer = 1 THEN v_current_week - 14\n    ELSE v_current_week - 7\n  END;';
  v_count := (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old);
  IF v_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='MISSION_D1_WEEKLY_ANCHOR_DRIFT';
  END IF;
  v_definition := replace(v_definition,v_old,v_new);
  v_old := E'  IF p_uid IS NULL THEN\n    RAISE EXCEPTION USING ERRCODE = ''P0001'', MESSAGE = ''NOT_AUTHENTICATED'';\n  END IF;\n\n  SELECT';
  v_new := E'  IF p_uid IS NULL THEN\n    RAISE EXCEPTION USING ERRCODE = ''P0001'', MESSAGE = ''NOT_AUTHENTICATED'';\n  END IF;\n\n  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_uid::text), 20261019);\n\n  SELECT';
  v_count := (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old);
  IF v_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='MISSION_D1_WEEKLY_LOCK_ANCHOR_DRIFT';
  END IF;
  EXECUTE replace(v_definition,v_old,v_new);

  v_definition := replace(pg_get_functiondef('public._set_mission_weekly_started_at()'::regprocedure),E'\r\n',E'\n');
  v_old := E'      NEW.weekly_started_at := COALESCE(\n        OLD.weekly_started_at,\n        NEW.weekly_started_at,\n        NEW.created_at,\n        now()\n      );';
  v_new := E'      NEW.weekly_started_at := COALESCE(\n        OLD.weekly_started_at,\n        OLD.created_at,\n        statement_timestamp()\n      );';
  v_count := (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old);
  IF v_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='MISSION_D1_WEEKLY_START_ANCHOR_DRIFT';
  END IF;
  EXECUTE replace(v_definition,v_old,v_new);
END;
$install$;

-- Any request with an authenticated identity, including a role inheriting
-- authenticated, must receive a server timestamp. Trusted maintenance without
-- a JWT can preserve historical imports. The alphabetical trigger name runs
-- before set_mission_weekly_started_at.
CREATE FUNCTION private.guard_mission_created_at()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $guard_created$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      NEW.created_at := statement_timestamp();
    ELSIF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='MISSION_CREATED_AT_IMMUTABLE';
    END IF;
  END IF;
  RETURN NEW;
END;
$guard_created$;
REVOKE ALL ON FUNCTION private.guard_mission_created_at() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_mission_created_at
  BEFORE INSERT OR UPDATE OF created_at ON public.missions
  FOR EACH ROW EXECUTE FUNCTION private.guard_mission_created_at();
