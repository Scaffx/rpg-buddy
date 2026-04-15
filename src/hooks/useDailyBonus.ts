import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { getLevelFromXp } from '@/lib/progression';

const DAILY_BONUS_XP = 15;
const DAILY_BONUS_GOLD = 5;

export function useDailyBonus() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Check if 24h have passed since last bonus claim
  const { data: bonusStatus = { isClaimed: false, nextClaimAt: null as string | null }, isLoading: isCheckingClaim } = useQuery({
    queryKey: ['daily-bonus-claimed', user?.id],
    queryFn: async () => {
      if (!user) return { isClaimed: false, nextClaimAt: null as string | null };

      // Busca o último bônus coletado (independente da data)
      const { data: lastClaim } = await supabase
        .from('activity_log')
        .select('created_at')
        .eq('user_id', user.id)
        .eq('action', 'daily_bonus')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!lastClaim) return { isClaimed: false, nextClaimAt: null };

      const lastClaimTime = new Date(lastClaim.created_at).getTime();
      const now = Date.now();
      const hoursSinceClaim = (now - lastClaimTime) / (1000 * 60 * 60);

      if (hoursSinceClaim < 24) {
        const nextClaimAt = new Date(lastClaimTime + 24 * 60 * 60 * 1000).toISOString();
        return { isClaimed: true, nextClaimAt };
      }

      return { isClaimed: false, nextClaimAt: null };
    },
    enabled: !!user,
    staleTime: 0,
  });

  const isClaimed = bonusStatus.isClaimed;
  const nextClaimAt = bonusStatus.nextClaimAt;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Não autenticado');

      // Verifica se já passou 24h desde o último bônus
      const { data: lastClaim } = await supabase
        .from('activity_log')
        .select('created_at')
        .eq('user_id', user.id)
        .eq('action', 'daily_bonus')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastClaim) {
        const hoursSince = (Date.now() - new Date(lastClaim.created_at).getTime()) / (1000 * 60 * 60);
        if (hoursSince < 24) {
          throw new Error('Aguarde 24h desde a última coleta para coletar novamente!');
        }
      }

      // Add XP to profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('total_xp, level')
        .eq('user_id', user.id)
        .single();

      if (profile) {
        const newTotalXp = profile.total_xp + DAILY_BONUS_XP;
        const newLevel = getLevelFromXp(newTotalXp);

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
    onMutate: async () => {
      // Cancela queries em andamento e marca como resgatado imediatamente
      await queryClient.cancelQueries({ queryKey: ['daily-bonus-claimed', user?.id] });
      const nextClaimTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      queryClient.setQueryData(['daily-bonus-claimed', user?.id], { isClaimed: true, nextClaimAt: nextClaimTime });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['gold-balance'] });
      queryClient.invalidateQueries({ queryKey: ['daily-bonus-claimed'] });
    },
    onError: () => {
      // Reverte o otimismo em caso de erro
      queryClient.invalidateQueries({ queryKey: ['daily-bonus-claimed'] });
    },
  });

  return {
    mutate: mutation.mutate,
    isPending: mutation.isPending,
    isClaimed,
    isCheckingClaim,
    nextClaimAt,
  };
}
