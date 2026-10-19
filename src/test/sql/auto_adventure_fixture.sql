-- Run on an isolated PostgreSQL 17 database before the adventure migration.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
END $$;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO authenticated, anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;

CREATE TABLE public.profiles (user_id uuid UNIQUE NOT NULL, level integer NOT NULL DEFAULT 1, total_xp integer NOT NULL DEFAULT 0);
CREATE TABLE public.attributes (user_id uuid NOT NULL, name text NOT NULL, xp integer NOT NULL DEFAULT 0, level integer NOT NULL DEFAULT 1, UNIQUE(user_id,name));
CREATE TABLE public.user_balance (user_id uuid UNIQUE NOT NULL, gold integer NOT NULL DEFAULT 100, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.gold_history (user_id uuid NOT NULL, type text NOT NULL, amount integer NOT NULL, reason text);
CREATE TABLE public.game_items (id uuid PRIMARY KEY, category text NOT NULL, rarity text NOT NULL, is_consumable boolean NOT NULL, effect text, level_required integer NOT NULL, atk_bonus integer NOT NULL DEFAULT 0, matk_bonus integer NOT NULL DEFAULT 0, def_bonus integer NOT NULL DEFAULT 0, hp_bonus integer NOT NULL DEFAULT 0, requer_sintonizacao boolean NOT NULL DEFAULT false);
CREATE TABLE public.user_inventory (user_id uuid NOT NULL, item_id uuid NOT NULL, quantity integer NOT NULL, equipped boolean NOT NULL, sintonizado boolean NOT NULL DEFAULT false, UNIQUE (user_id,item_id));

INSERT INTO auth.users VALUES ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');
INSERT INTO public.profiles(user_id,level) VALUES ('11111111-1111-1111-1111-111111111111',1), ('22222222-2222-2222-2222-222222222222',50);
INSERT INTO public.attributes(user_id,name) VALUES ('11111111-1111-1111-1111-111111111111','forca'), ('22222222-2222-2222-2222-222222222222','forca');
INSERT INTO public.game_items(id,category,rarity,is_consumable,effect,level_required,atk_bonus)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','weapon','comum',false,null,1,25),
       ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','armor','comum',false,null,1,0);
