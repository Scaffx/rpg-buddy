-- Fixture REDUZIDA baseada nas colunas e funcoes capturadas em 19/10/2026.
-- Nao representa o schema integral do Supabase. Helpers secundarios abaixo sao
-- neutros; os corpos reais de conclusao sao carregados do snapshot pelo runner.
DO $roles$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $roles$;
CREATE SCHEMA auth;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}'::jsonb
);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL UNIQUE,
  display_name text DEFAULT 'Aventureiro', level integer NOT NULL DEFAULT 1,
  total_xp integer NOT NULL DEFAULT 0, xp_today integer NOT NULL DEFAULT 0,
  missions_completed integer NOT NULL DEFAULT 0, boss_keys integer NOT NULL DEFAULT 0,
  inspired_available boolean NOT NULL DEFAULT false, inspired_earned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.attributes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  name text NOT NULL, xp integer NOT NULL DEFAULT 0, level integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.user_balance (
  user_id uuid PRIMARY KEY, balance_percent integer DEFAULT 100,
  gold integer NOT NULL DEFAULT 100, updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  title text NOT NULL, description text, attribute_id uuid, xp_reward integer NOT NULL DEFAULT 25,
  priority text, completed boolean NOT NULL DEFAULT false, completed_at timestamptz,
  status text NOT NULL DEFAULT 'pendente', is_failed boolean NOT NULL DEFAULT false,
  due_date date,
  days_of_week jsonb DEFAULT '[]'::jsonb, daily_status jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  secondary_attribute_ids jsonb DEFAULT '[]'::jsonb, mission_category text, npc_id text,
  frequency_type text NOT NULL DEFAULT 'daily', target_count integer, max_count integer,
  weekly_started_at timestamptz
);
CREATE TABLE public.checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), mission_id uuid NOT NULL REFERENCES public.missions(id),
  description text NOT NULL, xp_bonus integer NOT NULL DEFAULT 2,
  completed boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.mission_daily_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), mission_id uuid REFERENCES public.missions(id),
  completion_date date NOT NULL DEFAULT CURRENT_DATE,
  xp_earned integer NOT NULL DEFAULT 0, gold_earned integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), user_id uuid NOT NULL,
  UNIQUE (mission_id, completion_date)
);
CREATE TABLE public.mission_weekly_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), mission_id uuid NOT NULL REFERENCES public.missions(id),
  user_id uuid NOT NULL, week_start date NOT NULL,
  current_count integer NOT NULL DEFAULT 0, milestone_paid boolean NOT NULL DEFAULT false,
  last_completed_date date, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  evaluation_status text NOT NULL DEFAULT 'pending', evaluated_at timestamptz,
  target_snapshot integer, shortfall integer,
  UNIQUE (mission_id, week_start)
);
CREATE TABLE public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  action text NOT NULL, description text, xp_gained integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE public.xp_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  xp_gained integer NOT NULL, type text NOT NULL, created_at timestamptz DEFAULT now()
);
CREATE TABLE public.gold_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  type text NOT NULL, amount integer NOT NULL, reason text, created_at timestamptz DEFAULT now()
);
CREATE TABLE public.user_buffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, item_id uuid,
  active boolean DEFAULT true, expires_at timestamptz, purchased_at timestamptz DEFAULT now()
);
CREATE TABLE public.npc_challenge_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  npc_id text NOT NULL, challenge_id text NOT NULL, week_token text NOT NULL,
  xp_earned integer NOT NULL DEFAULT 0, gold_earned integer NOT NULL DEFAULT 0
);
CREATE TABLE public.shop_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), effect text);
CREATE TABLE public.talentos_disponiveis (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), efeito text);
CREATE TABLE public.talentos_jogador (personagem_id uuid, talento_id uuid);
CREATE TABLE public.user_health_stats (
  user_id uuid PRIMARY KEY, current_hp integer DEFAULT 100, max_hp integer DEFAULT 100,
  fatigue integer DEFAULT 0
);
CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  current_value integer DEFAULT 0, updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.plan_missions (plan_id uuid, mission_id uuid);
CREATE TABLE public.achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), condition_type text,
  condition_value integer NOT NULL DEFAULT 1, xp_reward integer NOT NULL DEFAULT 0,
  gold_reward integer NOT NULL DEFAULT 0
);
CREATE TABLE public.user_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  achievement_id uuid NOT NULL REFERENCES public.achievements(id),
  claimed_at timestamptz, unlocked_at timestamptz DEFAULT now(),
  UNIQUE (user_id,achievement_id)
);
CREATE TABLE public.onboarding_mission_catalog (
  code text PRIMARY KEY, xp_reward integer NOT NULL DEFAULT 0
);

CREATE FUNCTION public._weekend_xp_bonus(text,jsonb,date) RETURNS numeric
  LANGUAGE sql STABLE AS $$ SELECT 0::numeric $$;
CREATE FUNCTION public._norm(text) RETURNS text
  LANGUAGE sql IMMUTABLE AS $$ SELECT lower($1) $$;
CREATE FUNCTION public.undo_npc_challenge(text,text,text) RETURNS jsonb
  LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE FUNCTION public._derive_mission_category(text,text,text,text) RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT COALESCE($1, 'geral') $$;
CREATE FUNCTION public.get_level_from_xp_v2(integer) RETURNS integer
  LANGUAGE sql IMMUTABLE AS $$ SELECT 1 + greatest(0,$1) / 100 $$;
CREATE FUNCTION public._apply_mission_health_effects(uuid,numeric,integer,integer)
  RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;
CREATE FUNCTION public._grant_flow_xp_buff(uuid) RETURNS void
  LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;
CREATE FUNCTION public._grant_inspiration_if_perfect_day(uuid,date) RETURNS boolean
  LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION public.add_xp_to_user(uuid,integer) RETURNS void
  LANGUAGE sql SECURITY DEFINER AS $$ UPDATE public.profiles SET total_xp=total_xp+$2 WHERE user_id=$1 $$;
CREATE FUNCTION public.pay_mission_penalty(uuid) RETURNS void
  LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;

CREATE FUNCTION public._fixture_create_profile() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.profiles(user_id) VALUES (NEW.id);
  INSERT INTO public.attributes(user_id,name) VALUES (NEW.id,'Disciplina');
  INSERT INTO public.user_balance(user_id) VALUES (NEW.id);
  INSERT INTO public.user_health_stats(user_id) VALUES (NEW.id);
  RETURN NEW;
END $$;
CREATE TRIGGER fixture_create_profile AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public._fixture_create_profile();

-- A fixture reproduz grants e guardas de progressao observados no publicado.
CREATE FUNCTION public._guard_profiles_economy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user IN ('authenticated','anon') AND (
    NEW.total_xp IS DISTINCT FROM OLD.total_xp OR NEW.level IS DISTINCT FROM OLD.level
    OR NEW.boss_keys IS DISTINCT FROM OLD.boss_keys
    OR NEW.missions_completed IS DISTINCT FROM OLD.missions_completed
    OR NEW.xp_today IS DISTINCT FROM OLD.xp_today
  ) THEN RAISE EXCEPTION 'Colunas de progressao protegidas'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_profiles_economy BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public._guard_profiles_economy();
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles, public.checklist_items,
  public.mission_daily_completions TO anon,authenticated;
GRANT SELECT, INSERT, DELETE ON public.attributes TO anon,authenticated;
GRANT SELECT ON public.missions,public.user_balance TO anon,authenticated;
GRANT INSERT, UPDATE, DELETE ON public.missions TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon,authenticated;
REVOKE UPDATE ON public.attributes,public.user_balance FROM PUBLIC,anon,authenticated;

\ir progressao_live_functions.sql
\ir progressao_live_claim_achievement.sql
REVOKE EXECUTE ON FUNCTION public.claim_achievement(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.claim_achievement(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public._complete_mission_daily(uuid,date,integer)
  FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public._complete_mission_with_weekly(uuid)
  FROM PUBLIC,anon,authenticated;
