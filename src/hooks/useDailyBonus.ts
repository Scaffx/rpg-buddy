import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { getLevelFromXp } from '@/lib/progression';

const DAILY_BONUS_XP = 15;
const DAILY_BONUS_GOLD = 5;

async function getGlobalOffensiveStreak(userId: string): Promise<number> {
  const { data: completions } = await (supabase as any)
    .from('mission_daily_completions')
    .select('completion_date')
    .eq('user_id', userId)
    .order('completion_date', { ascending: false })
    .limit(120);

  const uniqueDates = Array.from(new Set((completions || []).map((c: any) => String(c.completion_date || ''))))
    .filter(Boolean)
    .sort((a, b) => (a > b ? -1 : 1));

  if (uniqueDates.length === 0) return 0;

  let streak = 0;
  let previous = new Date(`${new Date().toISOString().split('T')[0]}T12:00:00`);

  for (const dateStr of uniqueDates) {
    const current = new Date(`${dateStr}T12:00:00`);
    const diffDays = Math.floor((previous.getTime() - current.getTime()) / (24 * 60 * 60 * 1000));

    if (diffDays <= 0) {
      streak += 1;
      previous = current;
      continue;
    }

    if (diffDays === 1) {
      streak += 1;
      previous = current;
      continue;
    }

    break;
  }

  return streak;
}

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

      // Investidor Anjo: +1 ouro no primeiro login do dia se streak ofensiva > 5.
      let investorBonusGold = 0;
      const { data: talents } = await (supabase as any)
        .from('talentos_jogador')
        .select('talentos_disponiveis(efeito)')
        .eq('personagem_id', user.id);

      const hasInvestidorAnjo = (talents || []).some(
        (row: any) => String(row?.talentos_disponiveis?.efeito || '') === 'investidor_anjo',
      );

      if (hasInvestidorAnjo) {
        const today = new Date().toISOString().split('T')[0];
        const { data: todayInvestorLog } = await (supabase as any)
          .from('activity_log')
          .select('id')
          .eq('user_id', user.id)
          .eq('action', 'investidor_anjo_daily')
          .gte('created_at', `${today}T00:00:00.000Z`)
          .limit(1)
          .maybeSingle();

        if (!todayInvestorLog) {
          const streak = await getGlobalOffensiveStreak(user.id);
          if (streak > 5) {
            investorBonusGold = 1;
            await (supabase as any).from('activity_log').insert({
              user_id: user.id,
              action: 'investidor_anjo_daily',
              description: `Investidor Anjo: +1 🪙 no primeiro login do dia (streak ofensiva ${streak}).`,
              xp_gained: 0,
            });
          }
        }
      }

      await supabase
        .from('user_balance')
        .update({
          gold: currentGold + DAILY_BONUS_GOLD + investorBonusGold,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('user_id', user.id);

      // Log the bonus
      await supabase.from('activity_log').insert({
        user_id: user.id,
        action: 'daily_bonus',
        description: `Bonus diario coletado: +${DAILY_BONUS_XP} XP, +${DAILY_BONUS_GOLD + investorBonusGold} 🪙`,
        xp_gained: DAILY_BONUS_XP,
      });

      return { xp: DAILY_BONUS_XP, gold: DAILY_BONUS_GOLD + investorBonusGold };
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
