import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { nextAdventureRefetchDelay, parseAdventureSnapshot } from '@/lib/autoAdventurePayload';
import type { AdventureSnapshot } from '@/lib/autoAdventurePayload';
export type { AdventureAttack, AdventureBattle, AdventureEncounter, AdventureSnapshot } from '@/lib/autoAdventurePayload';

type Catchup = AdventureSnapshot['catchup'];

function recordSummary(queryClient: ReturnType<typeof useQueryClient>, userId: string, snapshot: AdventureSnapshot) {
  const next = snapshot.catchup;
  if (next.battles === 0) return;
  queryClient.setQueryData<Catchup | null>(['auto-adventure-summary', userId], previous => ({
    battles: (previous?.battles ?? 0) + next.battles,
    from_stage: previous?.from_stage ?? next.from_stage,
    to_stage: next.to_stage,
    wins: (previous?.wins ?? 0) + next.wins,
    defeats: (previous?.defeats ?? 0) + next.defeats,
    retreats: (previous?.retreats ?? 0) + next.retreats,
    gold: (previous?.gold ?? 0) + next.gold,
    items: [...(previous?.items ?? []), ...next.items],
    defeated: (previous?.defeated ?? false) || next.defeated,
    pending: next.pending,
  }));
}

export function useAutoAdventure({ background = false }: { background?: boolean } = {}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['auto-adventure', user?.id],
    enabled: !!user,
    queryFn: async () => {
      // The RPC has no arguments; identity, time, battle and reward stay on the server.
      const { data, error } = await supabase.rpc('sync_auto_adventure');
      if (error) throw new Error(error.message);
      const snapshot = parseAdventureSnapshot(data);
      if (user?.id) recordSummary(queryClient, user.id, snapshot);
      return snapshot;
    },
    staleTime: 10_000,
    refetchInterval: background
      ? current => nextAdventureRefetchDelay(current.state.data, current.state.dataUpdatedAt)
      : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: background,
    refetchOnReconnect: background,
    refetchOnMount: background,
    retry: false,
  });
  const summaryQuery = useQuery<Catchup | null>({
    queryKey: ['auto-adventure-summary', user?.id], enabled: false,
    queryFn: async () => null, initialData: null,
  });

  const hasRecordedWin = (query.data?.catchup.gold ?? 0) > 0 || (query.data?.catchup.items.length ?? 0) > 0;
  const hasRecordedBossWin = (query.data?.boss_wins_credited ?? 0) > 0;
  useEffect(() => {
    if (!background || !hasRecordedWin) return;
    void queryClient.invalidateQueries({ queryKey: ['gold-balance', user?.id] });
    void queryClient.invalidateQueries({ queryKey: ['gold-history'] });
    void queryClient.invalidateQueries({ queryKey: ['inventory', user?.id] });
  }, [background, query.dataUpdatedAt, hasRecordedWin, queryClient, user?.id]);

  useEffect(() => {
    if (!background || !hasRecordedBossWin) return;
    void queryClient.invalidateQueries({ queryKey: ['pet_catalog', user?.id] });
    void queryClient.invalidateQueries({ queryKey: ['boss_battles'] });
  }, [background, query.dataUpdatedAt, hasRecordedBossWin, queryClient, user?.id]);

  return {
    ...query,
    summary: summaryQuery.data,
    acknowledgeSummary: () => queryClient.setQueryData(['auto-adventure-summary', user?.id], null),
  };
}

export function useAdvanceAutoAdventure() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ battleId }: { battleId: string }) => {
      const { data, error } = await supabase.rpc('advance_auto_adventure', {
        p_battle_id: battleId,
      });
      if (error) throw new Error(error.message);
      return parseAdventureSnapshot(data);
    },
    onSuccess: async snapshot => {
      queryClient.setQueryData(['auto-adventure', user?.id], snapshot);
      if (user?.id) recordSummary(queryClient, user.id, snapshot);
      if (snapshot.catchup.gold > 0 || snapshot.catchup.items.length > 0) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['gold-balance', user?.id] }),
          queryClient.invalidateQueries({ queryKey: ['gold-history'] }),
          queryClient.invalidateQueries({ queryKey: ['inventory', user?.id] }),
        ]);
      }
      if (snapshot.boss_wins_credited > 0) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['pet_catalog', user?.id] }),
          queryClient.invalidateQueries({ queryKey: ['boss_battles'] }),
        ]);
      }
    },
  });
}
