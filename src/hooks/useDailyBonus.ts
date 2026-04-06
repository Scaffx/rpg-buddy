import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

const DAILY_BONUS_XP = 15;
const DAILY_BONUS_GOLD = 5;

export function useDailyBonus() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Não autenticado');

      const today = new Date().toISOString().split('T')[0];

      // Check if already claimed today
      const { data: existingClaim } = await supabase
        .from('activity_log')
        .select('id')
        .eq('user_id', user.id)
        .eq('action', 'daily_bonus')
        .eq('description', `like(${today})`)
        .maybeSingle();

      // Simplified check: use xp_gained field to check if bonus already claimed
      const { data: claims } = await supabase
        .from('activity_log')
        .select('created_at')
        .eq('user_id', user.id)
        .eq('action', 'daily_bonus')
        .gte('created_at', `${today}T00:00:00`)
        .lt('created_at', `${today}T23:59:59`);

      if (claims && claims.length > 0) {
        throw new Error('Você já coletou seu bônus diário hoje!');
      }

      // Add XP to profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('total_xp, level')
        .eq('user_id', user.id)
        .single();

      if (profile) {
        const newTotalXp = profile.total_xp + DAILY_BONUS_XP;
        const newLevel = Math.floor(newTotalXp / 200) + 1;

        await supabase
          .from('profiles')
          .update({
            total_xp: newTotalXp,
            level: newLevel,
          })
          .eq('user_id', user.id);
      }

      // Add gold to balance
      const { data: balance } = await supabase
        .from('user_balance')
        .select('gold')
        .eq('user_id', user.id)
        .single();

      const currentGold = (balance as any)?.gold ?? 100;

      await supabase
        .from('user_balance')
        .update({
          gold: currentGold + DAILY_BONUS_GOLD,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('user_id', user.id);

      // Log the bonus
      await supabase.from('activity_log').insert({
        user_id: user.id,
        action: 'daily_bonus',
        description: `Bônus diário coletado: +${DAILY_BONUS_XP} XP, +${DAILY_BONUS_GOLD} 🪙`,
        xp_gained: DAILY_BONUS_XP,
      });

      return { xp: DAILY_BONUS_XP, gold: DAILY_BONUS_GOLD };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['gold-balance'] });
    },
  });
}
