\set ON_ERROR_STOP on
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;
GRANT USAGE ON SCHEMA auth TO authenticated, anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;
CREATE SCHEMA app_private;
CREATE TABLE public.classes(
  id uuid PRIMARY KEY, name text NOT NULL, column_index integer NOT NULL,
  level_min integer NOT NULL, parent_class_id uuid REFERENCES public.classes(id)
);
INSERT INTO public.classes VALUES
  ('00000001-0000-0000-0000-000000000001','Aprendiz',1,1,NULL),
  ('00000002-0000-0000-0000-000000000001','Espadachim',2,5,'00000001-0000-0000-0000-000000000001'),
  ('00000002-0000-0000-0000-000000000002','Mago',2,5,'00000001-0000-0000-0000-000000000001'),
  ('00000002-0000-0000-0000-000000000003','Gatuno',2,5,'00000001-0000-0000-0000-000000000001'),
  ('00000002-0000-0000-0000-000000000004','Ferreiro',2,5,'00000001-0000-0000-0000-000000000001'),
  ('00000002-0000-0000-0000-000000000005','Noviço',2,5,'00000001-0000-0000-0000-000000000001'),
  ('00000002-0000-0000-0000-000000000006','Arqueiro',2,5,'00000001-0000-0000-0000-000000000001'),
  ('00000003-0000-0000-0000-000000000003','Bruxo',3,15,'00000002-0000-0000-0000-000000000002');
CREATE TABLE public.profiles(
  user_id uuid PRIMARY KEY,
  level integer NOT NULL DEFAULT 1,
  onboarding_completed boolean NOT NULL DEFAULT false,
  starter_class text,
  starter_item text,
  current_class_id uuid REFERENCES public.classes(id),
  display_name text,
  avatar_url text,
  region text,
  combat_skill_loadout jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE TABLE public.skill_tree_nodes(
  id text PRIMARY KEY, tree text NOT NULL, cost integer NOT NULL,
  max_rank integer NOT NULL, gate_points integer NOT NULL DEFAULT 0,
  prereq_node_id text REFERENCES public.skill_tree_nodes(id),
  exclusive_group text
);
CREATE TABLE public.player_skill_nodes(
  user_id uuid REFERENCES public.profiles(user_id),
  node_id text REFERENCES public.skill_tree_nodes(id),
  rank integer NOT NULL, source text NOT NULL DEFAULT 'points',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,node_id)
);
CREATE TABLE public.user_balance(
  user_id uuid PRIMARY KEY REFERENCES public.profiles(user_id),
  gold integer NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.gold_history(
  user_id uuid, type text, amount integer, reason text
);
CREATE TABLE public.activity_log(
  user_id uuid, action text, description text, xp_gained integer
);
INSERT INTO public.profiles(user_id,level,onboarding_completed,starter_class,starter_item,current_class_id,display_name)
VALUES
  ('00000000-0000-0000-0000-000000000001',1,true,'mago','Grimorio Basico',NULL,'Mago existente'),
  ('00000000-0000-0000-0000-000000000002',1,false,NULL,NULL,NULL,'Novo jogador'),
  ('00000000-0000-0000-0000-000000000003',5,true,'guerreiro','Espada Curta','00000002-0000-0000-0000-000000000001','Guerreiro existente');
INSERT INTO public.user_balance VALUES
  ('00000000-0000-0000-0000-000000000001',200,now()),
  ('00000000-0000-0000-0000-000000000002',200,now()),
  ('00000000-0000-0000-0000-000000000003',200,now());
INSERT INTO public.skill_tree_nodes VALUES
  ('m_dardo','mago',1,5,0,NULL,NULL),
  ('g_golpe','guerreiro',1,5,0,NULL,NULL),
  ('a_golpe','aprendiz',1,2,0,NULL,NULL);
INSERT INTO public.player_skill_nodes(user_id,node_id,rank) VALUES
  ('00000000-0000-0000-0000-000000000001','m_dardo',1);
-- Exact pg_get_functiondef bodies read from Primary (hashes pinned by migration).
\i src/test/sql/hero_class_live_allocate.sql
\i src/test/sql/hero_class_live_respec.sql
REVOKE ALL ON FUNCTION public.perform_class_respec(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.perform_class_respec(text) TO authenticated;
REVOKE ALL ON FUNCTION public.allocate_skill_node(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.allocate_skill_node(text) TO authenticated, anon;
GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT SELECT ON public.classes,public.skill_tree_nodes TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.player_skill_nodes TO authenticated, anon;
GRANT SELECT ON public.user_balance TO authenticated;
GRANT SELECT ON public.gold_history TO authenticated;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_profile ON public.profiles TO authenticated
USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
ALTER TABLE public.player_skill_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY player_skill_nodes_read_own ON public.player_skill_nodes FOR SELECT TO authenticated
USING (user_id=auth.uid());
ALTER TABLE public.gold_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_gold_history ON public.gold_history FOR SELECT TO authenticated
USING (user_id=auth.uid());
