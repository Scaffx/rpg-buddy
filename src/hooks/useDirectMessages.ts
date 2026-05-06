import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type DirectMessage = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  read_at: string | null;
  created_at: string;
};

/**
 * Lista as mensagens trocadas entre o usuário atual e o outro lado,
 * ordenadas cronologicamente. Subscribe via Supabase Realtime para
 * atualizar a thread quando chega mensagem nova.
 */
export function useDirectMessages(otherUserId: string | null) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery<DirectMessage[]>({
    queryKey: ['direct_messages', user?.id, otherUserId],
    enabled: !!user && !!otherUserId,
    staleTime: 5_000,
    queryFn: async () => {
      const me = user!.id;
      const other = otherUserId!;
      const { data, error } = await supabase
        .from('direct_messages' as any)
        .select('*')
        .or(
          `and(sender_id.eq.${me},receiver_id.eq.${other}),and(sender_id.eq.${other},receiver_id.eq.${me})`,
        )
        .order('created_at', { ascending: true })
        .limit(500);
      if (error) throw error;
      return ((data || []) as unknown) as DirectMessage[];
    },
  });

  // Realtime subscription — refetch silencioso quando nova mensagem chega ou
  // alguma é atualizada (read_at).
  useEffect(() => {
    if (!user || !otherUserId) return;

    const channel = supabase
      .channel(`dm_${user.id}_${otherUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'direct_messages',
        },
        (payload: any) => {
          const row = payload.new || payload.old;
          if (!row) return;
          const involvesPair =
            (row.sender_id === user.id && row.receiver_id === otherUserId) ||
            (row.sender_id === otherUserId && row.receiver_id === user.id);
          if (involvesPair) {
            qc.invalidateQueries({ queryKey: ['direct_messages', user.id, otherUserId] });
            qc.invalidateQueries({ queryKey: ['unread_counts', user.id] });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, otherUserId, qc]);

  return query;
}

/** Envia uma mensagem para um amigo. RLS exige amizade aceita. */
export function useSendDirectMessage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ receiverId, content }: { receiverId: string; content: string }) => {
      if (!user) throw new Error('Não autenticado');
      const trimmed = content.trim();
      if (!trimmed) throw new Error('Mensagem vazia');
      if (trimmed.length > 1000) throw new Error('Mensagem muito longa (máx 1000 caracteres)');

      const { error } = await supabase
        .from('direct_messages' as any)
        .insert({
          sender_id: user.id,
          receiver_id: receiverId,
          content: trimmed,
        } as any);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['direct_messages', user?.id, variables.receiverId] });
    },
  });
}

/**
 * Marca como lidas todas as mensagens de um determinado remetente
 * para o usuário atual. Chamada quando o usuário abre o chat.
 */
export function useMarkConversationRead() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (otherUserId: string) => {
      if (!user) throw new Error('Não autenticado');
      const { error } = await supabase
        .from('direct_messages' as any)
        .update({ read_at: new Date().toISOString() } as any)
        .eq('receiver_id', user.id)
        .eq('sender_id', otherUserId)
        .is('read_at', null);
      if (error) throw error;
    },
    onSuccess: (_data, otherUserId) => {
      qc.invalidateQueries({ queryKey: ['direct_messages', user?.id, otherUserId] });
      qc.invalidateQueries({ queryKey: ['unread_counts', user?.id] });
    },
  });
}

/** Mapa de unread count por sender_id — alimenta os badges na lista de amigos. */
export function useUnreadCounts() {
  const { user } = useAuth();
  return useQuery<Record<string, number>>({
    queryKey: ['unread_counts', user?.id],
    enabled: !!user,
    staleTime: 10_000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('get_unread_counts_by_sender');
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const row of (data || []) as Array<{ sender_id: string; unread: number }>) {
        map[row.sender_id] = Number(row.unread);
      }
      return map;
    },
  });
}
