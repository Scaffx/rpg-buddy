-- Apply after boss_auto_fixture.sql and before the continuous engine.
ALTER TABLE public.profiles ADD COLUMN combat_skill_loadout jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.game_items ADD COLUMN weapon_skill jsonb;
CREATE TABLE public.skill_tree_nodes (
  id text PRIMARY KEY, tree text NOT NULL, node_type text NOT NULL,
  name text NOT NULL, effect jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE public.player_skill_nodes (
  user_id uuid NOT NULL REFERENCES auth.users(id), node_id text NOT NULL REFERENCES public.skill_tree_nodes(id),
  rank integer NOT NULL, PRIMARY KEY(user_id,node_id)
);
INSERT INTO public.skill_tree_nodes(id,tree,node_type,name,effect) VALUES
  ('aprendiz-golpe','aprendiz','skill','Golpe aprendido','{"power":40,"effectType":"dano"}'),
  ('aprendiz-cura','aprendiz','skill','Cura aprendida','{"power":999,"effectType":"heal"}'),
  ('mago-roubado','mago','skill','Magia alheia','{"power":999,"effectType":"dano"}');
INSERT INTO public.player_skill_nodes(user_id,node_id,rank) VALUES
  ('22222222-2222-2222-2222-222222222222','aprendiz-golpe',1),
  ('22222222-2222-2222-2222-222222222222','aprendiz-cura',1);
UPDATE public.profiles SET combat_skill_loadout='[{"id":"aprendiz-golpe","name":"Forjada","power":99999,"effectType":"dano"}]'::jsonb
 WHERE user_id='22222222-2222-2222-2222-222222222222';
