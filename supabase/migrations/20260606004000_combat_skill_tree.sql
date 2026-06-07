-- Roadmap: Árvore de Combate estilo D4 (fase 1 — estrutura + gates + alocação).
-- Pontos = nível do jogador (1/nível). Nós com RANKS (1..max_rank), custo por rank.
-- Gates cumulativos: um nó só abre quando o total gasto na árvore >= gate_points.
-- Efeitos (effect jsonb) são metadados aplicados no combate na FASE 2.

-- 1) Definição da árvore (fonte única; cliente e RPC leem daqui).
CREATE TABLE IF NOT EXISTS public.skill_tree_nodes (
  id            text PRIMARY KEY,
  area          text NOT NULL,                 -- fisico/fogo/gelo/raio/arcano/suporte
  tier          int  NOT NULL DEFAULT 1,
  cost          int  NOT NULL DEFAULT 1,       -- custo por rank
  max_rank      int  NOT NULL DEFAULT 5,
  node_type     text NOT NULL DEFAULT 'passive' CHECK (node_type IN ('passive','skill')),
  name          text NOT NULL,
  description   text NOT NULL,
  effect        jsonb NOT NULL DEFAULT '{}'::jsonb,  -- modificador (aplicado na fase 2)
  gate_points   int  NOT NULL DEFAULT 0,       -- total gasto necessário para abrir
  prereq_node_id text REFERENCES public.skill_tree_nodes(id),
  sort          int  NOT NULL DEFAULT 0
);
ALTER TABLE public.skill_tree_nodes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS skill_tree_nodes_read ON public.skill_tree_nodes;
CREATE POLICY skill_tree_nodes_read ON public.skill_tree_nodes
  FOR SELECT TO authenticated USING (true);

-- 2) Alocações do jogador (escrita só via RPC DEFINER; leitura própria).
CREATE TABLE IF NOT EXISTS public.player_skill_nodes (
  user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  node_id   text NOT NULL REFERENCES public.skill_tree_nodes(id) ON DELETE CASCADE,
  rank      int  NOT NULL DEFAULT 1 CHECK (rank >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, node_id)
);
ALTER TABLE public.player_skill_nodes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS player_skill_nodes_read_own ON public.player_skill_nodes;
CREATE POLICY player_skill_nodes_read_own ON public.player_skill_nodes
  FOR SELECT TO authenticated USING (user_id = auth.uid());
-- (sem políticas de INSERT/UPDATE/DELETE: só os RPCs SECURITY DEFINER alteram)

-- 3) RPC: alocar 1 rank num nó (server-authoritative).
CREATE OR REPLACE FUNCTION public.allocate_skill_node(p_node_id text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_node public.skill_tree_nodes%ROWTYPE;
  v_level int; v_spent int; v_cur_rank int; v_prereq_rank int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT * INTO v_node FROM public.skill_tree_nodes WHERE id = p_node_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NODE_NOT_FOUND'; END IF;

  SELECT GREATEST(1, COALESCE(level, 1)) INTO v_level FROM public.profiles WHERE user_id = v_uid;
  SELECT COALESCE(SUM(p.rank * n.cost), 0) INTO v_spent
    FROM public.player_skill_nodes p JOIN public.skill_tree_nodes n ON n.id = p.node_id
    WHERE p.user_id = v_uid;
  SELECT COALESCE(rank, 0) INTO v_cur_rank FROM public.player_skill_nodes WHERE user_id = v_uid AND node_id = p_node_id;

  IF v_cur_rank >= v_node.max_rank THEN RAISE EXCEPTION 'MAX_RANK'; END IF;
  IF v_spent + v_node.cost > v_level THEN RAISE EXCEPTION 'NO_POINTS'; END IF;
  IF v_spent < v_node.gate_points THEN RAISE EXCEPTION 'GATE_LOCKED'; END IF;
  IF v_node.prereq_node_id IS NOT NULL THEN
    SELECT COALESCE(rank, 0) INTO v_prereq_rank FROM public.player_skill_nodes WHERE user_id = v_uid AND node_id = v_node.prereq_node_id;
    IF v_prereq_rank < 1 THEN RAISE EXCEPTION 'PREREQ_LOCKED'; END IF;
  END IF;

  INSERT INTO public.player_skill_nodes (user_id, node_id, rank) VALUES (v_uid, p_node_id, 1)
  ON CONFLICT (user_id, node_id) DO UPDATE SET rank = public.player_skill_nodes.rank + 1, updated_at = now();

  RETURN jsonb_build_object('node_id', p_node_id, 'rank', v_cur_rank + 1, 'spent', v_spent + v_node.cost, 'available', v_level - (v_spent + v_node.cost));
END;
$fn$;

-- 4) RPC: resetar a árvore (respec). Fase 1: grátis (incentiva experimentar).
CREATE OR REPLACE FUNCTION public.reset_skill_tree()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  DELETE FROM public.player_skill_nodes WHERE user_id = v_uid;
  RETURN jsonb_build_object('ok', true);
END;
$fn$;

REVOKE ALL ON FUNCTION public.allocate_skill_node(text) FROM public;
REVOKE ALL ON FUNCTION public.reset_skill_tree() FROM public;
GRANT EXECUTE ON FUNCTION public.allocate_skill_node(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_skill_tree() TO authenticated;

-- 5) Seed da árvore (6 áreas × 3 tiers; ranks tornam os pontos escassos).
INSERT INTO public.skill_tree_nodes (id, area, tier, cost, max_rank, node_type, name, description, effect, gate_points, prereq_node_id, sort) VALUES
  ('fis1','fisico',1,1,5,'passive','Lâmina Afiada','+6% de dano físico por rank.', '{"mod":"school_dmg","school":"fisico","pct_per_rank":6}', 0, NULL, 1),
  ('fis2','fisico',2,1,5,'passive','Hemorragia','+8% de dano de Sangramento por rank.', '{"mod":"status_dmg","status":"bleeding","pct_per_rank":8}', 6, 'fis1', 2),
  ('fis3','fisico',3,1,3,'passive','Carnificina','+10% de dano contra alvos Sangrando por rank.', '{"mod":"vs_status_dmg","status":"bleeding","pct_per_rank":10}', 14, 'fis2', 3),
  ('fog1','fogo',1,1,5,'passive','Brasas','+6% de dano de Fogo por rank.', '{"mod":"element_dmg","element":"fogo","pct_per_rank":6}', 0, NULL, 1),
  ('fog2','fogo',2,1,5,'passive','Incêndio','+8% de dano de Queimadura por rank.', '{"mod":"status_dmg","status":"burning","pct_per_rank":8}', 6, 'fog1', 2),
  ('fog3','fogo',3,1,2,'passive','Conflagração','Queimadura dura +1 turno por rank.', '{"mod":"status_dur","status":"burning","turns_per_rank":1}', 14, 'fog2', 3),
  ('gel1','gelo',1,1,5,'passive','Frostbite','+6% de dano de Gelo por rank.', '{"mod":"element_dmg","element":"gelo","pct_per_rank":6}', 0, NULL, 1),
  ('gel2','gelo',2,1,2,'passive','Congelamento Profundo','Congelado dura +1 turno por rank.', '{"mod":"status_dur","status":"frozen","turns_per_rank":1}', 6, 'gel1', 2),
  ('gel3','gelo',3,1,3,'passive','Estilhaço Brutal','+12% no combo Estilhaçar por rank.', '{"mod":"combo_dmg","combo":"shatter","pct_per_rank":12}', 14, 'gel2', 3),
  ('rai1','raio',1,1,5,'passive','Estática','+6% de dano de Raio por rank.', '{"mod":"element_dmg","element":"raio","pct_per_rank":6}', 0, NULL, 1),
  ('rai2','raio',2,1,5,'passive','Sobrecarga','+10% no combo Choque por rank.', '{"mod":"combo_dmg","combo":"shock","pct_per_rank":10}', 6, 'rai1', 2),
  ('rai3','raio',3,1,3,'passive','Condutividade','+8% de dano contra alvos Molhados por rank.', '{"mod":"vs_status_dmg","status":"wet","pct_per_rank":8}', 14, 'rai2', 3),
  ('arc1','arcano',1,1,5,'passive','Foco Arcano','+6% de dano mágico por rank.', '{"mod":"school_dmg","school":"magico","pct_per_rank":6}', 0, NULL, 1),
  ('arc2','arcano',2,1,5,'passive','Mente Afiada','+10% de dano contra alvos Vulneráveis por rank.', '{"mod":"vs_status_dmg","status":"vulnerable","pct_per_rank":10}', 6, 'arc1', 2),
  ('arc3','arcano',3,1,3,'passive','Poder Arcano','+10% de dano mágico por rank.', '{"mod":"school_dmg","school":"magico","pct_per_rank":10}', 14, 'arc2', 3),
  ('sup1','suporte',1,1,5,'passive','Vitalidade','+5% de HP máximo por rank.', '{"mod":"max_hp_pct","pct_per_rank":5}', 0, NULL, 1),
  ('sup2','suporte',2,1,5,'passive','Mãos Curandeiras','+8% de cura por rank.', '{"mod":"heal_pct","pct_per_rank":8}', 6, 'sup1', 2),
  ('sup3','suporte',3,1,3,'passive','Resiliência','+6% de defesa por rank.', '{"mod":"def_pct","pct_per_rank":6}', 14, 'sup2', 3)
ON CONFLICT (id) DO NOTHING;
