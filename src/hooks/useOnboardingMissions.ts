import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type OnboardingMissionCode =
  | 'enter_system'
  | 'create_mission'
  | 'create_goal'
  | 'log_meal'
  | 'log_water'
  | 'record_measurement';

export type OnboardingMission = {
  code: OnboardingMissionCode;
  sort_order: number;
  xp_reward: number;
  reward_kind: 'starter_kit' | 'xp';
  unlocked: boolean;
  claimed: boolean;
  claimed_at: string | null;
};

type ClaimOnboardingMissionResult = {
  code: OnboardingMissionCode;
  xp_reward: number;
  reward_kind: 'starter_kit' | 'xp';
  total_xp: number;
  level: number;
};

type RpcError = { message: string };

interface OnboardingRpc {
  (
    functionName: 'get_onboarding_missions',
  ): PromiseLike<{ data: OnboardingMission[] | null; error: RpcError | null }>;
  (
    functionName: 'claim_onboarding_mission',
    args: { p_code: OnboardingMissionCode },
  ): PromiseLike<{ data: ClaimOnboardingMissionResult | null; error: RpcError | null }>;
}

const onboardingRpc = supabase.rpc.bind(supabase) as unknown as OnboardingRpc;

export function useOnboardingMissions() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['onboarding-missions', user?.id],
    enabled: !!user,
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async () => {
      const { data, error } = await onboardingRpc('get_onboarding_missions');
      if (error) throw error;
      return (data || []) as OnboardingMission[];
    },
  });
}

export function useClaimOnboardingMission() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (code: OnboardingMissionCode) => {
      if (!user) throw new Error('Não autenticado');

      const { data, error } = await onboardingRpc(
        'claim_onboarding_mission',
        { p_code: code },
      );
      if (error) throw error;
      return data as ClaimOnboardingMissionResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-missions', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['inventory', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['xp_today', user?.id] });
    },
  });
}
