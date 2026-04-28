import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { MAX_FRIENDS, MAX_PENDING_REQUESTS } from '@/lib/constants';
import { getAttributeLevels, getPlayerCombatStats, type AttrLevels } from '@/lib/combat';

export type FriendRequest = {
  id: string;
  requester_id: string;
  receiver_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  /** Perfil do outro lado da amizade (preenchido pelo hook) */
  other_profile?: {
    user_id: string;
    display_name: string | null;
    level: number;
    starter_class: string | null;
    avatar_url: string | null;
  };
};

/** Lista de amigos aceitos do usuário atual. */
export function useFriends() {
  const { user } = useAuth();
  return useQuery<FriendRequest[]>({
    queryKey: ['friends', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('friend_requests' as any)
        .select('*')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${user!.id},receiver_id.eq.${user!.id}`)
        .order('updated_at', { ascending: false });
      if (error) throw error;

      const rows = ((data || []) as unknown) as FriendRequest[];
      const otherIds = rows.map((r) =>
        r.requester_id === user!.id ? r.receiver_id : r.requester_id,
      );

      if (otherIds.length === 0) return rows;

      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, level, starter_class, avatar_url')
        .in('user_id', otherIds);

      const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));

      return rows.map((r) => ({
        ...r,
        other_profile: profileMap.get(
          r.requester_id === user!.id ? r.receiver_id : r.requester_id,
        ) as FriendRequest['other_profile'],
      }));
    },
    staleTime: 30_000,
  });
}

/** Solicitações pendentes recebidas pelo usuário atual. */
export function usePendingRequests() {
  const { user } = useAuth();
  return useQuery<FriendRequest[]>({
    queryKey: ['friend_requests_pending', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('friend_requests' as any)
        .select('*')
        .eq('receiver_id', user!.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const rows = ((data || []) as unknown) as FriendRequest[];
      const requesterIds = rows.map((r) => r.requester_id);
      if (requesterIds.length === 0) return rows;

      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, level, starter_class, avatar_url')
        .in('user_id', requesterIds);

      const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));

      return rows.map((r) => ({
        ...r,
        other_profile: profileMap.get(r.requester_id) as FriendRequest['other_profile'],
      }));
    },
    staleTime: 15_000,
  });
}

/** Busca um perfil público por nome de exibição (para adicionar amigos). */
export function useSearchProfile(query: string) {
  const { user } = useAuth();
  return useQuery<Array<{ user_id: string; display_name: string; level: number; starter_class: string | null }>>({
    queryKey: ['profile_search', query],
    enabled: query.trim().length >= 2 && !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, display_name, level, starter_class')
        .ilike('display_name', `%${query.trim()}%`)
        .neq('user_id', user!.id)
        .limit(10);
      if (error) throw error;
      return (data || []) as any[];
    },
    staleTime: 10_000,
  });
}

/** Envia solicitação de amizade. */
export function useSendFriendRequest() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (receiverId: string) => {
      if (!user) throw new Error('Não autenticado');

      // Verifica limite de solicitações pendentes
      const { count } = await supabase
        .from('friend_requests' as any)
        .select('*', { count: 'exact', head: true })
        .eq('requester_id', user.id)
        .eq('status', 'pending');

      if ((count ?? 0) >= MAX_PENDING_REQUESTS) {
        throw new Error(`Limite de ${MAX_PENDING_REQUESTS} solicitações pendentes atingido.`);
      }

      // Verifica limite de amigos
      const { count: friendCount } = await supabase
        .from('friend_requests' as any)
        .select('*', { count: 'exact', head: true })
        .eq('status', 'accepted')
        .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`);

      if ((friendCount ?? 0) >= MAX_FRIENDS) {
        throw new Error(`Limite de ${MAX_FRIENDS} amigos atingido.`);
      }

      const { error } = await supabase
        .from('friend_requests' as any)
        .insert({ requester_id: user.id, receiver_id: receiverId } as any);
      if (error) {
        if (error.code === '23505') throw new Error('Solicitação já enviada ou vocês já são amigos.');
        throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['friends', user?.id] });
      qc.invalidateQueries({ queryKey: ['friend_requests_pending'] });
    },
  });
}

/** Aceita ou rejeita uma solicitação pendente. */
export function useRespondFriendRequest() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId, accept }: { requestId: string; accept: boolean }) => {
      const { error } = await supabase
        .from('friend_requests' as any)
        .update({ status: accept ? 'accepted' : 'rejected', updated_at: new Date().toISOString() } as any)
        .eq('id', requestId)
        .eq('receiver_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['friends', user?.id] });
      qc.invalidateQueries({ queryKey: ['friend_requests_pending', user?.id] });
    },
  });
}

/** Remove um amigo (desfaz a amizade aceita). */
export function useRemoveFriend() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase
        .from('friend_requests' as any)
        .delete()
        .eq('id', requestId)
        .or(`requester_id.eq.${user!.id},receiver_id.eq.${user!.id}`);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['friends', user?.id] });
    },
  });
}

// ============================================================
// Desafios entre amigos (rotina + batalha)
// ============================================================

export type FriendChallenge = {
  id: string;
  challenger_id: string;
  challenged_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'active' | 'completed' | 'expired';
  challenge_type: 'routine' | 'battle';
  title: string;
  description: string | null;
  duration_days: number | null;
  winner_id: string | null;
  challenger_completed: boolean;
  challenged_completed: boolean;
  battle_log: any | null;
  created_at: string;
  accepted_at: string | null;
  expires_at: string | null;
  completed_at: string | null;
  challenger_profile?: {
    user_id: string;
    display_name: string | null;
    level: number;
    starter_class: string | null;
  };
  challenged_profile?: {
    user_id: string;
    display_name: string | null;
    level: number;
    starter_class: string | null;
  };
};

export type BattleRound = {
  round: number;
  attacker_id: string;
  damage: number;
  is_crit: boolean;
  hp_a: number;
  hp_b: number;
};

export type BattleResult = {
  is_winner: boolean;
  winner_name: string;
  loser_name: string;
  total_rounds: number;
  rounds: BattleRound[];
};

type BattleHero = {
  user_id: string;
  display_name: string;
  hp: number;
  atk: number;
  matk: number;
  def: number;
  agi: number;
  crit: number;
};

function simulateBattle(
  heroA: BattleHero,
  heroB: BattleHero,
): { winner: BattleHero; loser: BattleHero; rounds: BattleRound[]; total_rounds: number } {
  let hpA = heroA.hp;
  let hpB = heroB.hp;
  const rounds: BattleRound[] = [];
  const MAX_ROUNDS = 30;

  for (let r = 1; r <= MAX_ROUNDS; r++) {
    // heroA attacks heroB
    const isCritA = Math.random() * 100 < heroA.crit;
    const rawA = Math.max(1, Math.max(heroA.atk, heroA.matk) - Math.floor(heroB.def / 2) + Math.floor(Math.random() * 12));
    const dmgA = isCritA ? Math.floor(rawA * 1.5) : rawA;
    hpB = Math.max(0, hpB - dmgA);
    rounds.push({ round: r, attacker_id: heroA.user_id, damage: dmgA, is_crit: isCritA, hp_a: hpA, hp_b: hpB });
    if (hpB <= 0) return { winner: heroA, loser: heroB, rounds, total_rounds: r };

    // heroB attacks heroA
    const isCritB = Math.random() * 100 < heroB.crit;
    const rawB = Math.max(1, Math.max(heroB.atk, heroB.matk) - Math.floor(heroA.def / 2) + Math.floor(Math.random() * 12));
    const dmgB = isCritB ? Math.floor(rawB * 1.5) : rawB;
    hpA = Math.max(0, hpA - dmgB);
    rounds.push({ round: r, attacker_id: heroB.user_id, damage: dmgB, is_crit: isCritB, hp_a: hpA, hp_b: hpB });
    if (hpA <= 0) return { winner: heroB, loser: heroA, rounds, total_rounds: r };
  }

  // Max rounds reached: more HP = winner
  return {
    winner: hpA >= hpB ? heroA : heroB,
    loser: hpA >= hpB ? heroB : heroA,
    rounds,
    total_rounds: MAX_ROUNDS,
  };
}

/** Desafios enviados e recebidos pelo usuário atual. */
export function useFriendChallenges() {
  const { user } = useAuth();
  return useQuery<FriendChallenge[]>({
    queryKey: ['friend_challenges', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('friend_challenges' as any)
        .select('*')
        .or(`challenger_id.eq.${user!.id},challenged_id.eq.${user!.id}`)
        .order('created_at', { ascending: false })
        .limit(60);
      if (error) throw error;

      const rows = ((data || []) as unknown) as FriendChallenge[];
      const allIds = [...new Set(rows.flatMap((r) => [r.challenger_id, r.challenged_id]))];
      if (allIds.length === 0) return rows;

      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, level, starter_class')
        .in('user_id', allIds);

      const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));

      return rows.map((r) => ({
        ...r,
        challenger_profile: profileMap.get(r.challenger_id),
        challenged_profile: profileMap.get(r.challenged_id),
      }));
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/** Envia um desafio de rotina para um amigo. */
export function useSendChallenge() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      challenged_id: string;
      title: string;
      description?: string;
      duration_days?: number;
    }) => {
      if (!user) throw new Error('Não autenticado');
      const { challenged_id, title, description, duration_days = 7 } = params;

      const expiresAt = new Date(Date.now() + duration_days * 24 * 60 * 60 * 1000).toISOString();

      const { error } = await supabase
        .from('friend_challenges' as any)
        .insert({
          challenger_id: user.id,
          challenged_id,
          challenge_type: 'routine',
          title,
          description: description || null,
          duration_days,
          status: 'pending',
          expires_at: expiresAt,
        } as any);

      if (error) {
        if (error.code === '23505') throw new Error('Você já desafiou essa pessoa recentemente.');
        throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['friend_challenges'] });
    },
  });
}

/** Aceita ou recusa um desafio de rotina recebido. */
export function useRespondChallenge() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ challengeId, accept }: { challengeId: string; accept: boolean }) => {
      if (!user) throw new Error('Não autenticado');
      const payload: any = { status: accept ? 'active' : 'declined' };
      if (accept) payload.accepted_at = new Date().toISOString();

      const { error } = await supabase
        .from('friend_challenges' as any)
        .update(payload)
        .eq('id', challengeId)
        .eq('challenged_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['friend_challenges'] });
    },
  });
}

/** Marca o próprio herói como concluinte no desafio de rotina. */
export function useMarkChallengeComplete() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (challengeId: string) => {
      if (!user) throw new Error('Não autenticado');

      const { data: row, error: fetchErr } = await supabase
        .from('friend_challenges' as any)
        .select('*')
        .eq('id', challengeId)
        .maybeSingle();

      if (fetchErr) throw fetchErr;
      if (!row) throw new Error('Desafio não encontrado');
      const c = row as any;

      const isChallenger = c.challenger_id === user.id;
      const isChallenged = c.challenged_id === user.id;
      if (!isChallenger && !isChallenged) throw new Error('Sem permissão');

      const nowStr = new Date().toISOString();
      const updates: any = {};
      if (isChallenger) updates.challenger_completed = true;
      if (isChallenged) updates.challenged_completed = true;

      // Verifica se ambos completaram
      const challengerDone = isChallenger ? true : c.challenger_completed;
      const challengedDone = isChallenged ? true : c.challenged_completed;

      if (challengerDone && challengedDone) {
        // Empate — ambos venceram
        updates.status = 'completed';
        updates.completed_at = nowStr;
        updates.winner_id = null;
      } else {
        // Primeiro a terminar ganha
        updates.status = 'completed';
        updates.completed_at = nowStr;
        updates.winner_id = user.id;
      }

      const { error } = await supabase
        .from('friend_challenges' as any)
        .update(updates)
        .eq('id', challengeId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['friend_challenges'] });
    },
  });
}

/** Executa uma batalha Hero vs Hero contra um amigo e salva o resultado. */
export function useHeroVsHeroBattle() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation<BattleResult, Error, { challenged_id: string; my_level: number; my_attrs: AttrLevels }>({
    mutationFn: async ({ challenged_id, my_level, my_attrs }) => {
      if (!user) throw new Error('Não autenticado');

      // Busca dados do oponente
      const [profileRes, attrRes, myProfileRes] = await Promise.all([
        supabase.from('profiles').select('user_id, display_name, level').eq('user_id', challenged_id).single(),
        supabase.from('attributes').select('name, level').eq('user_id', challenged_id),
        supabase.from('profiles').select('display_name').eq('user_id', user.id).single(),
      ]);

      if (profileRes.error) throw profileRes.error;
      const opponentProfile = profileRes.data as any;
      const opponentAttrs = getAttributeLevels((attrRes.data || []) as any[]);
      const myDisplayName = (myProfileRes.data as any)?.display_name || 'Herói';

      const myStats = getPlayerCombatStats(my_level, my_attrs);
      const opStats = getPlayerCombatStats(opponentProfile.level || 1, opponentAttrs);

      const heroA: BattleHero = {
        user_id: user.id,
        display_name: myDisplayName,
        hp: myStats.hp,
        atk: myStats.atk,
        matk: myStats.matk,
        def: myStats.def,
        agi: myStats.agi,
        crit: myStats.crit,
      };
      const heroB: BattleHero = {
        user_id: challenged_id,
        display_name: opponentProfile.display_name || 'Herói',
        hp: opStats.hp,
        atk: opStats.atk,
        matk: opStats.matk,
        def: opStats.def,
        agi: opStats.agi,
        crit: opStats.crit,
      };

      const result = simulateBattle(heroA, heroB);

      // Salva o resultado como desafio concluído
      const { error } = await supabase
        .from('friend_challenges' as any)
        .insert({
          challenger_id: user.id,
          challenged_id,
          challenge_type: 'battle',
          title: `⚔️ ${heroA.display_name} vs ${heroB.display_name}`,
          status: 'completed',
          winner_id: result.winner.user_id,
          challenger_completed: true,
          challenged_completed: true,
          battle_log: {
            rounds: result.rounds,
            total_rounds: result.total_rounds,
            hero_a: { ...heroA, stats: myStats },
            hero_b: { ...heroB, stats: opStats },
          },
          completed_at: new Date().toISOString(),
        } as any);

      if (error) throw error;

      return {
        is_winner: result.winner.user_id === user.id,
        winner_name: result.winner.display_name,
        loser_name: result.loser.display_name,
        total_rounds: result.total_rounds,
        rounds: result.rounds,
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['friend_challenges'] });
    },
  });
}

/** Retorna estatísticas de vitórias/derrotas do usuário atual contra um amigo específico. */
export function getFriendStats(myId: string | undefined, friendId: string | undefined, challenges: FriendChallenge[]) {
  if (!myId || !friendId) return { wins: 0, losses: 0, draws: 0 };

  const relevant = challenges.filter(
    (c) =>
      c.status === 'completed' &&
      ((c.challenger_id === friendId && c.challenged_id === myId) ||
       (c.challenged_id === friendId && c.challenger_id === myId)),
  );

  let wins = 0;
  let losses = 0;
  let draws = 0;

  for (const c of relevant) {
    if (c.winner_id === null) {
      draws++;
    } else if (c.winner_id === myId) {
      wins++;
    } else {
      losses++;
    }
  }

  return { wins, losses, draws };
}
