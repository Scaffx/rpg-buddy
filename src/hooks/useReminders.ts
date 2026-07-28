import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  findNextWeeklyReminderOccurrence,
  type ReminderRecurrenceType,
} from '@/lib/reminders';

export type Reminder = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  remind_at: string;
  recurrence_type: ReminderRecurrenceType;
  days_of_week: number[];
  starts_on: string | null;
  ends_on: string | null;
  remind_time: string | null;
  timezone: string;
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
        .from('reminders')
        .select('*')
        .eq('user_id', user!.id)
        .is('dismissed_at', null)
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
    mutationFn: async (input: {
      title: string;
      description?: string;
      remind_at: string;
      recurrence_type: ReminderRecurrenceType;
      days_of_week?: number[];
      starts_on?: string;
      ends_on?: string;
      remind_time?: string;
      timezone?: string;
    }) => {
      if (!user) throw new Error('Não autenticado');
      const { data, error } = await supabase
        .from('reminders')
        .insert({
          user_id: user.id,
          title: input.title,
          description: input.description || null,
          remind_at: input.remind_at,
          recurrence_type: input.recurrence_type,
          days_of_week: input.days_of_week || [],
          starts_on: input.starts_on || null,
          ends_on: input.ends_on || null,
          remind_time: input.remind_time || null,
          timezone: input.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        })
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
        .from('reminders')
        .update({ dismissed_at: new Date().toISOString() })
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
        .from('reminders')
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
        if (r.dismissed_at) continue;
        if (r.recurrence_type === 'once' && r.notified_at) continue;
        const occurrenceKey = `${r.id}:${r.remind_at}`;
        if (firedRef.current.has(occurrenceKey)) continue;
        const due = new Date(r.remind_at).getTime();
        if (due <= now) {
          const notifiedAt = new Date().toISOString();
          let update: Record<string, string | null> = { notified_at: notifiedAt };

          if (
            r.recurrence_type === 'weekly'
            && r.starts_on
            && r.ends_on
            && r.remind_time
          ) {
            const next = findNextWeeklyReminderOccurrence({
              daysOfWeek: r.days_of_week,
              startDate: r.starts_on,
              endDate: r.ends_on,
              time: r.remind_time,
            }, new Date(r.remind_at));

            update = next
              ? { notified_at: notifiedAt, remind_at: next.toISOString() }
              : { notified_at: notifiedAt, dismissed_at: notifiedAt };
          }

          // Primeiro reivindica esta ocorrência no banco. Assim, duas abas ou
          // dispositivos não exibem o mesmo lembrete ao mesmo tempo.
          try {
            let claim = supabase
              .from('reminders')
              .update(update)
              .eq('id', r.id)
              .eq('user_id', user.id)
              .eq('remind_at', r.remind_at)
              .is('dismissed_at', null);

            if (r.recurrence_type === 'once') {
              claim = claim.is('notified_at', null);
            }

            const { data, error } = await claim.select('id').maybeSingle();
            if (error) throw error;
            if (!data) continue;

            firedRef.current.add(occurrenceKey);
            toast(`⏰ ${r.title}`, {
              description: r.description ?? undefined,
              duration: 8000,
            });
            qc.invalidateQueries({ queryKey: ['reminders', user.id] });
          } catch {
            /* silencioso — o polling tenta novamente se a falha for transitória */
          }
        }
      }
    };

    tick();
    const handle = window.setInterval(tick, 30_000);
    return () => window.clearInterval(handle);
  }, [user, reminders, qc]);
}
