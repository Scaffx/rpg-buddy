-- Reduced PostgreSQL 17 fixture. Run as postgres before loading the captured
-- _grant_flow_xp_buff and buy_shop_item definitions and the new migration.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END;
$$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;

CREATE TABLE public.shop_items (
  id uuid PRIMARY KEY, name text NOT NULL, effect text, cost_percent int NOT NULL,
  duration text
);
CREATE TABLE public.user_buffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  item_id uuid NOT NULL REFERENCES public.shop_items(id),
  purchased_at timestamptz NOT NULL DEFAULT now(),
  active boolean NOT NULL DEFAULT true, expires_at timestamptz
);
CREATE TABLE public.npc_challenge_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  npc_id text NOT NULL, challenge_id text NOT NULL, week_token text NOT NULL,
  xp_earned int NOT NULL DEFAULT 0, gold_earned int NOT NULL DEFAULT 0,
  UNIQUE (user_id, npc_id, challenge_id, week_token)
);
CREATE TABLE public.user_balance (
  user_id uuid PRIMARY KEY, gold int NOT NULL, updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.profiles (
  user_id uuid PRIMARY KEY, total_xp int NOT NULL, level int NOT NULL
);
CREATE TABLE public.attributes (
  user_id uuid NOT NULL, xp int NOT NULL
);
CREATE TABLE public.talentos_jogador (personagem_id uuid, talento_id uuid);
CREATE TABLE public.talentos_disponiveis (id uuid, efeito text);
CREATE TABLE public.activity_log (user_id uuid, action text, description text, xp_gained int);
CREATE TABLE public.gold_history (user_id uuid, type text, amount int, reason text);

ALTER TABLE public.user_buffs ENABLE ROW LEVEL SECURITY;
CREATE POLICY buffs_select ON public.user_buffs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY buffs_write ON public.user_buffs FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
ALTER TABLE public.npc_challenge_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY npc_owner ON public.npc_challenge_completions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Reproduce both table-level and column-level grants.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_buffs,
  public.npc_challenge_completions TO anon, authenticated;
GRANT INSERT (user_id, item_id), UPDATE (expires_at, active)
  ON public.user_buffs TO authenticated;
GRANT INSERT (xp_earned), UPDATE (gold_earned)
  ON public.npc_challenge_completions TO authenticated;
GRANT SELECT ON public.shop_items, public.user_balance, public.profiles,
  public.attributes TO authenticated;

-- Signature stubs for unrelated mission helpers. The flow helper and shop
-- purchase function are loaded from the captured live definitions separately.
CREATE FUNCTION public._norm(text) RETURNS text LANGUAGE sql AS $$ SELECT $1 $$;
CREATE FUNCTION public._derive_mission_category(text, text, text, text)
  RETURNS text LANGUAGE sql AS $$ SELECT $1 $$;
CREATE FUNCTION public._apply_mission_health_effects(uuid, numeric, integer, integer)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN END $$;
CREATE FUNCTION public._grant_inspiration_if_perfect_day(uuid, date)
  RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT false $$;
CREATE FUNCTION public._weekend_xp_bonus(text, jsonb, date)
  RETURNS numeric LANGUAGE sql AS $$ SELECT 0::numeric $$;

INSERT INTO public.shop_items VALUES
  ('10000000-0000-0000-0000-000000000001', 'Fluxo XP', 'estado_fluxo_xp', 10, '12h');
INSERT INTO public.user_balance (user_id, gold) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 100),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 100);
INSERT INTO public.profiles VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 100, 2),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 100, 2);
INSERT INTO public.attributes VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 20),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 20);

-- Existing untrusted history survives the migration, including a negative
-- reward a client could have inserted before grants were closed.
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
INSERT INTO public.npc_challenge_completions
  (user_id, npc_id, challenge_id, week_token, xp_earned, gold_earned)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'npc', 'legacy', '2026-10-19', -999, -50);
RESET ROLE;
RESET request.jwt.claim.sub;
