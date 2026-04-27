import { useMemo, useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
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
import { useFailedDates } from '@/hooks/useMissionReports';
import { toast } from 'sonner';

const DAYS_MAP = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default function CalendarPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const { data: allMissions, isLoading } = useMissions();

  const selectedDateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : '';

  // Journal state
  const { data: journalEntry } = useJournalEntry(selectedDateStr);
  const saveJournal = useSaveJournalEntry();
  const journalDates = useJournalDates();
  const { data: failedDateStrs = [] } = useFailedDates(60);
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

  const failedDates = useMemo(
    () => failedDateStrs.map((d) => new Date(d + 'T12:00:00')).filter((d) => !isNaN(d.getTime())),
    [failedDateStrs],
  );

  const modifiers = {
    completed: completedDates,
    failed: failedDates,
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
    failed: {
      backgroundColor: 'hsl(0 75% 55% / 0.25)',
      color: 'hsl(0 75% 70%)',
      borderRadius: '50%',
      fontWeight: 'bold' as const,
      boxShadow: 'inset 0 0 0 1px hsl(0 75% 55% / 0.6)',
    },
    journaled: {
      outline: '2px solid hsl(217 91% 60% / 0.5)',
      borderRadius: '50%',
    },
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-end justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-display font-bold text-primary text-glow">
            {t('app.calendar.page_title')}
          </h1>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400/50" /> {t('app.calendar.legend_completions')}
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-destructive/60" /> {t('app.calendar.legend_failures')}
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full ring-2 ring-blue-500/50" /> {t('app.calendar.legend_journal')}
            </span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground -mt-3">
          <span className="text-foreground font-medium">Don't break the chain</span> — {t('app.calendar.chain_note')}
        </p>

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
                          <span className="rpg-badge bg-green-500/20 text-green-400 border-green-500/30">{t('app.calendar.badge_done')}</span>
                        ) : (
                          <span className="rpg-badge bg-yellow-500/20 text-yellow-400 border-yellow-500/30">{t('app.calendar.badge_pending')}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground rpg-card py-4 text-center">{t('app.calendar.missions_empty')}</p>
              )}

              {/* Diário de Aventura */}
              {selectedDate && (
                <div className="rpg-card space-y-3 mt-2">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-bold text-foreground">{t('app.calendar.journal_header')}</h3>
                    {journalEntry && <span className="text-[10px] text-emerald-400 font-semibold">{t('app.calendar.journal_saved_indicator')}</span>}
                  </div>

                  {/* Seletor de humor */}
                  <div className="flex gap-2 flex-wrap">
                    {([   
                      { mood: 'feliz',    emoji: '😄', label: t('app.calendar.mood_happy') },
                      { mood: 'motivado', emoji: '🔥', label: t('app.calendar.mood_motivated') },
                      { mood: 'neutro',   emoji: '😐', label: t('app.calendar.mood_neutral') },
                      { mood: 'cansado',  emoji: '😴', label: t('app.calendar.mood_tired') },
                      { mood: 'ansioso',  emoji: '😰', label: t('app.calendar.mood_anxious') },
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
                    placeholder={t('app.calendar.journal_placeholder')}
                    rows={4}
                    className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/50 outline-none resize-none"
                  />

                  <button
                    onClick={() => {
                      if (!journalText.trim()) { toast.error(t('app.calendar.toast_journal_empty')); return; }
                      saveJournal.mutate(
                        { dateStr: selectedDateStr, content: journalText.trim(), mood: journalMood },
                        {
                          onSuccess: () => toast.success(t('app.calendar.toast_journal_saved')),
                          onError: () => toast.error(t('app.calendar.toast_journal_error')),
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
                    {t('app.calendar.button_save_journal')}
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
