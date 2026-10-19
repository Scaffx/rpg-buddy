import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type AdventureEncounter = {
  stage: number;
  attempt: number;
  fought_at: string;
  kind: 'normal' | 'boss';
  won: boolean;
  hero_power: number;
  enemy_power: number;
  gold: number;
  item_id: string | null;
};

export type AdventureSnapshot = {
  stage: number;
  next_at: string;
  server_now: string;
  last_result: Omit<AdventureEncounter, 'attempt' | 'fought_at'> | null;
  encounters: AdventureEncounter[];
  gold_today: number;
  loot_today: number;
  limits: { interval_minutes: number; offline_hours: number; gold_per_day: number; items_per_day: number };
};

export function useAutoAdventure() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['auto-adventure', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<AdventureSnapshot> => {
      // The RPC has no arguments; identity, time, battle and reward stay on the server.
      const rpcClient = supabase as unknown as { rpc(name: string): Promise<{ data: unknown; error: { message: string } | null }> };
      const { data, error } = await rpcClient.rpc('sync_auto_adventure');
      if (error) throw new Error(error.message);
      const snapshot = data as Partial<AdventureSnapshot> | null;
      if (!snapshot || typeof snapshot.stage !== 'number' || !Array.isArray(snapshot.encounters)) {
        throw new Error('Resposta inválida da aventura.');
      }
      return snapshot as AdventureSnapshot;
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const latest = query.data?.encounters[0];
  useEffect(() => {
    if (!latest?.won) return;
    void queryClient.invalidateQueries({ queryKey: ['gold-balance', user?.id] });
    void queryClient.invalidateQueries({ queryKey: ['gold-history'] });
    void queryClient.invalidateQueries({ queryKey: ['inventory', user?.id] });
  }, [latest?.stage, latest?.attempt, latest?.won, queryClient, user?.id]);

  return query;
}
