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

CREATE TABLE public.classes (id uuid PRIMARY KEY, name text NOT NULL, column_index integer NOT NULL, parent_class_id uuid REFERENCES public.classes(id));
INSERT INTO public.classes(id,name,column_index,parent_class_id) VALUES
 ('00000001-0000-0000-0000-000000000001','Aprendiz',1,NULL),
 ('00000002-0000-0000-0000-000000000001','Espadachim',2,'00000001-0000-0000-0000-000000000001'),
 ('00000002-0000-0000-0000-000000000002','Mago',2,'00000001-0000-0000-0000-000000000001'),
 ('00000002-0000-0000-0000-000000000005','Noviço',2,'00000001-0000-0000-0000-000000000001'),
 ('00000003-0000-0000-0000-000000000001','Cavaleiro',3,'00000002-0000-0000-0000-000000000001'),
 ('00000003-0000-0000-0000-000000000003','Bruxo',3,'00000002-0000-0000-0000-000000000002');
CREATE TABLE public.profiles (user_id uuid UNIQUE NOT NULL, level integer NOT NULL DEFAULT 1, total_xp integer NOT NULL DEFAULT 0, starter_class text, current_class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL);
CREATE TABLE public.attributes (user_id uuid NOT NULL, name text NOT NULL, xp integer NOT NULL DEFAULT 0, level integer NOT NULL DEFAULT 1, UNIQUE(user_id,name));
GRANT INSERT, DELETE ON public.attributes TO authenticated, anon;
CREATE TABLE public.user_balance (user_id uuid UNIQUE NOT NULL, gold integer NOT NULL DEFAULT 100, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.gold_history (user_id uuid NOT NULL, type text NOT NULL, amount integer NOT NULL, reason text);
CREATE TABLE public.game_items (id uuid PRIMARY KEY, category text NOT NULL, rarity text NOT NULL, is_consumable boolean NOT NULL, effect text, level_required integer NOT NULL, atk_bonus integer NOT NULL DEFAULT 0, matk_bonus integer NOT NULL DEFAULT 0, def_bonus integer NOT NULL DEFAULT 0, hp_bonus integer NOT NULL DEFAULT 0, requer_sintonizacao boolean NOT NULL DEFAULT false);
CREATE TABLE public.user_inventory (user_id uuid NOT NULL, item_id uuid NOT NULL, quantity integer NOT NULL, equipped boolean NOT NULL, sintonizado boolean NOT NULL DEFAULT false, UNIQUE (user_id,item_id));
ALTER TABLE public.user_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_inventory ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.user_balance, public.user_inventory TO authenticated;
CREATE POLICY own_balance_read ON public.user_balance FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY own_inventory_read ON public.user_inventory FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE TABLE public.portal_events (id uuid PRIMARY KEY, is_active boolean NOT NULL DEFAULT true);
CREATE TABLE public.portal_runs (user_id uuid NOT NULL, event_id uuid NOT NULL, portal_color text NOT NULL,
  completed boolean NOT NULL, fragment_earned boolean NOT NULL DEFAULT false,
  fragments_received integer NOT NULL DEFAULT 0, xp_earned integer NOT NULL DEFAULT 0,
  gold_earned integer NOT NULL DEFAULT 0, legendary_item_received boolean NOT NULL DEFAULT false);
CREATE TABLE public.player_portal_fragments (user_id uuid PRIMARY KEY, fragments integer NOT NULL DEFAULT 0);
CREATE FUNCTION public._get_or_roll_portal_color(uuid,uuid) RETURNS text LANGUAGE sql AS $$ SELECT 'blue'::text $$;
CREATE FUNCTION public.complete_portal_run(uuid,text,integer,integer,boolean) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
GRANT ALL ON public.portal_runs, public.player_portal_fragments TO authenticated, anon;
GRANT SELECT ON public.portal_events, public.profiles TO authenticated;
INSERT INTO public.portal_events(id) VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');

INSERT INTO auth.users VALUES ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222'), ('33333333-3333-3333-3333-333333333333');
INSERT INTO public.profiles(user_id,level,starter_class,current_class_id) VALUES
 ('11111111-1111-1111-1111-111111111111',1,'guerreiro',NULL),
 ('22222222-2222-2222-2222-222222222222',50,'guerreiro',NULL),
 ('33333333-3333-3333-3333-333333333333',1,'mago','00000002-0000-0000-0000-000000000001');
UPDATE public.profiles SET total_xp=1234 WHERE user_id='33333333-3333-3333-3333-333333333333';
INSERT INTO public.attributes(user_id,name) VALUES ('11111111-1111-1111-1111-111111111111','forca'), ('22222222-2222-2222-2222-222222222222','forca'), ('33333333-3333-3333-3333-333333333333','Força');
UPDATE public.attributes SET level=3,xp=7 WHERE user_id='33333333-3333-3333-3333-333333333333';
UPDATE public.attributes SET level=5 WHERE user_id='22222222-2222-2222-2222-222222222222';
INSERT INTO public.game_items(id,category,rarity,is_consumable,effect,level_required,atk_bonus)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','weapon','comum',false,null,1,25),
       ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','armor','comum',false,null,1,0);
