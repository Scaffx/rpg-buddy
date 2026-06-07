-- Árvore de Combate por CLASSE (estilo D4) — começando pelo Mago.
-- Evolui a tabela genérica (6 áreas) para um modelo por-classe com:
--  - tree: a qual classe a árvore pertence ('mago', ...)
--  - branch: galho (tronco/fogo/gelo/raio/arcano/...) para o layout do node-graph
--  - node_type: 'skill' (ativa, sobe de rank) | 'passive' (modificador) | 'variant'
--  - exclusive_group: modificadores que se excluem (escolher 1 de 2)
-- Elementos são PROPRIEDADE das skills (effect jsonb), não galhos genéricos.

ALTER TABLE public.skill_tree_nodes
  ADD COLUMN IF NOT EXISTS tree text NOT NULL DEFAULT 'geral',
  ADD COLUMN IF NOT EXISTS branch text NOT NULL DEFAULT 'geral',
  ADD COLUMN IF NOT EXISTS exclusive_group text;

ALTER TABLE public.skill_tree_nodes DROP CONSTRAINT IF EXISTS skill_tree_nodes_node_type_check;
ALTER TABLE public.skill_tree_nodes ADD CONSTRAINT skill_tree_nodes_node_type_check
  CHECK (node_type IN ('passive','skill','variant'));

-- Remove a árvore genérica anterior (primeira versão de ontem) — limpa alocações via cascade.
DELETE FROM public.skill_tree_nodes WHERE tree = 'geral';

-- RPC atualizado: pontos = nível (pool único entre árvores); gate é POR ÁRVORE;
-- grupos exclusivos (1 de 2); + correção do prereq (subquery escalar).
CREATE OR REPLACE FUNCTION public.allocate_skill_node(p_node_id text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_node public.skill_tree_nodes%ROWTYPE;
  v_level int; v_spent_total int; v_spent_tree int; v_cur_rank int; v_prereq_rank int; v_excl int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT * INTO v_node FROM public.skill_tree_nodes WHERE id = p_node_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NODE_NOT_FOUND'; END IF;

  SELECT GREATEST(1, COALESCE(level, 1)) INTO v_level FROM public.profiles WHERE user_id = v_uid;
  SELECT COALESCE(SUM(p.rank * n.cost), 0) INTO v_spent_total
    FROM public.player_skill_nodes p JOIN public.skill_tree_nodes n ON n.id = p.node_id
    WHERE p.user_id = v_uid;
  SELECT COALESCE(SUM(p.rank * n.cost), 0) INTO v_spent_tree
    FROM public.player_skill_nodes p JOIN public.skill_tree_nodes n ON n.id = p.node_id
    WHERE p.user_id = v_uid AND n.tree = v_node.tree;
  v_cur_rank := COALESCE((SELECT rank FROM public.player_skill_nodes WHERE user_id = v_uid AND node_id = p_node_id), 0);

  IF v_cur_rank >= v_node.max_rank THEN RAISE EXCEPTION 'MAX_RANK'; END IF;
  IF v_spent_total + v_node.cost > v_level THEN RAISE EXCEPTION 'NO_POINTS'; END IF;
  IF v_spent_tree < v_node.gate_points THEN RAISE EXCEPTION 'GATE_LOCKED'; END IF;
  IF v_node.prereq_node_id IS NOT NULL THEN
    v_prereq_rank := COALESCE((SELECT rank FROM public.player_skill_nodes WHERE user_id = v_uid AND node_id = v_node.prereq_node_id), 0);
    IF v_prereq_rank < 1 THEN RAISE EXCEPTION 'PREREQ_LOCKED'; END IF;
  END IF;
  IF v_node.exclusive_group IS NOT NULL AND v_cur_rank = 0 THEN
    SELECT COUNT(*) INTO v_excl
      FROM public.player_skill_nodes p JOIN public.skill_tree_nodes n ON n.id = p.node_id
      WHERE p.user_id = v_uid AND n.tree = v_node.tree
        AND n.exclusive_group = v_node.exclusive_group AND n.id <> v_node.id AND p.rank > 0;
    IF v_excl > 0 THEN RAISE EXCEPTION 'EXCLUSIVE_TAKEN'; END IF;
  END IF;

  INSERT INTO public.player_skill_nodes (user_id, node_id, rank) VALUES (v_uid, p_node_id, 1)
  ON CONFLICT (user_id, node_id) DO UPDATE SET rank = public.player_skill_nodes.rank + 1, updated_at = now();

  RETURN jsonb_build_object('node_id', p_node_id, 'rank', v_cur_rank + 1, 'spent', v_spent_total + v_node.cost, 'available', v_level - (v_spent_total + v_node.cost));
END;
$fn$;

-- Seed da ÁRVORE DO MAGO (tree='mago'): tronco + 4 galhos elementais.
-- Cada galho: skill (sobe rank) -> 2 modificadores exclusivos (escolha 1) -> variante.
INSERT INTO public.skill_tree_nodes
  (id, tree, branch, area, tier, cost, max_rank, node_type, name, description, effect, gate_points, prereq_node_id, exclusive_group, sort) VALUES
  ('m_dardo','mago','tronco','arcano',0,1,5,'skill','Dardo Arcano','Projétil arcano básico, sem custo de MP. Sobe de rank para mais dano.',
     '{"kind":"skill","element":"arcano","power":30,"mpCost":0,"effectType":"dano","cooldown":1,"pct_per_rank":10}', 0, NULL, NULL, 0),
  ('m_bola_fogo','mago','fogo','fogo',1,1,5,'skill','Bola de Fogo','Lança uma bola de fogo que aplica Queimadura (DoT).',
     '{"kind":"skill","element":"fogo","power":60,"mpCost":8,"effectType":"dano","cooldown":2}', 1, 'm_dardo', NULL, 1),
  ('m_fogo_mod1','mago','fogo','fogo',2,1,3,'passive','Chamas Voláteis','+8% de dano de Fogo por rank.',
     '{"kind":"mod","mod":"element_dmg","element":"fogo","pct_per_rank":8}', 3, 'm_bola_fogo', 'm_fogo', 2),
  ('m_fogo_mod2','mago','fogo','fogo',2,1,2,'passive','Brasa Persistente','Queimadura dura +1 turno por rank.',
     '{"kind":"mod","mod":"status_dur","status":"burning","turns_per_rank":1}', 3, 'm_bola_fogo', 'm_fogo', 3),
  ('m_fogo_var','mago','fogo','fogo',3,2,1,'variant','Meteoro','Transforma Bola de Fogo em Meteoro: dano em área massivo.',
     '{"kind":"variant","transform":"meteoro","aoe":true,"bonus_pct":40}', 8, 'm_bola_fogo', NULL, 4),
  ('m_lanca_gelo','mago','gelo','gelo',1,1,5,'skill','Lança de Gelo','Estaca de gelo que pode Congelar o alvo.',
     '{"kind":"skill","element":"gelo","power":58,"mpCost":8,"effectType":"dano","cooldown":2}', 1, 'm_dardo', NULL, 1),
  ('m_gelo_mod1','mago','gelo','gelo',2,1,3,'passive','Frio Cortante','+8% de dano de Gelo por rank.',
     '{"kind":"mod","mod":"element_dmg","element":"gelo","pct_per_rank":8}', 3, 'm_lanca_gelo', 'm_gelo', 2),
  ('m_gelo_mod2','mago','gelo','gelo',2,1,2,'passive','Geada Profunda','Congelado dura +1 turno por rank.',
     '{"kind":"mod","mod":"status_dur","status":"frozen","turns_per_rank":1}', 3, 'm_lanca_gelo', 'm_gelo', 3),
  ('m_gelo_var','mago','gelo','gelo',3,2,1,'variant','Nova Gélida','Transforma Lança de Gelo em Nova Gélida: explosão de gelo em área.',
     '{"kind":"variant","transform":"nova_gelida","aoe":true,"bonus_pct":40}', 8, 'm_lanca_gelo', NULL, 4),
  ('m_corrente_raio','mago','raio','raio',1,1,5,'skill','Corrente de Raio','Descarga elétrica; brilha contra alvos Molhados (combo Choque).',
     '{"kind":"skill","element":"raio","power":56,"mpCost":8,"effectType":"dano","cooldown":2}', 1, 'm_dardo', NULL, 1),
  ('m_raio_mod1','mago','raio','raio',2,1,3,'passive','Alta Tensão','+8% de dano de Raio por rank.',
     '{"kind":"mod","mod":"element_dmg","element":"raio","pct_per_rank":8}', 3, 'm_corrente_raio', 'm_raio', 2),
  ('m_raio_mod2','mago','raio','raio',2,1,3,'passive','Sobrecarga','+12% no combo Choque por rank.',
     '{"kind":"mod","mod":"combo_dmg","combo":"shock","pct_per_rank":12}', 3, 'm_corrente_raio', 'm_raio', 3),
  ('m_raio_var','mago','raio','raio',3,2,1,'variant','Tornado','Transforma Corrente de Raio em Tornado: vendaval que atinge em área.',
     '{"kind":"variant","transform":"tornado","aoe":true,"bonus_pct":40}', 8, 'm_corrente_raio', NULL, 4),
  ('m_estouro','mago','arcano','arcano',1,1,5,'skill','Estouro Arcano','Explosão de energia arcana pura.',
     '{"kind":"skill","element":"arcano","power":62,"mpCost":9,"effectType":"dano","cooldown":2}', 1, 'm_dardo', NULL, 1),
  ('m_arc_mod1','mago','arcano','arcano',2,1,3,'passive','Foco Arcano','+8% de dano mágico por rank.',
     '{"kind":"mod","mod":"school_dmg","school":"magico","pct_per_rank":8}', 3, 'm_estouro', 'm_arc', 2),
  ('m_arc_mod2','mago','arcano','arcano',2,1,3,'passive','Penetração Arcana','+10% de dano contra alvos Vulneráveis por rank.',
     '{"kind":"mod","mod":"vs_status_dmg","status":"vulnerable","pct_per_rank":10}', 3, 'm_estouro', 'm_arc', 3),
  ('m_arc_var','mago','arcano','arcano',3,2,1,'variant','Singularidade Arcana','Colapsa a energia num ponto: dano arcano devastador de alvo único.',
     '{"kind":"variant","transform":"singularidade","bonus_pct":60}', 8, 'm_estouro', NULL, 4)
ON CONFLICT (id) DO NOTHING;
