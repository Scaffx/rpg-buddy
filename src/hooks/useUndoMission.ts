// src/hooks/useUndoMission.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Database } from '@/types/supabase';

export function useUndoMission() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (missionId: string) => {
      const today = new Date().toISOString().split('T')[0];

      // Buscar missão
      const { data: mission, error: missionError } = await supabase
        .from('missions')
        .select('*')
        .eq('id', missionId)
        .single();

      if (missionError) throw missionError;

      const typedMission = mission as any;

      // Verificar se foi concluída hoje
      const dailyStatus = (typedMission.daily_status as { [key: string]: string }) || {};
      if (dailyStatus[today] !== 'completed') {
        throw new Error('Esta missão não foi concluída hoje');
      }

      // Remover conclusão de hoje
      delete dailyStatus[today];

      const { error: updateError } = await supabase
        .from('missions')
        .update({ daily_status: dailyStatus } as any)
        .eq('id', missionId);

      if (updateError) throw updateError;

      // Remover registro de conclusão diária
      await supabase
        .from('mission_daily_completions' as any)
        .delete()
        .eq('mission_id', missionId)
        .eq('completion_date', today);

      // Reverter XP e Ouro (valores padrão)
      const xpEarned = 25;
      const goldEarned = 2;

      // Reverter atributo primário
      const { data: attr } = await supabase
        .from('attributes')
        .select('xp, level')
        .eq('id', typedMission.attribute_id)
        .single();

      if (attr) {
        const newXp = Math.max(0, attr.xp - xpEarned);
        const calculatedLevel = Math.floor(newXp / 100) + 1;
        // O nível nunca pode diminuir
        const newLevel = Math.max(calculatedLevel, attr.level);

        await supabase
          .from('attributes')
          .update({ xp: newXp, level: newLevel })
          .eq('id', typedMission.attribute_id);
      }

      // Reverter atributos secundários
      const secondaryIds = (typedMission.secondary_attribute_ids as string[]) || [];
      for (const secId of secondaryIds) {
        const { data: secAttr } = await supabase
          .from('attributes')
          .select('xp, level')
          .eq('id', secId)
          .single();

        if (secAttr) {
          const newXp = Math.max(0, secAttr.xp - 1);
          const calculatedLevel = Math.floor(newXp / 100) + 1;
          // O nível nunca pode diminuir
          const newLevel = Math.max(calculatedLevel, secAttr.level);

          await supabase
            .from('attributes')
            .update({ xp: newXp, level: newLevel })
            .eq('id', secId);
        }
      }

      // Reverter perfil
      const { data: profile } = await supabase
        .from('profiles')
        .select('total_xp, xp_today, missions_completed, level')
        .eq('user_id', user!.id)
        .single();

      if (profile) {
        const newTotalXp = Math.max(0, profile.total_xp - xpEarned);
        const calculatedLevel = Math.floor(newTotalXp / 200) + 1;
        // O nível nunca pode diminuir
        const newLevel = Math.max(calculatedLevel, profile.level);

        await supabase
          .from('profiles')
          .update({
            total_xp: newTotalXp,
            xp_today: Math.max(0, profile.xp_today - xpEarned),
            missions_completed: Math.max(0, profile.missions_completed - 1),
            level: newLevel,
          })
          .eq('user_id', user!.id);
      }

      // Reverter ouro
      const { data: bal } = await supabase
        .from('user_balance')
        .select('gold')
        .eq('user_id', user!.id)
        .maybeSingle();

      if (bal) {
        const currentGold = (bal as any).gold ?? 100;

        await supabase
          .from('user_balance')
          .update({ 
            gold: Math.max(0, currentGold - goldEarned),
            updated_at: new Date().toISOString() 
          } as any)
          .eq('user_id', user!.id);
      }

      // Registrar undo
      await supabase
        .from('activity_log')
        .insert({
          user_id: user!.id,
          action: 'mission_undo',
          description: `Missão desfeita! -${xpEarned} XP -${goldEarned} 🪙`,
          xp_gained: -xpEarned,
        });

      return { success: true, missionId, xpEarned, goldEarned };
    },

    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['missions'] });
      queryClient.invalidateQueries({ queryKey: ['attributes'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });

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