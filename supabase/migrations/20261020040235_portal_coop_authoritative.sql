-- Cooperative portal combat. No client-supplied level, damage, victory or rewards.
-- Thresholds and wave layouts are data so balancing does not change the API.
-- Reject a changed live contract before creating objects or revoking legacy access.
DO $preflight$
DECLARE v_expected record; v_proc oid; v_row pg_proc%ROWTYPE;
  v_guard record; v_guard_oid oid; v_guard_function pg_proc%ROWTYPE;
  v_trigger pg_trigger%ROWTYPE; v_public_exec boolean;
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname IN
      ('complete_portal_run','create_fragment_dungeon','join_fragment_dungeon','claim_pending_dungeon'))<>5 THEN
    RAISE EXCEPTION 'Portal legacy signatures drifted';
  END IF;
  FOR v_expected IN SELECT * FROM (VALUES
    ('public.complete_portal_run(uuid,integer,integer)','fe00a53d8e251ed707688fe2c4ede95f',true,false),
    ('public.complete_portal_run(uuid,text,integer,integer,boolean)','c36eb78f5b79296c51869fa7375c7bfd',false,false),
    ('public.create_fragment_dungeon(text,boolean,text,integer,integer,integer,integer,integer,text)','9031173bff28d0abd8ae86250c9a0c93',true,true),
    ('public.join_fragment_dungeon(text,text,integer,integer,integer,integer,integer,text)','4c935f873096ad61289656f87c0fd9ed',true,true),
    ('public.claim_pending_dungeon()','8c281ae6185e7d39a0fa704e789e5ecc',true,true),
    ('public._get_or_roll_portal_color(uuid,uuid)','6e39bcd6321eb3a38a0756c6d0223432',true,true)
  ) AS e(signature,definition_md5,auth_exec,anon_exec) LOOP
    v_proc:=to_regprocedure(v_expected.signature);
    IF v_proc IS NULL THEN RAISE EXCEPTION 'Missing portal legacy function: %',v_expected.signature; END IF;
    SELECT * INTO v_row FROM pg_proc WHERE oid=v_proc;
    IF pg_get_userbyid(v_row.proowner)<>'postgres' OR NOT v_row.prosecdef OR
       md5(replace(pg_get_functiondef(v_proc),chr(13),''))<>v_expected.definition_md5 OR
       has_function_privilege('authenticated',v_proc,'EXECUTE')<>v_expected.auth_exec OR
       has_function_privilege('anon',v_proc,'EXECUTE')<>v_expected.anon_exec THEN
      RAISE EXCEPTION 'Portal legacy definition or ACL drifted: %',v_expected.signature;
    END IF;
  END LOOP;
  -- Profile level is a portal admission input. Both deployed guards must still
  -- have their real bodies and fire for every matching row and column.
  FOR v_guard IN SELECT * FROM (VALUES
    ('public._guard_profiles_economy()','guard_profiles_economy',
     'cb1f62ea7e13d6fcdbadb83a62c1c669',NULL::text[],true,true,true,true,19),
    ('public._guard_progression_initial_values()','guard_profiles_progression_insert',
     'c04283b05e56ac30f0699ee13bb24b8c',ARRAY['search_path=public']::text[],false,false,true,false,7)
  ) AS e(signature,trigger_name,definition_md5,expected_config,auth_exec,anon_exec,service_exec,public_exec,trigger_type) LOOP
    v_guard_oid:=to_regprocedure(v_guard.signature);
    IF v_guard_oid IS NULL THEN
      RAISE EXCEPTION 'Profile guard function missing: %',v_guard.signature;
    END IF;
    SELECT * INTO v_guard_function FROM pg_proc WHERE oid=v_guard_oid;
    SELECT coalesce(bool_or(a.grantee=0 AND a.privilege_type='EXECUTE'),false)
      INTO v_public_exec
      FROM aclexplode(coalesce(v_guard_function.proacl,
        acldefault('f',v_guard_function.proowner))) a;
    IF pg_get_userbyid(v_guard_function.proowner)<>'postgres' OR
       v_guard_function.prorettype<>'pg_catalog.trigger'::regtype OR
       v_guard_function.prolang<>(SELECT oid FROM pg_language WHERE lanname='plpgsql') OR
       v_guard_function.pronargs<>0 OR v_guard_function.prosecdef OR
       v_guard_function.provolatile<>'v' OR v_guard_function.proisstrict OR
       v_guard_function.proleakproof OR v_guard_function.proparallel<>'u' OR
       v_guard_function.proconfig IS DISTINCT FROM v_guard.expected_config OR
       md5(replace(pg_get_functiondef(v_guard_oid),chr(13),''))<>v_guard.definition_md5 OR
       has_function_privilege('authenticated',v_guard_oid,'EXECUTE')<>v_guard.auth_exec OR
       has_function_privilege('anon',v_guard_oid,'EXECUTE')<>v_guard.anon_exec OR
       has_function_privilege('service_role',v_guard_oid,'EXECUTE')<>v_guard.service_exec OR
       v_public_exec<>v_guard.public_exec THEN
      RAISE EXCEPTION 'Profile guard definition or ACL drifted: %',v_guard.signature;
    END IF;
    SELECT * INTO v_trigger FROM pg_trigger WHERE tgrelid='public.profiles'::regclass
      AND tgname=v_guard.trigger_name;
    IF NOT FOUND OR v_trigger.tgfoid<>v_guard_oid OR
       v_trigger.tgtype<>v_guard.trigger_type OR
       v_trigger.tgattr::text<>'' OR v_trigger.tgenabled NOT IN ('O','A') OR
       v_trigger.tgisinternal OR v_trigger.tgconstraint<>0 OR v_trigger.tgqual IS NOT NULL THEN
      RAISE EXCEPTION 'Profile guard binding or event drifted: %',v_guard.trigger_name;
    END IF;
  END LOOP;
  -- A SET ROLE path away from anon/authenticated would evade their current_user
  -- branches even if the trigger bodies were intact.
  IF pg_get_userbyid((SELECT relowner FROM pg_class
       WHERE oid='public.profiles'::regclass))<>'postgres' OR
     NOT has_schema_privilege('authenticated','public','USAGE') OR
     NOT has_schema_privilege('anon','public','USAGE') OR
     has_parameter_privilege('authenticated','session_replication_role','SET') OR
     has_parameter_privilege('anon','session_replication_role','SET') OR
     EXISTS(SELECT 1 FROM pg_roles source_role CROSS JOIN pg_roles target_role
       WHERE source_role.rolname IN ('authenticated','anon')
         AND source_role.oid<>target_role.oid
         AND pg_has_role(source_role.oid,target_role.oid,'SET')) THEN
    RAISE EXCEPTION 'Profile guard caller authority drifted';
  END IF;
END $preflight$;

CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC,anon;
GRANT USAGE ON SCHEMA app_private TO authenticated;

CREATE TABLE public.portal_coop_config (
  difficulty text PRIMARY KEY CHECK (difficulty IN ('easy','medium','hard','legendary','ultra')),
  min_level integer NOT NULL CHECK (min_level > 0),
  wave_sizes integer[] NOT NULL CHECK (array_length(wave_sizes, 1) > 0)
);
INSERT INTO public.portal_coop_config VALUES
  ('easy',1,ARRAY[1]),('medium',20,ARRAY[1,1]),
  ('hard',30,ARRAY[1,2]),('legendary',40,ARRAY[2,1]),
  ('ultra',50,ARRAY[2,2,1]);

CREATE TABLE public.portal_coop_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL REFERENCES auth.users(id),
  request_id uuid NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('daily','fragments')),
  event_id uuid REFERENCES public.portal_events(id),
  portal_color text CHECK (portal_color IN ('blue','yellow','red','legendary')),
  difficulty text NOT NULL REFERENCES public.portal_coop_config(difficulty),
  invite_code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby','active','completed','failed','expired')),
  wave integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 minutes',
  completed_at timestamptz,
  UNIQUE(host_id, request_id),
  CHECK ((source_kind='daily') = (event_id IS NOT NULL))
);
CREATE TABLE public.portal_coop_members (
  session_id uuid NOT NULL REFERENCES public.portal_coop_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  display_name text NOT NULL,
  level_at_start integer NOT NULL,
  max_hp integer NOT NULL,
  hp integer NOT NULL,
  atk integer NOT NULL,
  def integer NOT NULL,
  companion_id uuid,
  companion_name text,
  companion_atk integer NOT NULL DEFAULT 0,
  last_action_at timestamptz,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(session_id,user_id)
);
CREATE TABLE public.portal_coop_enemies (
  session_id uuid NOT NULL REFERENCES public.portal_coop_sessions(id) ON DELETE CASCADE,
  wave integer NOT NULL,
  slot integer NOT NULL,
  boss_id uuid NOT NULL REFERENCES public.bosses(id),
  name text NOT NULL,
  icon text NOT NULL,
  max_hp integer NOT NULL,
  hp integer NOT NULL,
  atk integer NOT NULL,
  def integer NOT NULL,
  PRIMARY KEY(session_id,wave,slot)
);
CREATE TABLE public.portal_coop_actions (
  session_id uuid NOT NULL REFERENCES public.portal_coop_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  action_id uuid NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(session_id,user_id,action_id)
);
CREATE TABLE public.portal_coop_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.portal_coop_sessions(id) ON DELETE CASCADE,
  wave integer NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX portal_coop_members_user_idx ON public.portal_coop_members(user_id,joined_at DESC);
CREATE INDEX portal_coop_log_session_idx ON public.portal_coop_log(session_id,id DESC);
ALTER TABLE public.portal_runs ADD COLUMN IF NOT EXISTS coop_session_id uuid;

ALTER TABLE public.portal_coop_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_coop_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_coop_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_coop_enemies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_coop_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_coop_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.portal_coop_config, public.portal_coop_sessions,
  public.portal_coop_members, public.portal_coop_enemies, public.portal_coop_actions,
  public.portal_coop_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.portal_coop_config TO authenticated;
CREATE POLICY portal_coop_config_read ON public.portal_coop_config
  FOR SELECT TO authenticated USING (true);

-- These exact legacy portal signatures have client-declared completion/stats.
REVOKE ALL ON FUNCTION public.complete_portal_run(uuid,integer,integer),
  public.complete_portal_run(uuid,text,integer,integer,boolean),
  public.create_fragment_dungeon(text,boolean,text,integer,integer,integer,integer,integer,text),
  public.join_fragment_dungeon(text,text,integer,integer,integer,integer,integer,text),
  public.claim_pending_dungeon() FROM PUBLIC,anon,authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.fragment_dungeon_sessions,public.fragment_dungeon_players FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public._get_or_roll_portal_color(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION app_private.portal_coop_member_snapshot(p_uid uuid, p_companion_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_profile public.profiles%ROWTYPE; v_comp public.companions%ROWTYPE;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE user_id=p_uid;
  IF NOT FOUND OR v_profile.level IS NULL OR v_profile.level < 1 THEN
    RAISE EXCEPTION 'Perfil sem nível válido';
  END IF;
  IF p_companion_id IS NOT NULL THEN
    SELECT * INTO v_comp
      FROM public.companions WHERE id=p_companion_id AND user_id=p_uid;
    IF NOT FOUND OR v_comp.companion_role='none' OR v_comp.current_hp<=0 THEN
      RAISE EXCEPTION 'Companheiro de combate indisponível';
    END IF;
  END IF;
  RETURN jsonb_build_object('name',left(coalesce(v_profile.display_name,'Herói'),80),
    'level',v_profile.level,'max_hp',80+v_profile.level*8,
    'atk',12+v_profile.level*2,'def',5+v_profile.level,
    'companion_id',p_companion_id,'companion_name',v_comp.name,
    'companion_atk',CASE WHEN p_companion_id IS NULL THEN 0 ELSE least(20,5+v_comp.level/2) END);
END $$;
REVOKE ALL ON FUNCTION app_private.portal_coop_member_snapshot(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION app_private.portal_coop_create(p_source text,p_difficulty text,p_event_id uuid,p_request_id uuid,p_companion_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_uid uuid:=auth.uid(); v_level integer; v_req integer; v_color text; v_code text; v_difficulty text:=p_difficulty;
  v_id uuid; v_stats jsonb; v_existing public.portal_coop_sessions%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Chave de criação necessária'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text||p_request_id::text,0));
  SELECT * INTO v_existing FROM public.portal_coop_sessions WHERE host_id=v_uid AND request_id=p_request_id;
  IF FOUND THEN RETURN jsonb_build_object('session_id',v_existing.id,'invite_code',v_existing.invite_code,'already_created',true); END IF;
  IF p_source='daily' THEN
    PERFORM 1 FROM public.portal_events
      WHERE id=p_event_id AND is_active AND starts_at<=now() AND ends_at>now();
    IF NOT FOUND THEN RAISE EXCEPTION 'Evento indisponível'; END IF;
    v_color:=public._get_or_roll_portal_color(v_uid,p_event_id);
    v_difficulty:=CASE v_color WHEN 'blue' THEN 'easy' WHEN 'yellow' THEN 'medium'
      WHEN 'red' THEN 'hard' WHEN 'legendary' THEN 'legendary' ELSE NULL END;
    IF v_difficulty IS NULL OR (p_difficulty IS NOT NULL AND p_difficulty<>v_difficulty) THEN
      RAISE EXCEPTION 'Dificuldade incompatível com o portal'; END IF;
    IF EXISTS(SELECT 1 FROM public.portal_runs WHERE user_id=v_uid AND event_id=p_event_id AND completed) THEN
      RAISE EXCEPTION 'Portal diário já concluído'; END IF;
  ELSIF p_source='fragments' THEN
    IF p_event_id IS NOT NULL OR p_difficulty='easy' THEN RAISE EXCEPTION 'Entrada de fragmentos inválida'; END IF;
    UPDATE public.player_portal_fragments SET fragments=fragments-10,updated_at=now()
      WHERE user_id=v_uid AND fragments>=10;
    IF NOT FOUND THEN RAISE EXCEPTION 'Fragmentos insuficientes'; END IF;
    UPDATE public.player_portal_fragments SET pending_dungeon=NULL,dungeon_revealed_at=NULL,dungeon_expires_at=NULL
      WHERE user_id=v_uid AND pending_dungeon=p_difficulty;
  ELSE RAISE EXCEPTION 'Origem inválida'; END IF;
  v_stats:=app_private.portal_coop_member_snapshot(v_uid,p_companion_id);
  v_level:=(v_stats->>'level')::integer;
  SELECT min_level INTO v_req FROM public.portal_coop_config WHERE difficulty=v_difficulty;
  IF NOT FOUND OR v_level<v_req THEN RAISE EXCEPTION 'Nível mínimo não atendido'; END IF;
  v_code:=upper(substr(md5(gen_random_uuid()::text),1,8));
  INSERT INTO public.portal_coop_sessions(host_id,request_id,source_kind,event_id,portal_color,difficulty,invite_code)
    VALUES(v_uid,p_request_id,p_source,p_event_id,v_color,v_difficulty,v_code) RETURNING id INTO v_id;
  INSERT INTO public.portal_coop_members(session_id,user_id,display_name,level_at_start,max_hp,hp,atk,def,companion_id,companion_name,companion_atk)
    VALUES(v_id,v_uid,v_stats->>'name',v_level,(v_stats->>'max_hp')::integer,(v_stats->>'max_hp')::integer,
      (v_stats->>'atk')::integer,(v_stats->>'def')::integer,p_companion_id,v_stats->>'companion_name',(v_stats->>'companion_atk')::integer);
  RETURN jsonb_build_object('session_id',v_id,'invite_code',v_code,'difficulty',v_difficulty);
END $$;

CREATE FUNCTION app_private.portal_coop_join(p_code text,p_companion_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_uid uuid:=auth.uid(); v_s public.portal_coop_sessions%ROWTYPE; v_stats jsonb; v_req integer; v_count integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
  SELECT * INTO v_s FROM public.portal_coop_sessions WHERE invite_code=upper(p_code) FOR UPDATE;
  IF NOT FOUND OR v_s.status<>'lobby' OR v_s.expires_at<=now() THEN RAISE EXCEPTION 'Sala indisponível'; END IF;
  IF EXISTS(SELECT 1 FROM public.portal_coop_members WHERE session_id=v_s.id AND user_id=v_uid) THEN
    RETURN jsonb_build_object('session_id',v_s.id,'already_joined',true); END IF;
  SELECT count(*) INTO v_count FROM public.portal_coop_members WHERE session_id=v_s.id;
  IF v_count>=4 THEN RAISE EXCEPTION 'Sala cheia: máximo 4 jogadores'; END IF;
  v_stats:=app_private.portal_coop_member_snapshot(v_uid,p_companion_id);
  SELECT min_level INTO v_req FROM public.portal_coop_config WHERE difficulty=v_s.difficulty;
  IF (v_stats->>'level')::integer<v_req THEN RAISE EXCEPTION 'Nível mínimo não atendido'; END IF;
  IF v_s.source_kind='daily' AND EXISTS(SELECT 1 FROM public.portal_runs WHERE user_id=v_uid AND event_id=v_s.event_id AND completed) THEN
    RAISE EXCEPTION 'Portal diário já concluído'; END IF;
  IF v_s.source_kind='daily' THEN PERFORM public._get_or_roll_portal_color(v_uid,v_s.event_id); END IF;
  INSERT INTO public.portal_coop_members(session_id,user_id,display_name,level_at_start,max_hp,hp,atk,def,companion_id,companion_name,companion_atk)
    VALUES(v_s.id,v_uid,v_stats->>'name',(v_stats->>'level')::integer,(v_stats->>'max_hp')::integer,
      (v_stats->>'max_hp')::integer,(v_stats->>'atk')::integer,(v_stats->>'def')::integer,
      p_companion_id,v_stats->>'companion_name',(v_stats->>'companion_atk')::integer);
  RETURN jsonb_build_object('session_id',v_s.id);
END $$;

CREATE FUNCTION app_private.portal_coop_start(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_uid uuid:=auth.uid(); v_s public.portal_coop_sessions%ROWTYPE; v_count integer; v_min integer;
  v_sizes integer[]; v_wave integer; v_slot integer; v_boss record; v_member public.portal_coop_members%ROWTYPE;
  v_stats jsonb; v_req integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
  SELECT * INTO v_s FROM public.portal_coop_sessions WHERE id=p_session_id FOR UPDATE;
  IF NOT FOUND OR v_s.host_id<>v_uid THEN RAISE EXCEPTION 'Somente o host inicia'; END IF;
  IF v_s.status='active' THEN RETURN jsonb_build_object('session_id',v_s.id,'already_started',true); END IF;
  IF v_s.status<>'lobby' OR v_s.expires_at<=now() THEN RAISE EXCEPTION 'Sala indisponível'; END IF;
  SELECT count(*) INTO v_count FROM public.portal_coop_members WHERE session_id=v_s.id;
  IF v_count<2 OR v_count>4 THEN RAISE EXCEPTION 'Portal exige 2 a 4 jogadores'; END IF;
  SELECT wave_sizes,min_level INTO v_sizes,v_req FROM public.portal_coop_config WHERE difficulty=v_s.difficulty;
  -- Refresh every real member and owned companion at the same locked start point.
  -- Subsequent joins are rejected; this is the frozen combat roster.
  FOR v_member IN SELECT * FROM public.portal_coop_members WHERE session_id=v_s.id LOOP
    v_stats:=app_private.portal_coop_member_snapshot(v_member.user_id,v_member.companion_id);
    IF (v_stats->>'level')::integer<v_req THEN RAISE EXCEPTION 'Nível de integrante insuficiente'; END IF;
    UPDATE public.portal_coop_members SET display_name=v_stats->>'name',
      level_at_start=(v_stats->>'level')::integer,max_hp=(v_stats->>'max_hp')::integer,
      hp=(v_stats->>'max_hp')::integer,atk=(v_stats->>'atk')::integer,def=(v_stats->>'def')::integer,
      companion_name=v_stats->>'companion_name',companion_atk=(v_stats->>'companion_atk')::integer
      WHERE session_id=v_s.id AND user_id=v_member.user_id;
  END LOOP;
  SELECT min(level_at_start) INTO v_min FROM public.portal_coop_members WHERE session_id=v_s.id;
  IF v_s.source_kind='daily' AND EXISTS(SELECT 1 FROM public.portal_coop_members m JOIN public.portal_runs r
    ON r.user_id=m.user_id AND r.event_id=v_s.event_id AND r.completed WHERE m.session_id=v_s.id) THEN
    RAISE EXCEPTION 'Integrante já concluiu o portal diário'; END IF;
  IF v_s.source_kind='daily' AND NOT EXISTS(SELECT 1 FROM public.portal_events e
    WHERE e.id=v_s.event_id AND e.is_active AND e.starts_at<=now() AND e.ends_at>now()) THEN
    RAISE EXCEPTION 'Evento diário encerrado'; END IF;
  FOR v_wave IN 1..array_length(v_sizes,1) LOOP
    v_slot:=0;
    FOR v_boss IN SELECT id,name,icon,hp,ataque_base,defesa_base FROM public.bosses
      WHERE level BETWEEN greatest(1,least(v_req,60)-10) AND least(60,v_req+10,v_min+5)
        AND id NOT IN (SELECT boss_id FROM public.portal_coop_enemies WHERE session_id=v_s.id)
        AND coalesce(is_world_event,false)=false
        AND coalesce(is_final_boss,false)=false AND hp>0
      ORDER BY random() LIMIT v_sizes[v_wave]
    LOOP
      v_slot:=v_slot+1;
      INSERT INTO public.portal_coop_enemies(session_id,wave,slot,boss_id,name,icon,max_hp,hp,atk,def)
      VALUES(v_s.id,v_wave,v_slot,v_boss.id,v_boss.name,v_boss.icon,
        least(100000,greatest(20,v_boss.hp)*v_count),least(100000,greatest(20,v_boss.hp)*v_count),
        greatest(1,v_boss.ataque_base),greatest(0,v_boss.defesa_base));
    END LOOP;
    IF v_slot<>v_sizes[v_wave] THEN RAISE EXCEPTION 'Catálogo de bosses insuficiente'; END IF;
  END LOOP;
  UPDATE public.portal_coop_sessions SET status='active',wave=1,started_at=now(),expires_at=now()+interval '30 minutes' WHERE id=v_s.id;
  INSERT INTO public.portal_coop_log(session_id,wave,message) VALUES(v_s.id,1,'Encontro 1 iniciado com '||v_count||' jogadores.');
  RETURN jsonb_build_object('session_id',v_s.id,'status','active','players',v_count);
END $$;

CREATE FUNCTION app_private.portal_coop_state(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_uid uuid:=auth.uid(); v_s public.portal_coop_sessions%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS(SELECT 1 FROM public.portal_coop_members WHERE session_id=p_session_id AND user_id=v_uid) THEN
    RAISE EXCEPTION 'Não pertence à sala'; END IF;
  SELECT * INTO v_s FROM public.portal_coop_sessions WHERE id=p_session_id;
  RETURN jsonb_build_object('session_id',v_s.id,'host_id',v_s.host_id,'invite_code',v_s.invite_code,
    'source',v_s.source_kind,'difficulty',v_s.difficulty,'status',v_s.status,'wave',v_s.wave,
    'expires_at',v_s.expires_at,'players',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'user_id',m.user_id,'name',m.display_name,'level',m.level_at_start,'hp',m.hp,'max_hp',m.max_hp,
      'companion',m.companion_name) ORDER BY m.joined_at) FROM public.portal_coop_members m WHERE m.session_id=v_s.id),'[]'::jsonb),
    'enemies',coalesce((SELECT jsonb_agg(jsonb_build_object('slot',e.slot,'boss_id',e.boss_id,
      'name',e.name,'icon',e.icon,'hp',e.hp,'max_hp',e.max_hp) ORDER BY e.slot)
      FROM public.portal_coop_enemies e WHERE e.session_id=v_s.id AND e.wave=v_s.wave),'[]'::jsonb),
    'timeline',coalesce((SELECT jsonb_agg(jsonb_build_object('id',l.id,'message',l.message,'at',l.created_at) ORDER BY l.id)
      FROM (SELECT id,message,created_at FROM public.portal_coop_log WHERE session_id=v_s.id ORDER BY id DESC LIMIT 30) l),'[]'::jsonb));
END $$;

CREATE FUNCTION app_private.portal_coop_my_sessions()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('session_id',s.id,'difficulty',s.difficulty,
    'status',s.status,'source',s.source_kind,'created_at',s.created_at) ORDER BY s.created_at DESC)
    FROM (SELECT s.* FROM public.portal_coop_sessions s JOIN public.portal_coop_members m
      ON m.session_id=s.id WHERE m.user_id=auth.uid() AND
      ((s.status IN ('lobby','active') AND s.expires_at>now()) OR
       (s.status IN ('completed','failed') AND s.completed_at>now()-interval '1 day'))
      ORDER BY s.created_at DESC LIMIT 20) s),'[]'::jsonb);
END $$;

CREATE FUNCTION app_private.portal_coop_action(p_session_id uuid,p_action_id uuid,p_target_slot integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_uid uuid:=auth.uid(); v_s public.portal_coop_sessions%ROWTYPE; v_m public.portal_coop_members%ROWTYPE;
  v_e public.portal_coop_enemies%ROWTYPE; v_target public.portal_coop_members%ROWTYPE;
  v_damage integer; v_hit integer; v_result jsonb; v_color text; v_drop integer; v_tier text; v_roll numeric;
BEGIN
  IF v_uid IS NULL OR p_action_id IS NULL THEN RAISE EXCEPTION 'Ação autenticada necessária'; END IF;
  SELECT * INTO v_s FROM public.portal_coop_sessions WHERE id=p_session_id FOR UPDATE;
  SELECT result INTO v_result FROM public.portal_coop_actions WHERE session_id=p_session_id AND user_id=v_uid AND action_id=p_action_id;
  IF FOUND THEN RETURN v_result; END IF;
  SELECT * INTO v_m FROM public.portal_coop_members WHERE session_id=p_session_id AND user_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Não pertence à sala'; END IF;
  IF v_s.status<>'active' THEN RAISE EXCEPTION 'Combate não está ativo'; END IF;
  IF v_s.expires_at<=now() THEN
    UPDATE public.portal_coop_sessions SET status='expired',completed_at=now() WHERE id=p_session_id;
    RETURN jsonb_build_object('status','expired'); END IF;
  IF v_m.hp<=0 THEN RAISE EXCEPTION 'Herói incapacitado'; END IF;
  IF v_m.last_action_at>clock_timestamp()-interval '2 seconds' THEN RAISE EXCEPTION 'Ação em recarga'; END IF;
  SELECT * INTO v_e FROM public.portal_coop_enemies WHERE session_id=p_session_id AND wave=v_s.wave AND slot=p_target_slot FOR UPDATE;
  IF NOT FOUND OR v_e.hp<=0 THEN RAISE EXCEPTION 'Alvo indisponível'; END IF;
  v_damage:=greatest(1,v_m.atk+v_m.companion_atk-(v_e.def/2));
  UPDATE public.portal_coop_enemies SET hp=greatest(0,hp-v_damage)
    WHERE session_id=p_session_id AND wave=v_s.wave AND slot=v_e.slot;
  UPDATE public.portal_coop_members SET last_action_at=clock_timestamp() WHERE session_id=p_session_id AND user_id=v_uid;
  INSERT INTO public.portal_coop_log(session_id,wave,message) VALUES(p_session_id,v_s.wave,
    v_m.display_name||coalesce(' e '||v_m.companion_name,'')||' causaram '||v_damage||' de dano em '||v_e.name||'.');
  IF NOT EXISTS(SELECT 1 FROM public.portal_coop_enemies WHERE session_id=p_session_id AND wave=v_s.wave AND hp>0) THEN
    IF v_s.wave=(SELECT array_length(wave_sizes,1) FROM public.portal_coop_config WHERE difficulty=v_s.difficulty) THEN
      UPDATE public.portal_coop_sessions SET status='completed',completed_at=now() WHERE id=p_session_id;
      IF v_s.source_kind='daily' THEN
        -- A unique portal_runs win prevents duplicate rewards across competing sessions.
        WITH winners AS (
          INSERT INTO public.portal_runs(user_id,event_id,portal_color,completed,xp_earned,gold_earned,coop_session_id,
            fragment_earned,fragments_received,legendary_item_received)
          SELECT m.user_id,v_s.event_id,public._get_or_roll_portal_color(m.user_id,v_s.event_id),true,0,0,p_session_id,false,0,false
            FROM public.portal_coop_members m WHERE m.session_id=p_session_id
          ON CONFLICT DO NOTHING RETURNING user_id
        )
        INSERT INTO public.portal_run_participants(event_id,user_id)
          SELECT v_s.event_id,user_id FROM winners ON CONFLICT DO NOTHING;
        -- Reward roll belongs to this server transaction, once per newly recorded winner.
        FOR v_target IN SELECT m.* FROM public.portal_coop_members m JOIN public.portal_runs r
          ON r.user_id=m.user_id AND r.event_id=v_s.event_id AND r.completed AND r.coop_session_id=p_session_id
          WHERE m.session_id=p_session_id LOOP
          v_color:=public._get_or_roll_portal_color(v_target.user_id,v_s.event_id);
          v_drop:=CASE v_color WHEN 'blue' THEN 2 WHEN 'yellow' THEN 3 WHEN 'red' THEN 4 ELSE 6 END;
          IF random()<(CASE v_color WHEN 'blue' THEN 0.05 WHEN 'yellow' THEN 0.10 WHEN 'red' THEN 0.15 ELSE 0.25 END) THEN
            v_drop:=1+floor(random()*v_drop)::integer;
            UPDATE public.portal_runs SET fragment_earned=true,fragments_received=v_drop
              WHERE user_id=v_target.user_id AND event_id=v_s.event_id AND completed AND coop_session_id=p_session_id;
            INSERT INTO public.player_portal_fragments(user_id,fragments,lifetime_fragments,weekly_fragments,week_start)
              VALUES(v_target.user_id,v_drop,v_drop,v_drop,date_trunc('week',now())::date)
            ON CONFLICT(user_id) DO UPDATE SET fragments=public.player_portal_fragments.fragments+v_drop,
              lifetime_fragments=public.player_portal_fragments.lifetime_fragments+v_drop,
              weekly_fragments=CASE WHEN public.player_portal_fragments.week_start=date_trunc('week',now())::date
                THEN public.player_portal_fragments.weekly_fragments+v_drop ELSE v_drop END,
              week_start=date_trunc('week',now())::date,updated_at=now();
          END IF;
          -- Preserve the existing pending-dungeon inventory contract, awarded only
          -- after the server has recorded this member's cooperative victory.
          v_roll:=random()*100;
          v_tier:=CASE WHEN v_roll<45 THEN 'medium' WHEN v_roll<80 THEN 'hard'
            WHEN v_roll<95 THEN 'legendary' ELSE 'ultra' END;
          INSERT INTO public.player_portal_fragments(user_id,fragments,lifetime_fragments,weekly_fragments,week_start)
            VALUES(v_target.user_id,0,0,0,date_trunc('week',now())::date) ON CONFLICT(user_id) DO NOTHING;
          UPDATE public.player_portal_fragments
            SET pending_dungeon=v_tier,dungeon_revealed_at=now(),dungeon_expires_at=now()+interval '7 days'
            WHERE user_id=v_target.user_id AND pending_dungeon IS NULL;
        END LOOP;
      END IF;
      INSERT INTO public.portal_coop_log(session_id,wave,message) VALUES(p_session_id,v_s.wave,'Portal concluído. XP e ouro continuam exclusivos das rotinas.');
    ELSE
      UPDATE public.portal_coop_sessions SET wave=wave+1 WHERE id=p_session_id;
      INSERT INTO public.portal_coop_log(session_id,wave,message) VALUES(p_session_id,v_s.wave+1,'Encontro '||(v_s.wave+1)||' iniciado.');
    END IF;
  ELSE
    -- Every surviving boss acts after the member's attack. The server chooses victims.
    FOR v_e IN SELECT * FROM public.portal_coop_enemies WHERE session_id=p_session_id AND wave=v_s.wave AND hp>0 ORDER BY slot LOOP
      SELECT * INTO v_target FROM public.portal_coop_members WHERE session_id=p_session_id AND hp>0 ORDER BY random() LIMIT 1;
      EXIT WHEN NOT FOUND;
      v_hit:=greatest(1,v_e.atk-v_target.def/2);
      UPDATE public.portal_coop_members SET hp=greatest(0,hp-v_hit) WHERE session_id=p_session_id AND user_id=v_target.user_id;
      INSERT INTO public.portal_coop_log(session_id,wave,message) VALUES(p_session_id,v_s.wave,v_e.name||' causou '||v_hit||' de dano em '||v_target.display_name||'.');
    END LOOP;
    IF NOT EXISTS(SELECT 1 FROM public.portal_coop_members WHERE session_id=p_session_id AND hp>0) THEN
      UPDATE public.portal_coop_sessions SET status='failed',completed_at=now() WHERE id=p_session_id;
      INSERT INTO public.portal_coop_log(session_id,wave,message) VALUES(p_session_id,v_s.wave,'Grupo derrotado.');
    END IF;
  END IF;
  v_result:=jsonb_build_object('status',(SELECT status FROM public.portal_coop_sessions WHERE id=p_session_id),
    'wave',(SELECT wave FROM public.portal_coop_sessions WHERE id=p_session_id),'damage',v_damage);
  INSERT INTO public.portal_coop_actions(session_id,user_id,action_id,result) VALUES(p_session_id,v_uid,p_action_id,v_result);
  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION app_private.portal_coop_create(text,text,uuid,uuid,uuid),
  app_private.portal_coop_join(text,uuid),app_private.portal_coop_start(uuid),
  app_private.portal_coop_state(uuid),app_private.portal_coop_my_sessions(),
  app_private.portal_coop_action(uuid,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app_private.portal_coop_create(text,text,uuid,uuid,uuid),
  app_private.portal_coop_join(text,uuid),app_private.portal_coop_start(uuid),
  app_private.portal_coop_state(uuid),app_private.portal_coop_my_sessions(),
  app_private.portal_coop_action(uuid,uuid,integer) TO authenticated;

-- The exposed signatures stay stable and contain no privileged body.
CREATE FUNCTION public.portal_coop_create(p_source text,p_difficulty text,p_event_id uuid,p_request_id uuid,p_companion_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  SELECT app_private.portal_coop_create(p_source,p_difficulty,p_event_id,p_request_id,p_companion_id)
$$;
CREATE FUNCTION public.portal_coop_join(p_code text,p_companion_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  SELECT app_private.portal_coop_join(p_code,p_companion_id)
$$;
CREATE FUNCTION public.portal_coop_start(p_session_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  SELECT app_private.portal_coop_start(p_session_id)
$$;
CREATE FUNCTION public.portal_coop_state(p_session_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  SELECT app_private.portal_coop_state(p_session_id)
$$;
CREATE FUNCTION public.portal_coop_my_sessions()
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  SELECT app_private.portal_coop_my_sessions()
$$;
CREATE FUNCTION public.portal_coop_action(p_session_id uuid,p_action_id uuid,p_target_slot integer)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  SELECT app_private.portal_coop_action(p_session_id,p_action_id,p_target_slot)
$$;
REVOKE ALL ON FUNCTION public.portal_coop_create(text,text,uuid,uuid,uuid),
  public.portal_coop_join(text,uuid),public.portal_coop_start(uuid),
  public.portal_coop_state(uuid),public.portal_coop_my_sessions(),
  public.portal_coop_action(uuid,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.portal_coop_create(text,text,uuid,uuid,uuid),
  public.portal_coop_join(text,uuid),public.portal_coop_start(uuid),
  public.portal_coop_state(uuid),public.portal_coop_my_sessions(),
  public.portal_coop_action(uuid,uuid,integer) TO authenticated;
