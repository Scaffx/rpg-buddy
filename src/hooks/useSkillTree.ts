import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export type SkillTreeNode = {
  id: string;
  area: string;
  tier: number;
  cost: number;
  max_rank: number;
  node_type: 'passive' | 'skill';
  name: string;
  description: string;
  effect: Record<string, any>;
  gate_points: number;
  prereq_node_id: string | null;
  sort: number;
};

/** Definição da árvore (estática, vinda do banco — fonte única). */
export function useSkillTreeNodes() {
  return useQuery({
    queryKey: ['skill_tree_nodes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('skill_tree_nodes')
        .select('*')
        .order('area')
        .order('tier')
        .order('sort');
      if (error) throw error;
      return (data || []) as SkillTreeNode[];
    },
    staleTime: 10 * 60 * 1000,
  });
}

/** Alocações do jogador (node_id -> rank). */
export function usePlayerSkillNodes() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['player_skill_nodes', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('player_skill_nodes')
        .select('node_id, rank')
        .eq('user_id', user!.id);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const row of data || []) map[(row as any).node_id] = (row as any).rank;
      return map;
    },
    enabled: !!user,
  });
}

export function useAllocateSkillNode() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (nodeId: string) => {
      const { data, error } = await supabase.rpc('allocate_skill_node', { p_node_id: nodeId });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['player_skill_nodes', user?.id] });
    },
  });
}

export function useResetSkillTree() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('reset_skill_tree');
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['player_skill_nodes', user?.id] });
    },
  });
}

/** Soma de pontos gastos (rank × cost) dada a definição + alocações. */
export function computeSpentPoints(nodes: SkillTreeNode[], ranks: Record<string, number>): number {
  let spent = 0;
  for (const n of nodes) spent += (ranks[n.id] || 0) * n.cost;
  return spent;
}
