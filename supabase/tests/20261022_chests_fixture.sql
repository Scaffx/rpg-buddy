-- Reduced local PG17 fixture for the recipes -> chests chain. It models the
-- relevant live table columns, ownership, roles and grants, not a full replay.
DO $roles$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    CREATE ROLE authenticated NOLOGIN; END IF;
END $roles$;
CREATE SCHEMA auth;
CREATE SCHEMA app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA app_private TO authenticated;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
INSERT INTO auth.users VALUES
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

CREATE TABLE public.profiles(
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  level integer NOT NULL, total_xp integer NOT NULL DEFAULT 0,
  starter_class text NOT NULL,current_class_id uuid,starter_item text
);
INSERT INTO public.profiles(user_id,level,starter_class) VALUES
  ('11111111-1111-1111-1111-111111111111',5,'guerreiro'),
  ('22222222-2222-2222-2222-222222222222',80,'mago');
CREATE TABLE app_private.hero_class_identity(
  user_id uuid PRIMARY KEY,starter_class text,current_class_id uuid,starter_item text
);
INSERT INTO app_private.hero_class_identity(user_id,starter_class,current_class_id,starter_item)
SELECT user_id,starter_class,current_class_id,starter_item FROM public.profiles;
CREATE FUNCTION app_private.base_class_id(p_starter text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT NULL::uuid $$;
REVOKE ALL ON FUNCTION app_private.base_class_id(text) FROM PUBLIC,anon,authenticated;

CREATE TABLE public.user_balance(
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  gold integer NOT NULL DEFAULT 100,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.user_balance(user_id,gold) VALUES
  ('11111111-1111-1111-1111-111111111111',100000),
  ('22222222-2222-2222-2222-222222222222',100000);
CREATE TABLE public.gold_history(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,
  type text NOT NULL,amount integer NOT NULL,reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.game_items(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
  description text,icon text NOT NULL DEFAULT '📦',
  category text NOT NULL CHECK(category IN ('weapon','armor','accessory','consumable')),
  rarity text NOT NULL DEFAULT 'comum' CHECK(rarity IN ('comum','incomum','raro','epico','lendario')),
  stat_label text,atk_bonus integer NOT NULL DEFAULT 0,
  matk_bonus integer NOT NULL DEFAULT 0,
  agi_bonus integer NOT NULL DEFAULT 0,def_bonus integer NOT NULL DEFAULT 0,
  hp_bonus integer NOT NULL DEFAULT 0,mp_bonus integer NOT NULL DEFAULT 0,
  shop_price integer,level_required integer NOT NULL DEFAULT 1,
  stackable boolean NOT NULL DEFAULT false,is_consumable boolean NOT NULL DEFAULT false,
  is_starter boolean NOT NULL DEFAULT false,boss_drop_level integer,
  starter_class text,effect text,required_attribute text,unlocks_node_id text
);
ALTER TABLE public.game_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view game items" ON public.game_items FOR SELECT USING (true);
CREATE TABLE public.user_inventory(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  item_id uuid NOT NULL REFERENCES public.game_items(id),
  quantity integer NOT NULL CHECK(quantity>0),
  equipped boolean NOT NULL DEFAULT false,
  UNIQUE(user_id,item_id)
);
CREATE TABLE public.user_crafting_materials(
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),quantity integer NOT NULL DEFAULT 0
);
ALTER TABLE public.user_crafting_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can insert own crafting materials" ON public.user_crafting_materials
  FOR INSERT TO authenticated WITH CHECK(auth.uid()=user_id);
CREATE POLICY "Users can update own crafting materials" ON public.user_crafting_materials
  FOR UPDATE TO authenticated USING(auth.uid()=user_id);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.user_crafting_materials TO authenticated;
INSERT INTO public.user_crafting_materials(user_id,quantity)
  VALUES('11111111-1111-1111-1111-111111111111',999999);

CREATE TABLE public.adventure_state(
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),stage integer NOT NULL DEFAULT 1
);
CREATE TABLE public.classes(
  id uuid PRIMARY KEY,parent_class_id uuid,column_index integer,level_min integer
);
INSERT INTO public.adventure_state(user_id,stage)
  VALUES('11111111-1111-1111-1111-111111111111',10);
CREATE TABLE public.bosses(id uuid PRIMARY KEY);
INSERT INTO public.bosses VALUES('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
CREATE TABLE app_private.adventure_battles(
  id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id),
  stage integer NOT NULL,kind text NOT NULL,status text NOT NULL,
  boss_id uuid REFERENCES public.bosses(id),hero_class text NOT NULL,
  hero_level integer NOT NULL,biome text NOT NULL,
  replay boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,
  gold_awarded integer NOT NULL DEFAULT 0
);
ALTER TABLE app_private.adventure_battles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.adventure_battles FROM PUBLIC,anon,authenticated;
-- The first row is a retained private victory, not a client-owned battle.
INSERT INTO app_private.adventure_battles(id,user_id,stage,kind,status,boss_id,
  hero_class,hero_level,biome,started_at,ends_at)
VALUES('00000000-0000-0000-0000-000000000010',
  '11111111-1111-1111-1111-111111111111',10,'boss','won',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','guerreiro',5,'forest',
  '2026-10-21 10:00+00','2026-10-21 10:01+00');
