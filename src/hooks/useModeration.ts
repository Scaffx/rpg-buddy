import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

/**
 * Bloqueio e denúncia — exigências da Google Play para app com conteúdo
 * trocado entre usuários. O bloqueio é silencioso: quem foi bloqueado não
 * recebe aviso nem consegue ler a linha (a RLS de blocked_users só enxerga
 * o próprio blocker_id).
 */

export const REPORT_REASONS = [
  { value: 'spam', label: 'Spam ou propaganda' },
  { value: 'assedio', label: 'Assédio ou perseguição' },
  { value: 'conteudo_improprio', label: 'Conteúdo impróprio' },
  { value: 'discurso_de_odio', label: 'Discurso de ódio' },
  { value: 'outro', label: 'Outro motivo' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['value'];

/** IDs que o usuário atual bloqueou. */
export function useBlockedUsers() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['blocked_users', user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('blocked_users' as any)
        .select('blocked_id, created_at')
        .eq('blocker_id', user!.id);
      if (error) throw error;
      return (data ?? []) as unknown as { blocked_id: string; created_at: string }[];
    },
  });
}

export function useIsBlocked(otherUserId: string | null | undefined) {
  const { data = [] } = useBlockedUsers();
  return !!otherUserId && data.some((b) => b.blocked_id === otherUserId);
}

export function useBlockUser() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (blockedId: string) => {
      const { error } = await supabase
        .from('blocked_users' as any)
        .insert({ blocker_id: user!.id, blocked_id: blockedId });
      if (error) throw error;
    },
    onSuccess: () => {
      // A conversa some pela RLS, então tudo que a lista tocava precisa refazer.
      qc.invalidateQueries({ queryKey: ['blocked_users', user?.id] });
      qc.invalidateQueries({ queryKey: ['direct_messages'] });
      qc.invalidateQueries({ queryKey: ['unread_counts'] });
      qc.invalidateQueries({ queryKey: ['friends'] });
    },
  });
}

export function useUnblockUser() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (blockedId: string) => {
      const { error } = await supabase
        .from('blocked_users' as any)
        .delete()
        .eq('blocker_id', user!.id)
        .eq('blocked_id', blockedId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['blocked_users', user?.id] });
      qc.invalidateQueries({ queryKey: ['direct_messages'] });
      qc.invalidateQueries({ queryKey: ['unread_counts'] });
      qc.invalidateQueries({ queryKey: ['friends'] });
    },
  });
}

export function useReportUser() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: {
      reportedUserId: string;
      reason: ReportReason;
      details?: string;
      messageId?: string | null;
    }) => {
      const { error } = await supabase.from('content_reports' as any).insert({
        reporter_id: user!.id,
        reported_user_id: input.reportedUserId,
        reason: input.reason,
        details: input.details?.trim() || null,
        message_id: input.messageId ?? null,
      });
      if (error) throw error;
    },
  });
}
