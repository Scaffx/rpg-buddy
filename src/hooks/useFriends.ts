import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { MAX_FRIENDS, MAX_PENDING_REQUESTS } from '@/lib/constants';

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
