import { useEffect } from 'react';
import { CancelledError, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { nextAdventureRefetchDelay, parseAdventureSnapshot } from '@/lib/autoAdventurePayload';
import type { AdventureSnapshot } from '@/lib/autoAdventurePayload';
import { anchorAdventureClock, hasAdventureClockAnchor } from '@/lib/adventureClock';
export type { AdventureAttack, AdventureBattle, AdventureEncounter, AdventureSnapshot } from '@/lib/autoAdventurePayload';

type Catchup = AdventureSnapshot['catchup'];
type AdventureIdentity = { ownerId: string | null; authEpoch: number; generation: number; revalidate: boolean };
const identities = new WeakMap<ReturnType<typeof useQueryClient>, AdventureIdentity>();
const revalidatedGenerations = new WeakMap<ReturnType<typeof useQueryClient>, number>();
const summarizedSnapshots = new WeakSet<AdventureSnapshot>();

function trackIdentity(queryClient: ReturnType<typeof useQueryClient>, ownerId: string | null, authEpoch: number): AdventureIdentity {
  const previous = identities.get(queryClient);
  if (previous?.ownerId === ownerId && previous.authEpoch === authEpoch) return previous;
  const current = { ownerId, authEpoch, generation: (previous?.generation ?? 0) + 1,
    revalidate: !!ownerId && !!previous?.ownerId };
  identities.set(queryClient, current);
  return current;
}

function recordSummary(queryClient: ReturnType<typeof useQueryClient>, userId: string, snapshot: AdventureSnapshot) {
  if (summarizedSnapshots.has(snapshot) || queryClient.getQueryData(['auto-adventure', userId]) !== snapshot) return;
  summarizedSnapshots.add(snapshot);
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
  const { user, continuity } = useAuth();
  const queryClient = useQueryClient();
  const identity = trackIdentity(queryClient, user?.id ?? null, continuity?.epoch ?? 0);
  useEffect(() => queryClient.getQueryCache().subscribe(event => {
    if (event.type !== 'updated' || event.action.type !== 'success') return;
    const [kind, ownerId] = event.query.queryKey;
    const snapshot = event.query.state.data as AdventureSnapshot | undefined;
    if (kind === 'auto-adventure' && ownerId === identity.ownerId &&
        identities.get(queryClient) === identity && snapshot && hasAdventureClockAnchor(snapshot)) {
      recordSummary(queryClient, ownerId as string, snapshot);
    }
  }), [identity, queryClient]);
  const query = useQuery({
    queryKey: ['auto-adventure', user?.id],
    enabled: !!user,
    queryFn: async ({ signal }) => {
      // The RPC has no arguments; identity, time, battle and reward stay on the server.
      const key = ['auto-adventure', user?.id];
      const before = queryClient.getQueryState<AdventureSnapshot>(key);
      const request = supabase.rpc('sync_auto_adventure');
      request.abortSignal?.(signal);
      const { data, error } = await request;
      if (signal.aborted) throw new CancelledError({ revert: true });
      const accepted = queryClient.getQueryData<AdventureSnapshot>(key);
      if (identities.get(queryClient) !== identity) {
        if (accepted) return accepted;
        throw new CancelledError({ revert: true });
      }
      if (error) throw new Error(error.message);
      const snapshot = anchorAdventureClock(parseAdventureSnapshot(data));
      const current = queryClient.getQueryData<AdventureSnapshot>(key);
      const currentState = queryClient.getQueryState<AdventureSnapshot>(key);
      const identityChanged = identities.get(queryClient) !== identity;
      const cacheChanged = current !== before?.data || currentState?.dataUpdatedAt !== before?.dataUpdatedAt;
      const olderServerTime = !!current && Date.parse(snapshot.server_now) < Date.parse(current.server_now);
      // Returning the accepted cache keeps QueryObserver out of an error state and
      // cannot let this network response replace a newer snapshot.
      if ((identityChanged || cacheChanged || olderServerTime) && current) return current;
      if (identityChanged || cacheChanged) throw new CancelledError({ revert: true });
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
    refetchOnMount: background ? current => identity.revalidate &&
      revalidatedGenerations.get(queryClient) !== identity.generation && current.state.data
      ? false : !hasAdventureClockAnchor(current.state.data) ? 'always' : current.isStale() : false,
    retry: false,
  });
  useEffect(() => {
    if (!identity.revalidate || !identity.ownerId ||
        revalidatedGenerations.get(queryClient) === identity.generation) return;
    revalidatedGenerations.set(queryClient, identity.generation);
    // The boundary remounts on a new confirmed auth generation, so a hook-local
    // previous identity cannot detect it. Keep the stage visible while it refetches.
    queryClient.setQueryData(['auto-adventure-summary', identity.ownerId], null);
    if (!queryClient.getQueryData(['auto-adventure', identity.ownerId])) return;
    void queryClient.cancelQueries({ queryKey: ['auto-adventure', identity.ownerId], exact: true })
      .then(() => identities.get(queryClient) === identity
        ? queryClient.invalidateQueries({ queryKey: ['auto-adventure', identity.ownerId], exact: true })
        : undefined);
  }, [identity, queryClient]);
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
  const { user, continuity } = useAuth();
  const queryClient = useQueryClient();
  trackIdentity(queryClient, user?.id ?? null, continuity?.epoch ?? 0);
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
