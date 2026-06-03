import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

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

      // 🔒 Server-side: cooldown de 24h, XP/ouro por nível e talento Investidor
      // Anjo são calculados e validados no RPC. O client não consegue mais
      // burlar o cooldown nem forjar os valores.
      const today = new Date().toLocaleDateString('en-CA');
      const { data, error } = await (supabase as any).rpc('claim_daily_bonus', { p_today: today });
      if (error) throw error;
      const result = (data || {}) as { xp?: number; gold?: number };
      return { xp: result.xp ?? 0, gold: result.gold ?? 0 };
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
