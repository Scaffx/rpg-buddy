-- Árvore do Ferreiro: Força (pesado) + Infusão de Fogo (malho flamejante) + Forja (crafting).
-- Passivos do galho Forja têm effect.kind='craft' (inertes no combate; ligados na economia do Ferreiro).
INSERT INTO public.skill_tree_nodes
  (id, tree, branch, area, tier, cost, max_rank, node_type, name, description, effect, gate_points, prereq_node_id, exclusive_group, sort) VALUES
  ('f_martelada','ferreiro','tronco','fisico',0,1,5,'skill','Martelada','Golpe físico pesado de martelo, sem custo. Sobe de rank para mais dano.',
     '{"kind":"skill","element":"neutro","power":36,"mpCost":0,"effectType":"dano","cooldown":1,"pct_per_rank":10}', 0, NULL, NULL, 0),
  ('f_impacto','ferreiro','forca','fisico',1,1,5,'skill','Impacto de Forja','Golpe físico brutal que esmaga a guarda do inimigo.',
     '{"kind":"skill","element":"neutro","power":62,"mpCost":6,"effectType":"dano","cooldown":3}', 1, 'f_martelada', NULL, 1),
  ('f_for_mod1','ferreiro','forca','fisico',2,1,3,'passive','Marreta Brutal','+7% de dano físico por rank.',
     '{"kind":"mod","mod":"school_dmg","school":"fisico","pct_per_rank":7}', 3, 'f_impacto', 'f_for', 2),
  ('f_for_mod2','ferreiro','forca','fisico',2,1,3,'passive','Forja Ardente','+10% de dano contra alvos Queimando por rank.',
     '{"kind":"mod","mod":"vs_status_dmg","status":"burning","pct_per_rank":10}', 3, 'f_impacto', 'f_for', 3),
  ('f_for_var','ferreiro','forca','fisico',3,2,1,'variant','Bigorna','Transforma Impacto de Forja num golpe demolidor de dano massivo.',
     '{"kind":"variant","transform":"bigorna","bonus_pct":50}', 8, 'f_impacto', NULL, 4),
  ('f_chama','ferreiro','infusao','fogo',1,1,5,'skill','Malho Flamejante','Martelo em brasa: golpe físico que aplica Queimadura.',
     '{"kind":"skill","element":"fogo","power":56,"mpCost":7,"effectType":"dano","cooldown":2}', 1, 'f_martelada', NULL, 1),
  ('f_inf_mod1','ferreiro','infusao','fogo',2,1,3,'passive','Têmpera Flamejante','+8% de dano de Fogo por rank.',
     '{"kind":"mod","mod":"element_dmg","element":"fogo","pct_per_rank":8}', 3, 'f_chama', 'f_inf', 2),
  ('f_inf_mod2','ferreiro','infusao','fogo',2,1,2,'passive','Brasa Duradoura','Queimadura dura +1 turno por rank.',
     '{"kind":"mod","mod":"status_dur","status":"burning","turns_per_rank":1}', 3, 'f_chama', 'f_inf', 3),
  ('f_inf_var','ferreiro','infusao','fogo',3,2,1,'variant','Forja Vulcânica','Transforma Malho Flamejante numa erupção de fogo em área.',
     '{"kind":"variant","transform":"forja_vulcanica","aoe":true,"bonus_pct":45}', 8, 'f_chama', NULL, 4),
  ('f_forja1','ferreiro','forja','forja',1,1,5,'passive','Olho de Mestre','+8% de qualidade nas armas forjadas por rank.',
     '{"kind":"craft","craft":"quality","pct_per_rank":8}', 2, 'f_martelada', NULL, 1),
  ('f_forja2','ferreiro','forja','forja',2,1,5,'passive','Mão Firme','+6% de chance de afixo (bônus aleatório) por rank.',
     '{"kind":"craft","craft":"affix_chance","pct_per_rank":6}', 5, 'f_forja1', NULL, 2),
  ('f_forja3','ferreiro','forja','forja',3,1,3,'passive','Economia de Material','-5% de custo de material por rank.',
     '{"kind":"craft","craft":"material_cost","pct_per_rank":5}', 10, 'f_forja2', NULL, 3)
ON CONFLICT (id) DO NOTHING;
