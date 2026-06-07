-- Árvore do Espadachim (guerreiro): Força (pesado) + Sangramento (rápido, estilo ER)
-- + Infusão de Fogo (embainhar a espada no fogo -> golpe físico que aplica Queimadura).
INSERT INTO public.skill_tree_nodes
  (id, tree, branch, area, tier, cost, max_rank, node_type, name, description, effect, gate_points, prereq_node_id, exclusive_group, sort) VALUES
  ('g_golpe','guerreiro','tronco','fisico',0,1,5,'skill','Golpe Marcial','Ataque físico básico, sem custo. Sobe de rank para mais dano.',
     '{"kind":"skill","element":"neutro","power":34,"mpCost":0,"effectType":"dano","cooldown":1,"pct_per_rank":10}', 0, NULL, NULL, 0),
  ('g_ruptura','guerreiro','forca','fisico',1,1,5,'skill','Ruptura Frontal','Golpe físico pesado de alta pressão.',
     '{"kind":"skill","element":"neutro","power":64,"mpCost":6,"effectType":"dano","cooldown":3}', 1, 'g_golpe', NULL, 1),
  ('g_for_mod1','guerreiro','forca','fisico',2,1,3,'passive','Força Bruta','+7% de dano físico por rank.',
     '{"kind":"mod","mod":"school_dmg","school":"fisico","pct_per_rank":7}', 3, 'g_ruptura', 'g_forca', 2),
  ('g_for_mod2','guerreiro','forca','fisico',2,1,3,'passive','Algoz','+10% de dano contra alvos Sangrando por rank.',
     '{"kind":"mod","mod":"vs_status_dmg","status":"bleeding","pct_per_rank":10}', 3, 'g_ruptura', 'g_forca', 3),
  ('g_for_var','guerreiro','forca','fisico',3,2,1,'variant','Devastar','Transforma Ruptura Frontal num golpe devastador de dano massivo.',
     '{"kind":"variant","transform":"devastar","bonus_pct":50}', 8, 'g_ruptura', NULL, 4),
  ('g_corte','guerreiro','sangramento','fisico',1,1,5,'skill','Corte Sangrento','Corte rápido que provoca Sangramento (DoT crescente).',
     '{"kind":"skill","element":"neutro","power":50,"mpCost":5,"effectType":"dano","cooldown":2}', 1, 'g_golpe', NULL, 1),
  ('g_sang_mod1','guerreiro','sangramento','fisico',2,1,3,'passive','Lâminas Afiadas','+10% de dano contra alvos Sangrando por rank.',
     '{"kind":"mod","mod":"vs_status_dmg","status":"bleeding","pct_per_rank":10}', 3, 'g_corte', 'g_sang', 2),
  ('g_sang_mod2','guerreiro','sangramento','fisico',2,1,3,'passive','Brutalidade','+7% de dano físico por rank.',
     '{"kind":"mod","mod":"school_dmg","school":"fisico","pct_per_rank":7}', 3, 'g_corte', 'g_sang', 3),
  ('g_sang_var','guerreiro','sangramento','fisico',3,2,1,'variant','Dança das Lâminas','Transforma Corte Sangrento numa flurry de golpes (vários cortes).',
     '{"kind":"variant","transform":"danca_laminas","bonus_pct":45}', 8, 'g_corte', NULL, 4),
  ('g_chama','guerreiro','infusao','fogo',1,1,5,'skill','Lâmina Flamejante','Embainha a espada em fogo: golpe físico que aplica Queimadura.',
     '{"kind":"skill","element":"fogo","power":56,"mpCost":7,"effectType":"dano","cooldown":2}', 1, 'g_golpe', NULL, 1),
  ('g_inf_mod1','guerreiro','infusao','fogo',2,1,3,'passive','Brasa na Lâmina','+8% de dano de Fogo por rank.',
     '{"kind":"mod","mod":"element_dmg","element":"fogo","pct_per_rank":8}', 3, 'g_chama', 'g_inf', 2),
  ('g_inf_mod2','guerreiro','infusao','fogo',2,1,2,'passive','Fogo Persistente','Queimadura dura +1 turno por rank.',
     '{"kind":"mod","mod":"status_dur","status":"burning","turns_per_rank":1}', 3, 'g_chama', 'g_inf', 3),
  ('g_inf_var','guerreiro','infusao','fogo',3,2,1,'variant','Espada Vulcânica','Transforma Lâmina Flamejante numa erupção: dano de fogo em área.',
     '{"kind":"variant","transform":"vulcanica","aoe":true,"bonus_pct":45}', 8, 'g_chama', NULL, 4)
ON CONFLICT (id) DO NOTHING;
