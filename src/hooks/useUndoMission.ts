// src/hooks/useUndoMission.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export function useUndoMission() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (missionId: string) => {
      // 🔒 Reversão server-side: o RPC undo_mission lê os valores reais
      // creditados e reverte XP/ouro/atributos/chaves atomicamente. Fecha o
      // farm via loop completar/desfazer (secundários -12, chave revertida).
      const today = new Date().toLocaleDateString('en-CA');
      const { data, error } = await supabase.rpc('undo_mission', {
        p_mission_id: missionId,
        p_today: today,
      });
      if (error) throw error;
      const r = (data || {}) as { xpEarned?: number; goldEarned?: number };
      return { success: true, missionId, xpEarned: r.xpEarned ?? 0, goldEarned: r.goldEarned ?? 0 };
    },

    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['missions'] });
      queryClient.invalidateQueries({ queryKey: ['attributes'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
      // undo_mission reverte o progresso de planos vinculados (-1) no servidor.
      queryClient.invalidateQueries({ queryKey: ['plans'] });

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