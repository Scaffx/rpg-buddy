import { useEffect } from 'react';
import { CancelledError, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { nextAdventureRefetchDelay, parseAdventureSnapshot } from '@/lib/autoAdventurePayload';
import type { AdventureSnapshot } from '@/lib/autoAdventurePayload';
export type { AdventureAttack, AdventureBattle, AdventureEncounter, AdventureSnapshot } from '@/lib/autoAdventurePayload';

type Catchup = AdventureSnapshot['catchup'];
type AdventureIdentity = { ownerId: string | null; authEpoch: number; sessionKey: string | null; cachedFailures: number; revalidate: boolean; hadCachedData: boolean };
const identities = new WeakMap<ReturnType<typeof useQueryClient>, AdventureIdentity>();
const revalidated = new WeakSet<AdventureIdentity>();

function confirmedSessionKey(token: string | undefined, ownerId: string | null): string | null {
  if (!token || !ownerId) return null;
  // Unbound confirmed sessions use their token as an in-memory cache marker, as AuthDataGate does.
  const fallback = JSON.stringify([ownerId, token]);
  try {
    const payload = token.split('.')[1];
    if (!payload) return fallback;
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
    const claims: unknown = JSON.parse(atob(padded));
    if (!claims || typeof claims !== 'object' || Array.isArray(claims)) return fallback;
    const { sub, iss, session_id } = claims as Record<string, unknown>;
    return sub === ownerId && typeof iss === 'string' && !!iss && typeof session_id === 'string' && !!session_id
      ? JSON.stringify([ownerId, iss, session_id]) : fallback;
  } catch { return fallback; }
}

function trackIdentity(queryClient: ReturnType<typeof useQueryClient>, ownerId: string | null, authEpoch: number, sessionKey: string | null) {
  const previous = identities.get(queryClient);
  if (previous?.ownerId === ownerId && previous.authEpoch === authEpoch && previous.sessionKey === sessionKey) return previous;
  const identity = { ownerId, authEpoch, sessionKey, cachedFailures: 0, revalidate: !!ownerId && !!previous?.ownerId,
    hadCachedData: !!ownerId && !!queryClient.getQueryData(['auto-adventure', ownerId]) };
  identities.set(queryClient, identity);
  return identity;
}

function cachedFailureDelay(failures: number) {
  return Math.min(120_000, 30_000 * 2 ** Math.min(Math.max(0, failures - 1), 2));
}

function remainingFailureDelay(failures: number, errorUpdatedAt: number) {
  const remaining = cachedFailureDelay(failures) - Math.max(0, Date.now() - errorUpdatedAt);
  // A past deadline gets a bounded interval if focus is lost or an RPC stays pending.
  return errorUpdatedAt && remaining > 0 ? remaining : 1_000;
}

function automaticRefetchAllowed(
  current: { state: { data: AdventureSnapshot | undefined; dataUpdatedAt: number; error: Error | null; errorUpdatedAt: number } },
  identity: AdventureIdentity,
) {
  if (current.state.error && current.state.data && identity.cachedFailures > 0)
    return Date.now() - current.state.errorUpdatedAt >= cachedFailureDelay(identity.cachedFailures);
  if (current.state.data?.catchup.pending)
    return Date.now() - current.state.dataUpdatedAt >= 2_000;
  return true;
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
  const { user, session, continuity } = useAuth();
  const queryClient = useQueryClient();
  // AuthProvider already confirmed this session with getUser(token); claims only separate cache generations.
  const identity = trackIdentity(queryClient, user?.id ?? null, continuity?.epoch ?? 0,
    confirmedSessionKey(session?.access_token, user?.id ?? null));
  const query = useQuery({
    queryKey: ['auto-adventure', user?.id],
    enabled: !!user,
    queryFn: async ({ signal }) => {
      // The RPC has no arguments; identity, time, battle and reward stay on the server.
      try {
        const request = supabase.rpc('sync_auto_adventure');
        request.abortSignal?.(signal);
        const { data, error } = await request;
        if (signal.aborted || identities.get(queryClient) !== identity) throw new CancelledError({ revert: true });
        if (error) throw new Error(error.message);
        const snapshot = parseAdventureSnapshot(data);
        identity.cachedFailures = 0;
        if (user?.id) recordSummary(queryClient, user.id, snapshot);
        return snapshot;
      } catch (error) {
        if (signal.aborted || identities.get(queryClient) !== identity) throw new CancelledError({ revert: true });
        if (!(error instanceof CancelledError) && queryClient.getQueryData(['auto-adventure', user?.id]))
          identity.cachedFailures++;
        throw error;
      }
    },
    staleTime: 10_000,
    refetchInterval: background
      ? current => current.state.fetchStatus !== 'idle' ? false
        : current.state.error && current.state.data
          ? remainingFailureDelay(Math.max(1, identity.cachedFailures), current.state.errorUpdatedAt)
          : nextAdventureRefetchDelay(current.state.data, current.state.dataUpdatedAt)
      : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: background ? current => automaticRefetchAllowed(current, identity) : false,
    refetchOnReconnect: background ? current => automaticRefetchAllowed(current, identity) : false,
    refetchOnMount: background ? current => (!identity.revalidate || revalidated.has(identity)) &&
      automaticRefetchAllowed(current, identity) && current.isStale() : false,
    retry: false,
  });
  useEffect(() => {
    if (!identity.revalidate || !user?.id || revalidated.has(identity)) return;
    revalidated.add(identity);
    if (!identity.hadCachedData) return;
    queryClient.setQueryData(['auto-adventure-summary', user.id], null);
    void queryClient.cancelQueries({ queryKey: ['auto-adventure', user.id], exact: true }).then(() =>
      identities.get(queryClient) === identity
        ? queryClient.invalidateQueries({ queryKey: ['auto-adventure', user.id], exact: true })
        : undefined);
  }, [identity, queryClient, user?.id]);
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
          queryClient.invalidateQueries({ queryKey: ['adventure-income-7d', user?.id] }),
          queryClient.invalidateQueries({ queryKey: ['inventory', user?.id] }),
        ]);
      }
      if (snapshot.boss_wins_credited > 0) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['pet_catalog', user?.id] }),
          queryClient.invalidateQueries({ queryKey: ['boss_battles'] }),
          queryClient.invalidateQueries({ queryKey: ['crafting-state', user?.id] }),
        ]);
      }
    },
  });
}
