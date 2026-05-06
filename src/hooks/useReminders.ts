import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type Reminder = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  remind_at: string;
  notified_at: string | null;
  dismissed_at: string | null;
  created_at: string;
};

/** Lista todos os lembretes do usuário ordenados por horário. */
export function useReminders() {
  const { user } = useAuth();
  return useQuery<Reminder[]>({
    queryKey: ['reminders', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reminders' as any)
        .select('*')
        .eq('user_id', user!.id)
        .order('remind_at', { ascending: true });
      if (error) throw error;
      return ((data || []) as unknown) as Reminder[];
    },
    staleTime: 30_000,
  });
}

export function useCreateReminder() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { title: string; description?: string; remind_at: string }) => {
      if (!user) throw new Error('Não autenticado');
      const { data, error } = await supabase
        .from('reminders' as any)
        .insert({
          user_id: user.id,
          title: input.title,
          description: input.description || null,
          remind_at: input.remind_at,
        } as any)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reminders', user?.id] }),
  });
}

export function useDismissReminder() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('reminders' as any)
        .update({ dismissed_at: new Date().toISOString() } as any)
        .eq('id', id)
        .eq('user_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reminders', user?.id] }),
  });
}

export function useDeleteReminder() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('reminders' as any)
        .delete()
        .eq('id', id)
        .eq('user_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reminders', user?.id] }),
  });
}

/**
 * Hook auxiliar — chama isto uma vez no AppLayout (ou qualquer componente
 * que monte cedo) para que o usuário receba toasts assim que um lembrete
 * vencer, mesmo se ele não está com a aba do Painel aberta.
 *
 * Faz polling local + marca notified_at no banco para não tocar duas vezes.
 */
export function useReminderNotifications() {
  const { user } = useAuth();
  const { data: reminders = [] } = useReminders();
  const qc = useQueryClient();
  const firedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;

    const tick = async () => {
      const now = Date.now();
      for (const r of reminders) {
        if (r.dismissed_at || r.notified_at) continue;
        if (firedRef.current.has(r.id)) continue;
        const due = new Date(r.remind_at).getTime();
        if (due <= now) {
          firedRef.current.add(r.id);
          toast(`⏰ ${r.title}`, {
            description: r.description ?? undefined,
            duration: 8000,
          });
          // marca como notificado para não disparar de novo em outras sessões
          try {
            await supabase
              .from('reminders' as any)
              .update({ notified_at: new Date().toISOString() } as any)
              .eq('id', r.id)
              .eq('user_id', user.id);
            qc.invalidateQueries({ queryKey: ['reminders', user.id] });
          } catch {
            /* silencioso — toast já foi mostrado */
          }
        }
      }
    };

    tick();
    const handle = window.setInterval(tick, 30_000);
    return () => window.clearInterval(handle);
  }, [user, reminders, qc]);
}
