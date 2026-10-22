-- Reduced additions after the 20261020 continuous engine and before v3.
-- The live catalog has these columns; the earlier focused fixture does not.
ALTER TABLE public.game_items
  ADD COLUMN mp_bonus integer NOT NULL DEFAULT 0,
  ADD COLUMN weapon_element text,
  ADD COLUMN weapon_type text;
ALTER TABLE public.skill_tree_nodes
  ADD COLUMN requires_weapon_element text,
  ADD COLUMN requires_weapon_type text;

UPDATE public.skill_tree_nodes SET effect=jsonb_build_object(
  'power',40,'effectType','dano','mpCost',5,'cooldown',2,'element','fogo')
WHERE id='aprendiz-golpe';
UPDATE public.skill_tree_nodes SET effect=jsonb_build_object(
  'power',40,'effectType','heal','mpCost',8,'cooldown',3,'element','sagrado')
WHERE id='aprendiz-cura';
INSERT INTO public.skill_tree_nodes(id,tree,node_type,name,effect) VALUES
  ('aprendiz-buff','aprendiz','skill','Escudo',
   '{"power":45,"effectType":"buff","mpCost":7,"cooldown":3,"element":"sagrado"}'),
  ('aprendiz-debuff','aprendiz','skill','Marca',
   '{"power":46,"effectType":"debuff","mpCost":5,"cooldown":2,"element":"neutro"}'),
  ('aprendiz-cc','aprendiz','skill','Atordoar',
   '{"power":48,"effectType":"cc","mpCost":7,"cooldown":3,"element":"neutro"}'),
  ('m_dardo','mago','skill','Dardo Arcano',
   '{"power":30,"effectType":"dano","mpCost":0,"cooldown":1,"element":"arcano"}');
INSERT INTO public.player_skill_nodes(user_id,node_id,rank)
VALUES ('22222222-2222-2222-2222-222222222222','aprendiz-buff',1),
       ('22222222-2222-2222-2222-222222222222','aprendiz-debuff',1),
       ('22222222-2222-2222-2222-222222222222','aprendiz-cc',1),
       ('33333333-3333-3333-3333-333333333333','m_dardo',1);
UPDATE public.profiles SET combat_skill_loadout=jsonb_build_array(
  jsonb_build_object('id','aprendiz-golpe','power',99999,'mpCost',0,'cooldown',0,'element','sagrado'),
  jsonb_build_object('id','aprendiz-cura'),
  jsonb_build_object('id','aprendiz-buff'),
  jsonb_build_object('id','aprendiz-debuff'),
  jsonb_build_object('id','aprendiz-cc'))
WHERE user_id='22222222-2222-2222-2222-222222222222';
UPDATE public.profiles SET starter_class='mago',current_class_id=NULL,combat_skill_loadout=jsonb_build_array(
  jsonb_build_object('id','m_dardo'))
WHERE user_id='33333333-3333-3333-3333-333333333333';

-- Five currently published non-damage nodes. The three strike flags are
-- inferred only from these canonical IDs, never from editable profile JSON.
INSERT INTO public.classes(id,name,column_index,parent_class_id) VALUES
  ('00000002-0000-0000-0000-000000000003','Gatuno',2,'00000001-0000-0000-0000-000000000001'),
  ('00000002-0000-0000-0000-000000000006','Arqueiro',2,'00000001-0000-0000-0000-000000000001'),
  ('00000002-0000-0000-0000-000000000004','Ferreiro',2,'00000001-0000-0000-0000-000000000001');
INSERT INTO public.skill_tree_nodes(id,tree,node_type,name,effect) VALUES
  ('gt_furtivo','gatuno','skill','Golpe Furtivo',
   '{"power":46,"mpCost":5,"element":"neutro","cooldown":2,"effectType":"debuff"}'),
  ('a_vetor','arqueiro','skill','Disparo Perfurante',
   '{"power":46,"mpCost":5,"element":"neutro","cooldown":2,"effectType":"debuff"}'),
  ('ferreiro_t1_pancada_atordoante','ferreiro','skill','Pancada Atordoante',
   '{"power":48,"mpCost":7,"element":"neutro","cooldown":3,"effectType":"cc"}'),
  ('n_cura','novato','skill','Cura Menor',
   '{"power":40,"mpCost":8,"element":"sagrado","cooldown":3,"effectType":"heal","pct_per_rank":12}'),
  ('n_escudo','novato','skill','Bênção Protetora',
   '{"power":45,"mpCost":7,"element":"sagrado","cooldown":3,"effectType":"buff","pct_per_rank":10}');
