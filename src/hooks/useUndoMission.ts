// src/hooks/useUndoMission.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getSaoPauloDateString } from '@/lib/weeklyMissions';

export function useUndoMission() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ missionId, date }: { missionId: string; date?: string }) => {
      // 🔒 Reversão server-side: o RPC undo_mission lê os valores reais
      // creditados e reverte XP/ouro/atributos/chaves atomicamente. Fecha o
      // farm via loop completar/desfazer (secundários -12, chave revertida).
      // O dia desfeito é o que a pessoa está olhando, não sempre hoje: com a
      // janela D-1, desfazer na visão de ontem apagava a conclusão de hoje.
      // A janela continua sendo validada no servidor.
      const today = date ?? getSaoPauloDateString();
      const { data, error } = await supabase.rpc('undo_mission', {
        p_mission_id: missionId,
        p_today: today,
      });
      if (error) throw error;
      const r = data as {
        success?: boolean; xpEarned?: number; goldEarned?: number;
        frequency_type?: 'daily' | 'weekly' | 'unique'; weekly_count?: number | null;
        milestone_revoked?: boolean; evaluation_reopened?: boolean;
      } | null;
      if (!r?.success || !Number.isFinite(r.xpEarned) || !Number.isFinite(r.goldEarned)) {
        throw new Error('Resposta inválida do servidor ao desfazer a missão');
      }
      return {
        success: true, missionId, xpEarned: r.xpEarned!, goldEarned: r.goldEarned!,
        frequencyType: r.frequency_type ?? 'daily',
        weeklyCount: r.weekly_count ?? null,
        milestoneRevoked: !!r.milestone_revoked,
        evaluationReopened: !!r.evaluation_reopened,
      };
    },

    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['missions'] });
      queryClient.invalidateQueries({ queryKey: ['attributes'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
      queryClient.invalidateQueries({ queryKey: ['xp_today'] });
      queryClient.invalidateQueries({ queryKey: ['xp_history'] });
      queryClient.invalidateQueries({ queryKey: ['gold-balance'] });
      queryClient.invalidateQueries({ queryKey: ['gold-history'] });
      queryClient.invalidateQueries({ queryKey: ['missions_today_count'] });
      queryClient.invalidateQueries({ queryKey: ['rank_position'] });
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      queryClient.invalidateQueries({ queryKey: ['reports-data'] });
      queryClient.invalidateQueries({ predicate: (query) =>
        typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith('leaderboard_') });

      toast({
        title: '↩️ Missão desfeita!',
        description: `-${data.xpEarned} XP -${data.goldEarned} 🪙`,
      });
    },

    onError: (error: Error) => {
      toast({
        title: 'Erro ao desfazer',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
