-- Mini-árvore do APRENDIZ (tier 0, lv 1-4): TUTORIAL da mecânica antes da escolha
-- de classe no lv4. Guardrail de economia: máx. 3 pontos GASTÁVEIS no total
--   Golpe (max_rank 2 = 2 pts) + UM Livro exclusivo (max_rank 1 = 1 pt) = 3.
-- Nós NÃO são pré-requisito de nada fora daqui (árvore tier-1 segue independente).
INSERT INTO public.skill_tree_nodes
  (id, tree, branch, area, tier, cost, max_rank, node_type, name, description, effect, gate_points, prereq_node_id, exclusive_group, sort) VALUES
  ('a_golpe','aprendiz','tronco','fisico',0,1,2,'skill','Golpe Improvisado',
     'Soco ou facada — ataque físico sem custo de MP. Suba de rank para bater mais forte.',
     '{"kind":"skill","element":"neutro","power":30,"mpCost":0,"effectType":"dano","cooldown":1,"pct_per_rank":15}', 0, NULL, NULL, 0),
  ('a_forca','aprendiz','forca','fisico',1,1,1,'passive','Livro de Força',
     '+4% de dano físico. Sinaliza o caminho do Guerreiro/Ferreiro.',
     '{"kind":"mod","mod":"school_dmg","school":"fisico","pct_per_rank":4}', 1, 'a_golpe', 'a_livro', 1),
  ('a_estudos','aprendiz','arcano','arcano',1,1,1,'passive','Livro de Estudos',
     '+4% de dano mágico. Sinaliza o caminho do Mago.',
     '{"kind":"mod","mod":"school_dmg","school":"magico","pct_per_rank":4}', 1, 'a_golpe', 'a_livro', 2),
  ('a_agilidade','aprendiz','furtividade','fisico',1,1,1,'passive','Livro de Agilidade',
     '+4% de dano físico. Sinaliza o caminho do Gatuno/Arqueiro.',
     '{"kind":"mod","mod":"school_dmg","school":"fisico","pct_per_rank":4}', 1, 'a_golpe', 'a_livro', 3)
ON CONFLICT (id) DO NOTHING;