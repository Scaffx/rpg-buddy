import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { nextAdventureRefetchDelay, parseAdventureSnapshot } from '@/lib/autoAdventurePayload';
import type { AdventureSnapshot } from '@/lib/autoAdventurePayload';
import { anchorAdventureClock, hasAdventureClockAnchor } from '@/lib/adventureClock';
export type { AdventureAttack, AdventureBattle, AdventureEncounter, AdventureSnapshot } from '@/lib/autoAdventurePayload';

type Catchup = AdventureSnapshot['catchup'];
type AdventureIdentity = { ownerId: string | null; generation: number };
const identities = new WeakMap<ReturnType<typeof useQueryClient>, AdventureIdentity>();

function trackIdentity(queryClient: ReturnType<typeof useQueryClient>, ownerId: string | null): AdventureIdentity {
  const previous = identities.get(queryClient);
  if (previous?.ownerId === ownerId) return previous;
  const current = { ownerId, generation: (previous?.generation ?? 0) + 1 };
  identities.set(queryClient, current);
  return current;
}

function recordSummary(queryClient: ReturnType<typeof useQueryClient>, userId: string, snapshot: AdventureSnapshot) {
  const next = snapshot.catchup;
  queryClient.setQueryData<Catchup | null>(['auto-adventure-summary', userId], previous => {
    // A live fight belongs in recent encounters, not in an endless offline recap.
    if (!previous?.pending && !next.pending && next.battles <= 1) return previous ?? null;
    return {
    battles: (previous?.battles ?? 0) + next.battles,
    from_stage: previous?.from_stage ?? next.from_stage,
    to_stage: next.to_stage ?? previous?.to_stage ?? null,
    wins: (previous?.wins ?? 0) + next.wins,
    defeats: (previous?.defeats ?? 0) + next.defeats,
    draws: (previous?.draws ?? 0) + (next.draws ?? 0),
    retreats: (previous?.retreats ?? 0) + next.retreats,
    gold: (previous?.gold ?? 0) + next.gold,
    items: [...(previous?.items ?? []), ...next.items],
    defeated: (previous?.defeated ?? false) || next.defeated,
    pending: next.pending,
    };
  });
}

export function useAutoAdventure({ background = false }: { background?: boolean } = {}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  trackIdentity(queryClient, user?.id ?? null);
  const query = useQuery({
    queryKey: ['auto-adventure', user?.id],
    enabled: !!user,
    queryFn: async () => {
      // The RPC has no arguments; identity, time, battle and reward stay on the server.
      const { data, error } = await supabase.rpc('sync_auto_adventure');
      if (error) throw new Error(error.message);
      const snapshot = anchorAdventureClock(parseAdventureSnapshot(data));
      if (user?.id) recordSummary(queryClient, user.id, snapshot);
      return snapshot;
    },
    staleTime: 10_000,
    structuralSharing: false,
    refetchInterval: background
      ? current => current.state.error && current.state.data
        ? 10_000
        : nextAdventureRefetchDelay(current.state.data, current.state.dataUpdatedAt)
      : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: background,
    refetchOnReconnect: background,
    refetchOnMount: background ? current => !hasAdventureClockAnchor(current.state.data) ? 'always' : current.isStale() : false,
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
    void queryClient.invalidateQueries({ queryKey: ['adventure-income-7d', user?.id] });
    void queryClient.invalidateQueries({ queryKey: ['inventory', user?.id] });
  }, [background, query.dataUpdatedAt, hasRecordedWin, queryClient, user?.id]);

  useEffect(() => {
    if (!background || !hasRecordedBossWin) return;
    void queryClient.invalidateQueries({ queryKey: ['pet_catalog', user?.id] });
    void queryClient.invalidateQueries({ queryKey: ['boss_battles'] });
    void queryClient.invalidateQueries({ queryKey: ['crafting-state', user?.id] });
  }, [background, query.dataUpdatedAt, hasRecordedBossWin, queryClient, user?.id]);

  return {
    ...query,
    accountId: user?.id ?? null,
    summary: summaryQuery.data,
    acknowledgeSummary: () => queryClient.setQueryData(['auto-adventure-summary', user?.id], null),
  };
}

export function useAdvanceAutoAdventure() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  trackIdentity(queryClient, user?.id ?? null);
  return useMutation({
    onMutate: () => {
      const identity = identities.get(queryClient)!;
      return {
        ownerId: identity.ownerId,
        generation: identity.generation,
        cacheUpdatedAt: identity.ownerId
          ? queryClient.getQueryState(['auto-adventure', identity.ownerId])?.dataUpdatedAt ?? 0 : 0,
        cacheSnapshot: identity.ownerId
          ? queryClient.getQueryData(['auto-adventure', identity.ownerId]) : undefined,
      };
    },
    mutationFn: async ({ battleId }: { battleId: string }) => {
      const { data, error } = await supabase.rpc('advance_auto_adventure', {
        p_battle_id: battleId,
      });
      if (error) throw new Error(error.message);
      return anchorAdventureClock(parseAdventureSnapshot(data));
    },
    onSuccess: async (snapshot, _variables, context) => {
      const ownerId = context?.ownerId;
      const identity = identities.get(queryClient);
      if (!ownerId || ownerId !== identity?.ownerId || context.generation !== identity.generation ||
          (queryClient.getQueryState(['auto-adventure', ownerId])?.dataUpdatedAt ?? 0) > context.cacheUpdatedAt ||
          queryClient.getQueryData(['auto-adventure', ownerId]) !== context.cacheSnapshot) return;
      queryClient.setQueryData(['auto-adventure', ownerId], snapshot);
      recordSummary(queryClient, ownerId, snapshot);
      if (snapshot.catchup.gold > 0 || snapshot.catchup.items.length > 0) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['gold-balance', ownerId] }),
          queryClient.invalidateQueries({ queryKey: ['gold-history'] }),
          queryClient.invalidateQueries({ queryKey: ['adventure-income-7d', ownerId] }),
          queryClient.invalidateQueries({ queryKey: ['inventory', ownerId] }),
        ]);
      }
      if (snapshot.boss_wins_credited > 0) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['pet_catalog', ownerId] }),
          queryClient.invalidateQueries({ queryKey: ['boss_battles'] }),
          queryClient.invalidateQueries({ queryKey: ['crafting-state', ownerId] }),
        ]);
      }
    },
  });
}
