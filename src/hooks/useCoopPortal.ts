import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type CoopDifficulty = 'easy' | 'medium' | 'hard' | 'legendary' | 'ultra';
export type CoopSession = {
  session_id: string;
  host_id: string;
  invite_code: string;
  source: 'daily' | 'fragments';
  difficulty: CoopDifficulty;
  status: 'lobby' | 'active' | 'completed' | 'failed' | 'expired';
  wave: number;
  expires_at: string;
  players: { user_id: string; name: string; level: number; hp: number; max_hp: number; companion: string | null }[];
  enemies: { slot: number; boss_id: string; name: string; icon: string; hp: number; max_hp: number }[];
  timeline: { id: number; message: string; at: string }[];
};

async function portalRpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name as never, (args ?? {}) as never);
  if (error) throw error;
  return data as T;
}

export function useCoopSessions() {
  return useQuery({
    queryKey: ['portal-coop-sessions'],
    queryFn: () => portalRpc<{ session_id: string; difficulty: CoopDifficulty; status: string; source: string }[]>('portal_coop_my_sessions'),
    refetchInterval: 5_000,
  });
}

export function useCoopState(sessionId: string | null) {
  return useQuery({
    queryKey: ['portal-coop-state', sessionId],
    queryFn: () => portalRpc<CoopSession>('portal_coop_state', { p_session_id: sessionId }),
    enabled: !!sessionId,
    refetchInterval: 2_000,
  });
}

export function useCoopActions() {
  const client = useQueryClient();
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['portal-coop-state'] });
    void client.invalidateQueries({ queryKey: ['portal-coop-sessions'] });
    void client.invalidateQueries({ queryKey: ['portal-event'] });
    void client.invalidateQueries({ queryKey: ['my-fragments'] });
  };
  const create = useMutation({
    mutationFn: (p: { source: 'daily' | 'fragments'; difficulty: CoopDifficulty | null; eventId: string | null; requestId: string; companionId: string | null }) =>
      portalRpc<{ session_id: string; invite_code: string; difficulty: CoopDifficulty }>('portal_coop_create', {
        p_source: p.source, p_difficulty: p.difficulty, p_event_id: p.eventId,
        p_request_id: p.requestId, p_companion_id: p.companionId,
      }),
    onSuccess: refresh,
  });
  const join = useMutation({
    mutationFn: (p: { code: string; companionId: string | null }) =>
      portalRpc<{ session_id: string }>('portal_coop_join', { p_code: p.code, p_companion_id: p.companionId }),
    onSuccess: refresh,
  });
  const start = useMutation({
    mutationFn: (sessionId: string) => portalRpc<{ status: string }>('portal_coop_start', { p_session_id: sessionId }),
    onSuccess: refresh,
  });
  const attack = useMutation({
    mutationFn: (p: { sessionId: string; slot: number; actionId: string }) =>
      portalRpc<{ status: string; wave: number; damage: number }>('portal_coop_action', {
        p_session_id: p.sessionId, p_action_id: p.actionId, p_target_slot: p.slot,
      }),
    onSuccess: refresh,
  });
  return { create, join, start, attack };
}
