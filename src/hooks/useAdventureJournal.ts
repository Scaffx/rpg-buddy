import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { today } from '@/lib/dateUtils';

export type JournalEntry = {
  id: string;
  user_id: string;
  entry_date: string;
  content: string;
  mood: 'feliz' | 'neutro' | 'cansado' | 'motivado' | 'ansioso';
  created_at: string;
  updated_at: string;
};

export type JournalMood = JournalEntry['mood'];

/** Carrega todas as entradas do diário do usuário (últimas 90). */
export function useJournalEntries() {
  const { user } = useAuth();
  return useQuery<JournalEntry[]>({
    queryKey: ['adventure_journal', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('adventure_journal' as any)
        .select('*')
        .eq('user_id', user!.id)
        .order('entry_date', { ascending: false })
        .limit(90);
      if (error) throw error;
      return (data || []) as JournalEntry[];
    },
    staleTime: 30_000,
  });
}

/** Carrega (ou cria) a entrada do diário de uma data específica. */
export function useJournalEntry(dateStr: string) {
  const { user } = useAuth();
  return useQuery<JournalEntry | null>({
    queryKey: ['adventure_journal_entry', user?.id, dateStr],
    enabled: !!user && !!dateStr,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('adventure_journal' as any)
        .select('*')
        .eq('user_id', user!.id)
        .eq('entry_date', dateStr)
        .maybeSingle();
      if (error) throw error;
      return (data as JournalEntry) || null;
    },
    staleTime: 10_000,
  });
}

/** Salva (upsert) uma entrada do diário. */
export function useSaveJournalEntry() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      dateStr,
      content,
      mood,
    }: {
      dateStr: string;
      content: string;
      mood: JournalMood;
    }) => {
      if (!user) throw new Error('Não autenticado');

      const payload = {
        user_id:    user.id,
        entry_date: dateStr,
        content,
        mood,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('adventure_journal' as any)
        .upsert(payload as any, { onConflict: 'user_id,entry_date' });
      if (error) throw error;
    },
    onSuccess: (_data, { dateStr }) => {
      qc.invalidateQueries({ queryKey: ['adventure_journal', user?.id] });
      qc.invalidateQueries({ queryKey: ['adventure_journal_entry', user?.id, dateStr] });
    },
  });
}

/** Retorna set de datas (YYYY-MM-DD) que têm entradas de diário. */
export function useJournalDates() {
  const { data: entries } = useJournalEntries();
  return new Set((entries || []).map((e) => e.entry_date));
}

/** Total de entradas únicas do usuário (para achievements). */
export function useJournalCount() {
  const { user } = useAuth();
  return useQuery<number>({
    queryKey: ['adventure_journal_count', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('adventure_journal' as any)
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user!.id);
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 60_000,
  });
}
