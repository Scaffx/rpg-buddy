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


      // Buscar registro de conclusão diária para saber o XP/gold real
      const { data: completion } = await supabase
        .from('mission_daily_completions')
        .select('xp_earned, gold_earned')
        .eq('mission_id', missionId)
        .eq('completion_date', today)
        .single();

      const xpEarned = (completion as any)?.xp_earned ?? 25;
      const goldEarned = (completion as any)?.gold_earned ?? 2;

      // Remover registro de conclusão diária
      await supabase
        .from('mission_daily_completions' as any)
        .delete()
        .eq('mission_id', missionId)
        .eq('completion_date', today);

      // Reverter atributo primário
      const { data: attr } = await supabase
        .from('attributes')
        .select('xp, level')
        .eq('id', typedMission.attribute_id)
        .single();

      if (attr) {
        const newXp = Math.max(0, attr.xp - xpEarned);
        // Usar xpTable para calcular o level
        const xpTable = [0, 200, 350, 500, 700, 950, 1250, 1600, 2000, 2450, 2950, 3500, 4100, 4750, 5450, 6200, 7000, 7850, 8750, 9700, 10700, 11750, 12850, 14000, 15200, 16450, 17750, 19100, 20500, 21950, 23450, 25000];
        let newLevel = 1;
        for (let i = xpTable.length - 1; i > 0; i--) {
          if (newXp >= xpTable[i]) {
            newLevel = i + 1;
            break;
          }
        }
        // O nível nunca pode diminuir
        newLevel = Math.max(newLevel, attr.level);

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
          const xpTable = [0, 200, 350, 500, 700, 950, 1250, 1600, 2000, 2450, 2950, 3500, 4100, 4750, 5450, 6200, 7000, 7850, 8750, 9700, 10700, 11750, 12850, 14000, 15200, 16450, 17750, 19100, 20500, 21950, 23450, 25000];
          let newLevel = 1;
          for (let i = xpTable.length - 1; i > 0; i--) {
            if (newXp >= xpTable[i]) {
              newLevel = i + 1;
              break;
            }
          }
          newLevel = Math.max(newLevel, secAttr.level);

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
        const xpTable = [0, 200, 350, 500, 700, 950, 1250, 1600, 2000, 2450, 2950, 3500, 4100, 4750, 5450, 6200, 7000, 7850, 8750, 9700, 10700, 11750, 12850, 14000, 15200, 16450, 17750, 19100, 20500, 21950, 23450, 25000];
        let newLevel = 1;
        for (let i = xpTable.length - 1; i > 0; i--) {
          if (newTotalXp >= xpTable[i]) {
            newLevel = i + 1;
            break;
          }
        }
        newLevel = Math.max(newLevel, profile.level);

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