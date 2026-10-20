-- Disposable PostgreSQL 17 fixture for 20261020040235_portal_coop_authoritative.sql.
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TABLE public.profiles(user_id uuid PRIMARY KEY REFERENCES auth.users(id),display_name text,
  level integer NOT NULL,total_xp integer NOT NULL DEFAULT 0,
  boss_keys integer NOT NULL DEFAULT 0,missions_completed integer NOT NULL DEFAULT 0,
  xp_today integer NOT NULL DEFAULT 0,inspired_available boolean NOT NULL DEFAULT false,
  inspired_earned_at timestamptz);
-- Canonical Primary guard definitions captured read-only on 2026-10-20.
-- Preserve whitespace inside the bodies: the migration pins normalized MD5.
CREATE OR REPLACE FUNCTION public._guard_profiles_economy()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF current_user IN ('authenticated', 'anon') AND (
       NEW.total_xp            IS DISTINCT FROM OLD.total_xp OR
       NEW.level               IS DISTINCT FROM OLD.level OR
       NEW.boss_keys           IS DISTINCT FROM OLD.boss_keys OR
       NEW.missions_completed  IS DISTINCT FROM OLD.missions_completed OR
       NEW.xp_today            IS DISTINCT FROM OLD.xp_today OR
       NEW.inspired_available  IS DISTINCT FROM OLD.inspired_available OR
       NEW.inspired_earned_at  IS DISTINCT FROM OLD.inspired_earned_at
     ) THEN
    RAISE EXCEPTION 'Colunas de progressão são protegidas — use os RPCs do jogo.';
  END IF;
  RETURN NEW;
END $function$;
CREATE TRIGGER guard_profiles_economy BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public._guard_profiles_economy();
CREATE OR REPLACE FUNCTION public._guard_progression_initial_values()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
    BEGIN
      IF current_user IN ('anon', 'authenticated') THEN
        IF TG_TABLE_NAME = 'profiles' THEN
          IF NEW.total_xp <> 0 OR NEW.xp_today <> 0 OR NEW.level <> 1
             OR NEW.missions_completed <> 0 OR NEW.boss_keys <> 0
             OR NEW.inspired_available OR NEW.inspired_earned_at IS NOT NULL THEN
            RAISE EXCEPTION 'Initial progression values must be server defaults';
          END IF;
        ELSIF TG_TABLE_NAME = 'attributes' THEN
          IF NEW.xp <> 0 OR NEW.level <> 1 THEN
            RAISE EXCEPTION 'Initial attribute progression must be server defaults';
          END IF;
        END IF;
      END IF;
      RETURN NEW;
    END;
    $function$;
REVOKE ALL ON FUNCTION public._guard_progression_initial_values() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public._guard_progression_initial_values() TO service_role;
CREATE TRIGGER guard_profiles_progression_insert BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public._guard_progression_initial_values();
CREATE TABLE public.companions(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id),name text,
  level integer NOT NULL,companion_role text NOT NULL,current_hp integer NOT NULL);
CREATE TABLE public.bosses(id uuid PRIMARY KEY,name text NOT NULL,icon text NOT NULL,level integer NOT NULL,
  hp integer NOT NULL,ataque_base integer NOT NULL,defesa_base integer NOT NULL,
  is_world_event boolean NOT NULL DEFAULT false,is_final_boss boolean NOT NULL DEFAULT false);
CREATE TABLE public.portal_events(id uuid PRIMARY KEY,is_active boolean NOT NULL,
  starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL);
CREATE TABLE public.player_portal_rolls(user_id uuid NOT NULL,event_id uuid NOT NULL,portal_color text NOT NULL,
  PRIMARY KEY(user_id,event_id));
CREATE FUNCTION public._roll_portal_color(integer) RETURNS text LANGUAGE sql AS $$ SELECT 'blue'::text $$;
CREATE OR REPLACE FUNCTION public._get_or_roll_portal_color(p_uid uuid, p_event_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_color text;
  v_level int;
BEGIN
  SELECT portal_color INTO v_color
  FROM public.player_portal_rolls WHERE user_id = p_uid AND event_id = p_event_id;

  IF v_color IS NULL THEN
    SELECT COALESCE(level, 1) INTO v_level FROM public.profiles WHERE user_id = p_uid;
    v_color := public._roll_portal_color(COALESCE(v_level, 1));
    INSERT INTO public.player_portal_rolls (user_id, event_id, portal_color)
    VALUES (p_uid, p_event_id, v_color)
    ON CONFLICT (user_id, event_id) DO NOTHING;
    SELECT portal_color INTO v_color
    FROM public.player_portal_rolls WHERE user_id = p_uid AND event_id = p_event_id;
  END IF;

  RETURN v_color;
END;
$function$;
CREATE TABLE public.portal_runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,
  event_id uuid NOT NULL,portal_color text NOT NULL,completed boolean NOT NULL DEFAULT false,
  xp_earned integer NOT NULL DEFAULT 0,gold_earned integer NOT NULL DEFAULT 0,
  fragment_earned boolean NOT NULL DEFAULT false,fragments_received integer NOT NULL DEFAULT 0,
  legendary_item_received boolean NOT NULL DEFAULT false,ran_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX portal_runs_unique_win ON public.portal_runs(user_id,event_id,portal_color) WHERE completed;
CREATE TABLE public.portal_run_participants(event_id uuid NOT NULL,user_id uuid NOT NULL,PRIMARY KEY(event_id,user_id));
CREATE TABLE public.player_portal_fragments(user_id uuid PRIMARY KEY,fragments integer NOT NULL DEFAULT 0,
  lifetime_fragments integer NOT NULL DEFAULT 0,weekly_fragments integer NOT NULL DEFAULT 0,week_start date,
  pending_dungeon text,dungeon_revealed_at timestamptz,dungeon_expires_at timestamptz,updated_at timestamptz DEFAULT now());
CREATE TABLE public.fragment_dungeon_sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.fragment_dungeon_players(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE OR REPLACE FUNCTION public.complete_portal_run(p_event_id uuid, p_xp_earned integer, p_gold_earned integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_color text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000'; END IF;
  -- The profile row serializes duplicate claims from the same user.
  PERFORM 1 FROM public.profiles WHERE user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.portal_events WHERE id = p_event_id AND is_active) THEN
    RETURN jsonb_build_object('error','Portal não encontrado.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.portal_runs WHERE user_id = v_uid AND event_id = p_event_id AND completed) THEN
    RETURN jsonb_build_object('already_claimed',true);
  END IF;
  v_color := public._get_or_roll_portal_color(v_uid,p_event_id);
  INSERT INTO public.portal_runs
    (user_id,event_id,portal_color,completed,fragment_earned,fragments_received,
     xp_earned,gold_earned,legendary_item_received)
  VALUES (v_uid,p_event_id,v_color,true,false,0,0,0,false);
  RETURN jsonb_build_object('already_claimed',false,'portal_color',v_color,
    'frags_dropped',0,'frag_per_player',0,'participant_count',0,
    'legendary_item',false,'dungeon_tier',null,'rewards_verified',false);
END;
$function$;
CREATE OR REPLACE FUNCTION public.complete_portal_run(p_event_id uuid, p_portal_color text, p_xp_earned integer, p_gold_earned integer, p_fragment_earned boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_already_won BOOLEAN;
  v_fragments   INTEGER;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM portal_runs
    WHERE user_id      = auth.uid()
      AND event_id     = p_event_id
      AND portal_color = p_portal_color
      AND completed    = TRUE
  ) INTO v_already_won;

  IF v_already_won THEN
    RETURN jsonb_build_object('already_claimed', TRUE, 'fragments', 0);
  END IF;

  INSERT INTO portal_runs
    (user_id, event_id, portal_color, completed, fragment_earned, xp_earned, gold_earned)
  VALUES
    (auth.uid(), p_event_id, p_portal_color, TRUE,
     p_fragment_earned, p_xp_earned, p_gold_earned);

  IF p_fragment_earned THEN
    INSERT INTO player_portal_fragments(user_id, fragments, lifetime_fragments)
    VALUES (auth.uid(), 1, 1)
    ON CONFLICT (user_id) DO UPDATE SET
      fragments          = player_portal_fragments.fragments + 1,
      lifetime_fragments = player_portal_fragments.lifetime_fragments + 1,
      updated_at         = NOW();
  END IF;

  SELECT COALESCE(
    (SELECT fragments FROM player_portal_fragments WHERE user_id = auth.uid()), 0
  ) INTO v_fragments;

  RETURN jsonb_build_object(
    'already_claimed', FALSE,
    'fragments',       v_fragments
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.create_fragment_dungeon(p_tier text, p_is_public boolean, p_display_name text, p_level integer, p_atk integer, p_def integer, p_hp integer, p_max_hp integer, p_class text DEFAULT 'novato'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_fragments   INTEGER;
  v_session_id  UUID;
  v_invite_code TEXT;
BEGIN
  SELECT COALESCE(fragments, 0) INTO v_fragments
  FROM player_portal_fragments WHERE user_id = auth.uid();

  IF v_fragments < 10 THEN
    RETURN jsonb_build_object(
      'error', 'Fragmentos insuficientes. Necessário: 10, você tem: ' || v_fragments
    );
  END IF;

  v_invite_code := UPPER(SUBSTRING(MD5(gen_random_uuid()::TEXT), 1, 6));
  v_session_id  := gen_random_uuid();

  UPDATE player_portal_fragments
  SET fragments = fragments - 10, updated_at = NOW()
  WHERE user_id = auth.uid();

  INSERT INTO fragment_dungeon_sessions
    (id, host_id, dungeon_tier, is_public, invite_code, status)
  VALUES
    (v_session_id, auth.uid(), p_tier, p_is_public, v_invite_code, 'lobby');

  INSERT INTO fragment_dungeon_players
    (session_id, user_id, display_name, player_level, player_atk, player_def,
     player_class, current_hp, max_hp, is_host)
  VALUES
    (v_session_id, auth.uid(), p_display_name, p_level, p_atk, p_def,
     p_class, p_hp, p_max_hp, TRUE);

  RETURN jsonb_build_object(
    'session_id',  v_session_id,
    'invite_code', v_invite_code,
    'tier',        p_tier
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.join_fragment_dungeon(p_invite_code text, p_display_name text, p_level integer, p_atk integer, p_def integer, p_hp integer, p_max_hp integer, p_class text DEFAULT 'novato'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_session fragment_dungeon_sessions%ROWTYPE;
  v_count   INTEGER;
BEGIN
  SELECT * INTO v_session
  FROM fragment_dungeon_sessions
  WHERE invite_code = UPPER(p_invite_code) AND status = 'lobby';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Sessão não encontrada ou já iniciada.');
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM fragment_dungeon_players WHERE session_id = v_session.id;

  IF v_count >= v_session.max_players THEN
    RETURN jsonb_build_object(
      'error', 'Sessão cheia (máx ' || v_session.max_players || ' jogadores).'
    );
  END IF;

  -- idempotente: já está na sessão
  IF EXISTS(
    SELECT 1 FROM fragment_dungeon_players
    WHERE session_id = v_session.id AND user_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object(
      'session_id',  v_session.id,
      'invite_code', v_session.invite_code,
      'tier',        v_session.dungeon_tier,
      'already_in',  TRUE
    );
  END IF;

  INSERT INTO fragment_dungeon_players
    (session_id, user_id, display_name, player_level, player_atk, player_def,
     player_class, current_hp, max_hp, is_host)
  VALUES
    (v_session.id, auth.uid(), p_display_name, p_level, p_atk, p_def,
     p_class, p_hp, p_max_hp, FALSE);

  RETURN jsonb_build_object(
    'session_id',  v_session.id,
    'invite_code', v_session.invite_code,
    'tier',        v_session.dungeon_tier,
    'is_public',   v_session.is_public
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.claim_pending_dungeon()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_uid   UUID := auth.uid();
  v_tier  TEXT;
  v_frags INTEGER;
BEGIN
  SELECT pending_dungeon, fragments
  INTO v_tier, v_frags
  FROM player_portal_fragments
  WHERE user_id = v_uid;

  IF v_tier IS NULL THEN
    RETURN jsonb_build_object('error', 'Nenhuma dungeon pendente.');
  END IF;

  IF v_frags < 10 THEN
    RETURN jsonb_build_object('error', 'Fragmentos insuficientes para entrar na dungeon.');
  END IF;

  UPDATE player_portal_fragments
  SET
    fragments          = fragments - 10,
    pending_dungeon    = NULL,
    dungeon_revealed_at = NULL,
    dungeon_expires_at  = NULL,
    updated_at         = NOW()
  WHERE user_id = v_uid;

  RETURN jsonb_build_object('tier', v_tier, 'ok', TRUE);
END;
$function$;
INSERT INTO auth.users(id) SELECT ('00000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid FROM generate_series(1,7) g;
INSERT INTO public.profiles(user_id,display_name,level)
  SELECT id,'Jogador '||right(id::text,2),80 FROM auth.users
  WHERE id<>'00000000-0000-0000-0000-000000000007';
UPDATE public.profiles SET level=1 WHERE user_id='00000000-0000-0000-0000-000000000006';
INSERT INTO public.companions(id,user_id,name,level,companion_role,current_hp) VALUES
  ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Ossinho',5,'physical',20);
INSERT INTO public.bosses(id,name,icon,level,hp,ataque_base,defesa_base)
  SELECT ('20000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,'Boss '||g,'B',g*2,20,1,0
  FROM generate_series(1,30) g;
INSERT INTO public.portal_events(id,is_active,starts_at,ends_at)
  VALUES ('30000000-0000-0000-0000-000000000001',true,now()-interval '1 hour',now()+interval '1 day');
INSERT INTO public.player_portal_rolls(user_id,event_id,portal_color) VALUES
  ('00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','blue'),
  ('00000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','yellow');
INSERT INTO public.player_portal_fragments(user_id,fragments)
  SELECT id,100 FROM auth.users;
GRANT SELECT,INSERT,UPDATE ON public.profiles TO authenticated;
REVOKE ALL ON FUNCTION public.complete_portal_run(uuid,integer,integer),
  public.complete_portal_run(uuid,text,integer,integer,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_portal_run(uuid,integer,integer) TO authenticated;
