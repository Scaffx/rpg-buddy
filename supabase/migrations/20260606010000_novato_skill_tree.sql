-- Árvore do Noviço (novato): Sagrado (forte vs trevas/mortos-vivos) + Suporte (cura/escudo).
-- Suporte usa skills de heal/buff (já suportadas pelo motor); passivos dedicados de cura/defesa
-- entram quando o motor ganhar esses modificadores (futuro).
INSERT INTO public.skill_tree_nodes
  (id, tree, branch, area, tier, cost, max_rank, node_type, name, description, effect, gate_points, prereq_node_id, exclusive_group, sort) VALUES
  ('n_golpe','novato','tronco','fisico',0,1,5,'skill','Golpe de Bastão','Ataque físico básico, sem custo. Sobe de rank para mais dano.',
     '{"kind":"skill","element":"neutro","power":30,"mpCost":0,"effectType":"dano","cooldown":1,"pct_per_rank":10}', 0, NULL, NULL, 0),
  ('n_luz','novato','sagrado','sagrado',1,1,5,'skill','Luz Purificadora','Magia sagrada — dano elevado contra trevas e mortos-vivos.',
     '{"kind":"skill","element":"sagrado","power":50,"mpCost":7,"effectType":"dano","cooldown":2}', 1, 'n_golpe', NULL, 1),
  ('n_sag_mod1','novato','sagrado','sagrado',2,1,3,'passive','Fé Radiante','+8% de dano sagrado por rank.',
     '{"kind":"mod","mod":"element_dmg","element":"sagrado","pct_per_rank":8}', 3, 'n_luz', 'n_sag', 2),
  ('n_sag_mod2','novato','sagrado','sagrado',2,1,3,'passive','Devoção','+7% de dano mágico por rank.',
     '{"kind":"mod","mod":"school_dmg","school":"magico","pct_per_rank":7}', 3, 'n_luz', 'n_sag', 3),
  ('n_sag_var','novato','sagrado','sagrado',3,2,1,'variant','Julgamento','Transforma Luz Purificadora num feixe sagrado de dano massivo.',
     '{"kind":"variant","transform":"julgamento","bonus_pct":50}', 8, 'n_luz', NULL, 4),
  ('n_cura','novato','suporte','sagrado',1,1,5,'skill','Cura Menor','Restaura HP do herói. Sobe de rank para curar mais.',
     '{"kind":"skill","element":"sagrado","power":40,"mpCost":8,"effectType":"heal","cooldown":3,"pct_per_rank":12}', 1, 'n_golpe', NULL, 1),
  ('n_escudo','novato','suporte','sagrado',2,1,5,'skill','Bênção Protetora','Escudo que absorve parte do dano recebido no próximo golpe.',
     '{"kind":"skill","element":"sagrado","power":45,"mpCost":7,"effectType":"buff","cooldown":3,"pct_per_rank":10}', 3, 'n_cura', NULL, 2),
  ('n_sup_var','novato','suporte','sagrado',3,2,1,'variant','Aura Restauradora','Transforma Cura Menor numa cura potente ao longo de vários turnos.',
     '{"kind":"variant","transform":"aura_restauradora","bonus_pct":40}', 8, 'n_cura', NULL, 3)
ON CONFLICT (id) DO NOTHING;
