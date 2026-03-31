// src/hooks/useUndoMission.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export function useUndoMission() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (missionId: string) => {
      const today = new Date().toISOString().split('T')[0];

      // 1. Buscar missão
      const { data: mission, error: missionError } = await supabase
        .from('missions')
        .select('*')
        .eq('id', missionId)
        .single();

      if (missionError) throw missionError;

      // 2. Verificar se foi concluída hoje
      const dailyStatus = mission.daily_status || {};
      if (dailyStatus[today] !== 'completed') {
        throw new Error('Esta missão não foi concluída hoje');
      }

      // 3. Remover conclusão de hoje
      delete dailyStatus[today];

      const { error: updateError } = await supabase
        .from('missions')
        .update({ daily_status: dailyStatus })
        .eq('id', missionId);

      if (updateError) throw updateError;

      // 4. Remover registro de conclusão diária
      const { error: deleteError } = await supabase
        .from('mission_daily_completions')
        .delete()
        .eq('mission_id', missionId)
        .eq('completion_date', today);

      if (deleteError) throw deleteError;

      // 5. Buscar a conclusão para recuperar XP e Ouro
      const { data: completion } = await supabase
        .from('mission_daily_completions')
        .select('xp_earned, gold_earned')
        .eq('mission_id', missionId)
        .eq('completion_date', today)
        .single();

      const xpEarned = completion?.xp_earned || 0;
      const goldEarned = completion?.gold_earned || 2;

      // 6. Reverter XP do atributo primário
      const { data: attr } = await supabase
        .from('attributes')
        .select('xp, level')
        .eq('id', mission.attribute_id)
        .single();

      if (attr) {
        const newXp = Math.max(0, attr.xp - xpEarned);
        const newLevel = Math.floor(newXp / 100) + 1;

        await supabase
          .from('attributes')
          .update({ xp: newXp, level: newLevel })
          .eq('id', mission.attribute_id);
      }

      // 7. Reverter XP dos atributos secundários (-1 XP cada)
      const secondaryIds: string[] = (mission as any).secondary_attribute_ids || [];
      for (const secId of secondaryIds) {
        const { data: secAttr } = await supabase
          .from('attributes')
          .select('xp, level')
          .eq('id', secId)
          .single();

        if (secAttr) {
          const newXp = Math.max(0, secAttr.xp - 1);
          const newLevel = Math.floor(newXp / 100) + 1;

          await supabase
            .from('attributes')
            .update({ xp: newXp, level: newLevel })
            .eq('id', secId);
        }
      }

      // 8. Reverter XP do perfil
      const { data: profile } = await supabase
        .from('profiles')
        .select('total_xp, xp_today, missions_completed, level')
        .eq('user_id', user!.id)
        .single();

      if (profile) {
        const newTotalXp = Math.max(0, profile.total_xp - xpEarned);
        const newLevel = Math.floor(newTotalXp / 200) + 1;

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

      // 9. Reverter Ouro
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

      // 10. Registrar no log de atividades
      await supabase
        .from('activity_log')
        .insert({
          user_id: user!.id,
          action: 'mission_undo',
          description: `Missão desfeita! -${xpEarned} XP -${goldEarned} 🪙`,
          xp_gained: -xpEarned,
        });

      // 11. Registrar no histórico de XP
      await supabase
        .from('xp_history' as any)
        .insert({
          user_id: user!.id,
          xp_gained: -xpEarned,
          type: 'mission_undo',
        } as any);

      // 12. Registrar no histórico de ouro
      await supabase
        .from('gold_history' as any)
        .insert({
          user_id: user!.id,
          type: 'perda_desfazer',
          amount: -goldEarned,
          reason: 'Missão desfeita',
        } as any);

      return { success: true, missionId, xpEarned, goldEarned };
    },

    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['missions'] });
      queryClient.invalidateQueries({ queryKey: ['attributes'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
      queryClient.invalidateQueries({ queryKey: ['xp_history'] });
      queryClient.invalidateQueries({ queryKey: ['gold-balance'] });
      queryClient.invalidateQueries({ queryKey: ['gold-history'] });

      toast({
        title: '↩️ Missão desfeita!',
        description: `-${data.xpEarned} XP -${data.goldEarned} 🪙`,
        variant: 'default',
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