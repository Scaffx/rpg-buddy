import { useMemo, useState, useEffect, useRef } from 'react';
import { useMissions } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';
import AppLayout from '@/components/AppLayout';
import { Calendar } from '@/components/ui/calendar';
import { Loader2, BookOpen, Save } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useJournalEntry, useSaveJournalEntry, useJournalDates, type JournalMood } from '@/hooks/useAdventureJournal';
import { toast } from 'sonner';

const DAYS_MAP = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default function CalendarPage() {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const { data: allMissions, isLoading } = useMissions();

  const selectedDateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : '';

  // Journal state
  const { data: journalEntry } = useJournalEntry(selectedDateStr);
  const saveJournal = useSaveJournalEntry();
  const journalDates = useJournalDates();
  const [journalText, setJournalText] = useState('');
  const [journalMood, setJournalMood] = useState<JournalMood>('neutro');
  const journalInitialized = useRef('');

  // Sync journal text when entry loads or date changes
  useEffect(() => {
    if (journalInitialized.current === selectedDateStr) return;
    journalInitialized.current = selectedDateStr;
    setJournalText(journalEntry?.content ?? '');
    setJournalMood(journalEntry?.mood ?? 'neutro');
  }, [journalEntry, selectedDateStr]);

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date);
    journalInitialized.current = ''; // force re-sync on next render
  };
  
  // Fetch completions for today's missions
  const { data: completions = [] } = useQuery({
    queryKey: ['mission_completions', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('mission_daily_completions' as any)
        .select('mission_id, completion_date')
        .eq('user_id', user.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const completedDates = useMemo(() => {
    if (!completions) return [];
    return completions
      .map((c: any) => new Date(c.completion_date))
      .filter((d) => !isNaN(d.getTime()));
  }, [completions]);

  const missionsForDate = useMemo(() => {
    if (!allMissions || !selectedDate) return [];
    
    const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
    const dayIndex = selectedDate.getDay();
    const dayName = DAYS_MAP[dayIndex];
    
    // Get all missions that apply to this day of week
    const missionsOnThisDay = allMissions.filter((m: any) => {
      const days: string[] = m.days_of_week || [];
      // Diárias com dias específicos
      if (days.length > 0 && days.includes(dayName)) {
        return true;
      }
      return false;
    });

    // Add completion status from completions table
    return missionsOnThisDay.map((m: any) => {
      const isCompletedOnDate = completions.some((c: any) => 
        c.mission_id === m.id && c.completion_date === selectedDateStr
      );
      return {
        ...m,
        completedOnDate: isCompletedOnDate,
      };
    });
  }, [allMissions, selectedDate, completions]);

  const modifiers = {
    completed: completedDates,
    journaled: [...journalDates]
      .map((d) => new Date(d + 'T12:00:00'))
      .filter((d) => !isNaN(d.getTime())),
  };

  const modifiersStyles = {
    completed: {
      backgroundColor: 'hsl(43 96% 56% / 0.2)',
      borderRadius: '50%',
      color: 'hsl(43 96% 56%)',
      fontWeight: 'bold' as const,
    },
    journaled: {
      outline: '2px solid hsl(217 91% 60% / 0.5)',
      borderRadius: '50%',
    },
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-display font-bold text-primary text-glow">
          📅 Calendário
        </h1>

        {isLoading ? (
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="rpg-card flex justify-center">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={handleDateSelect}
                locale={ptBR}
                modifiers={modifiers}
                modifiersStyles={modifiersStyles}
                className="pointer-events-auto"
              />
            </div>
            <div className="space-y-3">
              <h2 className="font-display font-semibold text-foreground">
                {selectedDate
                  ? format(selectedDate, "dd 'de' MMMM", { locale: ptBR })
                  : 'Selecione um dia'}
              </h2>
              {missionsForDate.length > 0 ? (
                <div className="space-y-2">
                  {missionsForDate.map((m: any) => (
                    <div key={m.id} className="rpg-card">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-foreground flex-1">{m.title}</span>
                        {m.completedOnDate ? (
                          <span className="rpg-badge bg-green-500/20 text-green-400 border-green-500/30">✅ Feita</span>
                        ) : (
                          <span className="rpg-badge bg-yellow-500/20 text-yellow-400 border-yellow-500/30">⏳ Pendente</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground rpg-card py-4 text-center">Nenhuma missão neste dia.</p>
              )}

              {/* Diário de Aventura */}
              {selectedDate && (
                <div className="rpg-card space-y-3 mt-2">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-bold text-foreground">Diário de Aventura</h3>
                    {journalEntry && <span className="text-[10px] text-emerald-400 font-semibold">✓ Salvo</span>}
                  </div>

                  {/* Seletor de humor */}
                  <div className="flex gap-2 flex-wrap">
                    {([
                      { mood: 'feliz',    emoji: '😄', label: 'Feliz' },
                      { mood: 'motivado', emoji: '🔥', label: 'Motivado' },
                      { mood: 'neutro',   emoji: '😐', label: 'Neutro' },
                      { mood: 'cansado',  emoji: '😴', label: 'Cansado' },
                      { mood: 'ansioso',  emoji: '😰', label: 'Ansioso' },
                    ] as { mood: JournalMood; emoji: string; label: string }[]).map(({ mood, emoji, label }) => (
                      <button
                        key={mood}
                        onClick={() => setJournalMood(mood)}
                        title={label}
                        className={`flex items-center gap-1 px-2 py-1 rounded-full border text-xs font-medium transition-all ${
                          journalMood === mood
                            ? 'border-primary bg-primary/20 text-primary'
                            : 'border-border text-muted-foreground hover:border-primary/50'
                        }`}
                      >
                        {emoji} {label}
                      </button>
                    ))}
                  </div>

                  <textarea
                    value={journalText}
                    onChange={(e) => setJournalText(e.target.value)}
                    placeholder="Escreva sobre sua jornada hoje... O que você conquistou? Como se sentiu?"
                    rows={4}
                    className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/50 outline-none resize-none"
                  />

                  <button
                    onClick={() => {
                      if (!journalText.trim()) { toast.error('Escreva algo antes de salvar.'); return; }
                      saveJournal.mutate(
                        { dateStr: selectedDateStr, content: journalText.trim(), mood: journalMood },
                        {
                          onSuccess: () => toast.success('Diário salvo! 📖'),
                          onError: () => toast.error('Erro ao salvar diário.'),
                        },
                      );
                    }}
                    disabled={saveJournal.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-primary/20 text-primary border border-primary/30 rounded-lg text-sm font-semibold hover:bg-primary/30 transition-colors disabled:opacity-50"
                  >
                    {saveJournal.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    Salvar Diário
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
