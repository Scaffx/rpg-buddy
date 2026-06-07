-- Fix: SELECT COALESCE(rank,0) INTO var sem linha atribui NULL (não 0), pois o
-- COALESCE só roda quando há linha. Isso fazia o gate de prereq não disparar.
-- Solução: subquery escalar + COALESCE (retorna 0 quando não há alocação).
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
  v_cur_rank := COALESCE((SELECT rank FROM public.player_skill_nodes WHERE user_id = v_uid AND node_id = p_node_id), 0);

  IF v_cur_rank >= v_node.max_rank THEN RAISE EXCEPTION 'MAX_RANK'; END IF;
  IF v_spent + v_node.cost > v_level THEN RAISE EXCEPTION 'NO_POINTS'; END IF;
  IF v_spent < v_node.gate_points THEN RAISE EXCEPTION 'GATE_LOCKED'; END IF;
  IF v_node.prereq_node_id IS NOT NULL THEN
    v_prereq_rank := COALESCE((SELECT rank FROM public.player_skill_nodes WHERE user_id = v_uid AND node_id = v_node.prereq_node_id), 0);
    IF v_prereq_rank < 1 THEN RAISE EXCEPTION 'PREREQ_LOCKED'; END IF;
  END IF;

  INSERT INTO public.player_skill_nodes (user_id, node_id, rank) VALUES (v_uid, p_node_id, 1)
  ON CONFLICT (user_id, node_id) DO UPDATE SET rank = public.player_skill_nodes.rank + 1, updated_at = now();

  RETURN jsonb_build_object('node_id', p_node_id, 'rank', v_cur_rank + 1, 'spent', v_spent + v_node.cost, 'available', v_level - (v_spent + v_node.cost));
END;
$fn$;
