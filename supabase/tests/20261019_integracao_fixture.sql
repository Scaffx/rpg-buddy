-- Reduced composition fixture: published progression bodies plus relevant
-- live-shaped columns, constraints and grants for adventure and inventory.
-- It does not replace a production schema dump or PostgREST/API test.
\ir progressao_live_fixture.sql

CREATE TABLE public.classes (
  id uuid PRIMARY KEY, name text NOT NULL, column_index integer NOT NULL,
  parent_class_id uuid REFERENCES public.classes(id), level_min integer NOT NULL DEFAULT 1
);
INSERT INTO public.classes(id,name,column_index,parent_class_id,level_min) VALUES
 ('00000001-0000-0000-0000-000000000001','Aprendiz',1,NULL,1),
 ('00000002-0000-0000-0000-000000000001','Espadachim',2,'00000001-0000-0000-0000-000000000001',1),
 ('00000002-0000-0000-0000-000000000002','Mago',2,'00000001-0000-0000-0000-000000000001',1),
 ('00000002-0000-0000-0000-000000000005','Noviço',2,'00000001-0000-0000-0000-000000000001',1),
 ('00000003-0000-0000-0000-000000000001','Cavaleiro',3,'00000002-0000-0000-0000-000000000001',5),
 ('00000003-0000-0000-0000-000000000003','Bruxo',3,'00000002-0000-0000-0000-000000000002',5);
ALTER TABLE public.profiles
  ADD COLUMN starter_class text,
  ADD COLUMN current_class_id uuid REFERENCES public.classes(id),
  ADD COLUMN starter_kit_claimed boolean NOT NULL DEFAULT false,
  ADD COLUMN class_kit_claimed boolean NOT NULL DEFAULT false,
  ADD COLUMN health_anchors_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.attributes ADD CONSTRAINT attributes_user_name_key UNIQUE(user_id,name);

CREATE TABLE public.game_items (
  id uuid PRIMARY KEY, name text NOT NULL, category text NOT NULL,
  rarity text NOT NULL DEFAULT 'comum', shop_price integer,
  stackable boolean NOT NULL DEFAULT false, is_starter boolean NOT NULL DEFAULT false,
  boss_drop_level integer, is_consumable boolean NOT NULL DEFAULT false,
  level_required integer NOT NULL DEFAULT 1, starter_class text,
  atk_bonus integer NOT NULL DEFAULT 0, matk_bonus integer NOT NULL DEFAULT 0,
  def_bonus integer NOT NULL DEFAULT 0, hp_bonus integer NOT NULL DEFAULT 0,
  requer_sintonizacao boolean NOT NULL DEFAULT false, effect text
);
CREATE TABLE public.user_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  item_id uuid NOT NULL REFERENCES public.game_items(id), quantity integer NOT NULL DEFAULT 1,
  equipped boolean NOT NULL DEFAULT false, sintonizado boolean NOT NULL DEFAULT false,
  obtained_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,item_id)
);
CREATE TABLE public.companions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id),
  companion_type text NOT NULL, companion_role text, origin text NOT NULL,
  name text NOT NULL, atk integer, def integer, max_hp integer,
  current_hp integer, max_mp integer, current_mp integer,
  affinity integer NOT NULL DEFAULT 0, last_forage_at date, last_affinity_date date,
  UNIQUE(user_id,origin)
);
CREATE TABLE public.meal_log(user_id uuid,meal_date date);
CREATE TABLE public.water_log(user_id uuid,log_date date,amount_ml integer);
CREATE FUNCTION public._anchor_status_today(p_uid uuid,p_date date,
  OUT has_anchors boolean,OUT all_complete boolean)
RETURNS record LANGUAGE sql AS $$ SELECT false,false $$;
CREATE FUNCTION public.charge_for_item(uuid) RETURNS integer LANGUAGE sql AS $$ SELECT 0 $$;
CREATE FUNCTION public.grant_starter_items(uuid,text) RETURNS void LANGUAGE sql AS $$ SELECT $$;
CREATE FUNCTION public.add_gold_to_user(uuid,integer) RETURNS void LANGUAGE sql AS $$ SELECT $$;

CREATE TABLE public.portal_events(id uuid PRIMARY KEY,is_active boolean NOT NULL DEFAULT true);
CREATE TABLE public.portal_runs (
  user_id uuid NOT NULL,event_id uuid NOT NULL,portal_color text NOT NULL,
  completed boolean NOT NULL,fragment_earned boolean NOT NULL DEFAULT false,
  fragments_received integer NOT NULL DEFAULT 0,xp_earned integer NOT NULL DEFAULT 0,
  gold_earned integer NOT NULL DEFAULT 0,legendary_item_received boolean NOT NULL DEFAULT false
);
CREATE TABLE public.player_portal_fragments(user_id uuid PRIMARY KEY,fragments integer NOT NULL DEFAULT 0);
CREATE FUNCTION public._get_or_roll_portal_color(uuid,uuid) RETURNS text LANGUAGE sql AS $$ SELECT 'blue'::text $$;
CREATE FUNCTION public.complete_portal_run(uuid,text,integer,integer,boolean) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;

CREATE TABLE public.bosses (
  id uuid PRIMARY KEY,name text NOT NULL,level integer NOT NULL,
  icon text NOT NULL,is_world_event boolean NOT NULL DEFAULT false
);
CREATE TABLE public.boss_battles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  boss_id uuid NOT NULL REFERENCES public.bosses(id),
  damage_dealt integer NOT NULL DEFAULT 0,won boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.pet_catalog (
  pet_type text PRIMARY KEY,name text NOT NULL,emoji text NOT NULL,
  role text NOT NULL,atk integer NOT NULL,def integer NOT NULL,
  hp integer NOT NULL,mp integer NOT NULL,price integer NOT NULL,
  sort integer NOT NULL,unlock_boss_id uuid REFERENCES public.bosses(id)
);
CREATE FUNCTION public.resolve_boss_battle(uuid,boolean,integer)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$ SELECT '{}'::jsonb $$;

ALTER TABLE public.game_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bosses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boss_battles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pet_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY catalog_read ON public.game_items FOR SELECT USING (true);
CREATE POLICY inventory_read ON public.user_inventory FOR SELECT TO authenticated USING (auth.uid()=user_id);
CREATE POLICY "Users can insert own inventory" ON public.user_inventory FOR INSERT TO authenticated WITH CHECK(auth.uid()=user_id);
CREATE POLICY "Users can update own inventory" ON public.user_inventory FOR UPDATE TO authenticated USING(auth.uid()=user_id);
CREATE POLICY "Users can delete own inventory" ON public.user_inventory FOR DELETE TO authenticated USING(auth.uid()=user_id);
CREATE POLICY balance_read ON public.user_balance FOR SELECT TO authenticated USING (auth.uid()=user_id);
CREATE POLICY balance_insert ON public.user_balance FOR INSERT TO authenticated WITH CHECK (auth.uid()=user_id);
CREATE POLICY companions_read ON public.companions FOR SELECT TO authenticated USING(auth.uid()=user_id);
CREATE POLICY companions_insert ON public.companions FOR INSERT TO authenticated WITH CHECK(auth.uid()=user_id);
CREATE POLICY companions_update ON public.companions FOR UPDATE TO authenticated USING(auth.uid()=user_id);
CREATE POLICY "Anyone can view bosses" ON public.bosses FOR SELECT USING (true);
CREATE POLICY "Users can create own battles" ON public.boss_battles FOR INSERT TO authenticated WITH CHECK(auth.uid()=user_id);
CREATE POLICY "Users can view own battles" ON public.boss_battles FOR SELECT TO authenticated USING(auth.uid()=user_id);
CREATE POLICY pet_catalog_read ON public.pet_catalog FOR SELECT USING(true);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.game_items,public.user_inventory,
  public.companions,public.gold_history,public.bosses,public.boss_battles,
  public.pet_catalog,public.portal_runs,public.player_portal_fragments
  TO anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.user_balance TO anon,authenticated;
GRANT SELECT ON public.classes,public.portal_events TO authenticated;
GRANT EXECUTE ON FUNCTION public.charge_for_item(uuid),public.grant_starter_items(uuid,text),
  public.add_gold_to_user(uuid,integer),public.resolve_boss_battle(uuid,boolean,integer)
  TO authenticated;

INSERT INTO public.portal_events(id) VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
INSERT INTO public.bosses(id,name,level,icon)
SELECT ('00000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,
  CASE n WHEN 20 THEN 'Leviatã Primitivo' WHEN 23 THEN 'Wyvern Relâmpago'
    WHEN 24 THEN 'Necromante Eterno' WHEN 27 THEN 'Dragão Sombrio'
    WHEN 29 THEN 'Kraken Abissal' WHEN 32 THEN 'Wyrm de Gelo Eterno'
    WHEN 33 THEN 'Demônio da Fome' WHEN 57 THEN 'Chronos, Deus do Tempo'
    ELSE 'Boss ' || n END,n,'⚔️'
FROM generate_series(1,57) n;
INSERT INTO public.bosses VALUES ('ffffffff-ffff-ffff-ffff-ffffffffffff','Evento Mundial',0,'🌍',true);
INSERT INTO public.pet_catalog
  (pet_type,name,emoji,role,atk,def,hp,mp,price,sort,unlock_boss_id)
VALUES
  ('mini_relampago','Mini Wyvern','⚡','physical',55,18,180,40,100,1,'00000000-0000-0000-0000-000000000023'),
  ('mini_leviata','Mini Leviatã','🐉','magic',42,22,200,90,100,2,'00000000-0000-0000-0000-000000000020'),
  ('mini_kraken','Mini Kraken','🦑','support',30,32,260,100,100,3,'00000000-0000-0000-0000-000000000029'),
  ('mini_necromante','Mini Necromante','🧟','magic',48,20,200,95,100,4,'00000000-0000-0000-0000-000000000024'),
  ('mini_dragao_sombrio','Mini Dragão','🐲','physical',62,26,220,55,100,5,'00000000-0000-0000-0000-000000000027'),
  ('mini_wyrm_gelo','Mini Wyrm','❄️','magic',45,30,240,85,100,6,'00000000-0000-0000-0000-000000000032'),
  ('mini_demonio_fome','Mini Demônio','👹','physical',70,24,200,60,100,7,'00000000-0000-0000-0000-000000000033');

INSERT INTO auth.users(id) VALUES
 ('11111111-1111-1111-1111-111111111111'),
 ('22222222-2222-2222-2222-222222222222'),
 ('33333333-3333-3333-3333-333333333333');
INSERT INTO public.boss_battles(user_id,boss_id,won)
VALUES('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000023',true);
