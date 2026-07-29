import { useMemo, useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useMissions } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';
import AppLayout from '@/components/AppLayout';
import TranslatedGuidedTour from '@/components/TranslatedGuidedTour';
import { Calendar } from '@/components/ui/calendar';
import { Loader2, BookOpen, Save, CheckCircle2, Clock3, Sparkles, CircleAlert, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useJournalEntry, useSaveJournalEntry, useJournalDates, type JournalMood } from '@/hooks/useAdventureJournal';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router-dom';
import { parseLocalDate, today } from '@/lib/dateUtils';
import {
  getCalendarDayPerformance,
  getCalendarMissionDayState,
  isMissionScheduledForDate,
  type CalendarCompletionLike,
  type CalendarMissionDayState,
  type CalendarMissionLike,
} from '@/lib/calendarMissions';

type CalendarMissionView = CalendarMissionLike & {
  title: string;
  calendarState: CalendarMissionDayState;
};

export default function CalendarPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const requestedDate = searchParams.get('date');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(() =>
    requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
      ? parseLocalDate(requestedDate)
      : new Date(),
  );
  const { data: allMissions, isLoading } = useMissions();
  const todayStr = today();

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
  
  // Fetch the completion history used by the calendar.
  const { data: completions = [] } = useQuery({
    queryKey: ['mission_completions', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('mission_daily_completions')
        .select('mission_id, completion_date')
        .eq('user_id', user.id);
      if (error) throw error;
      return (data || []) as CalendarCompletionLike[];
    },
    enabled: !!user,
  });

  const missionsForDate = useMemo<CalendarMissionView[]>(() => {
    if (!allMissions || !selectedDate) return [];

    return (allMissions as Array<CalendarMissionLike & { title: string }>)
      .filter((mission) => isMissionScheduledForDate(mission, selectedDate))
      .map((mission) => ({
        ...mission,
        calendarState: getCalendarMissionDayState(
          mission,
          selectedDate,
          completions,
          todayStr,
        ),
      }));
  }, [allMissions, completions, selectedDate, todayStr]);

  const performanceDates = useMemo(() => {
    const grouped = {
      perfect: [] as Date[],
      onTrack: [] as Date[],
      attention: [] as Date[],
    };
    const missions = (allMissions || []) as CalendarMissionLike[];

    for (let offset = 90; offset >= 0; offset--) {
      const date = new Date();
      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() - offset);
      const performance = getCalendarDayPerformance(missions, date, completions, todayStr);
      if (performance?.tier === 'perfect') grouped.perfect.push(date);
      else if (performance?.tier === 'on_track') grouped.onTrack.push(date);
      else if (performance?.tier === 'attention') grouped.attention.push(date);
    }

    return grouped;
  }, [allMissions, completions, todayStr]);

  const selectedPerformance = useMemo(() => {
    if (!selectedDate) return null;
    return getCalendarDayPerformance(
      (allMissions || []) as CalendarMissionLike[],
      selectedDate,
      completions,
      todayStr,
    );
  }, [allMissions, completions, selectedDate, todayStr]);

  const modifiers = {
    perfect: performanceDates.perfect,
    onTrack: performanceDates.onTrack,
    attention: performanceDates.attention,
    journaled: [...journalDates]
      .map((d) => new Date(d + 'T12:00:00'))
      .filter((d) => !isNaN(d.getTime())),
  };

  const modifiersClassNames = {
    perfect: 'bg-emerald-500/25 text-emerald-300 font-bold rounded-full',
    onTrack: 'bg-amber-500/25 text-amber-300 font-bold rounded-full',
    attention: 'bg-red-500/20 text-red-300 font-bold rounded-full',
    journaled: 'ring-2 ring-sky-500/60 ring-offset-1 ring-offset-background rounded-full',
  };

  const missionStateMeta = (state: CalendarMissionDayState) => {
    const meta = {
      completed: { label: t('app.calendar.badge_done'), icon: CheckCircle2, className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
      recovered: { label: t('app.calendar.badge_recovered'), icon: RotateCcw, className: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
      new: { label: t('app.calendar.badge_new'), icon: Sparkles, className: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
      scheduled: { label: t('app.calendar.badge_scheduled'), icon: Clock3, className: 'bg-muted text-muted-foreground border-border' },
      pending: { label: t('app.calendar.badge_pending'), icon: Clock3, className: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30' },
      attention: { label: t('app.calendar.badge_not_completed'), icon: CircleAlert, className: 'bg-red-500/15 text-red-300 border-red-500/30' },
    } as const;
    return meta[state];
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div data-tour="calendar-header" className="flex items-end justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-display font-bold text-primary text-glow">
            {t('app.calendar.page_title')}
          </h1>
          <div className="flex items-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500/70" /> {t('app.calendar.legend_perfect')}
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500/70" /> {t('app.calendar.legend_on_track')}
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500/70" /> {t('app.calendar.legend_attention')}
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
            <div data-tour="calendar-grid" className="rpg-card flex justify-center">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={handleDateSelect}
                locale={ptBR}
                modifiers={modifiers}
                modifiersClassNames={modifiersClassNames}
                classNames={{
                  cell: 'h-10 w-10 text-center text-sm p-0 relative focus-within:relative focus-within:z-20',
                  head_cell: 'text-muted-foreground rounded-md w-10 font-normal text-[0.8rem]',
                  row: 'flex w-full mt-2 gap-1',
                  day: 'h-10 w-10 p-0 font-normal rounded-full aria-selected:opacity-100 transition-colors',
                  day_selected: '!bg-primary !text-primary-foreground hover:!bg-primary focus:!bg-primary rounded-full shadow-[0_0_14px_hsl(var(--primary)/0.35)]',
                  day_today: 'border border-primary/60 text-primary font-semibold rounded-full',
                }}
                className="pointer-events-auto"
              />
            </div>
            <div data-tour="calendar-missions" className="space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h2 className="font-display font-semibold text-foreground">
                  {selectedDate
                    ? format(selectedDate, "dd 'de' MMMM", { locale: ptBR })
                    : t('app.calendar.select_day')}
                </h2>
                {selectedPerformance && (
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                    selectedPerformance.tier === 'perfect'
                      ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10'
                      : selectedPerformance.tier === 'on_track'
                        ? 'text-amber-300 border-amber-500/30 bg-amber-500/10'
                        : 'text-red-300 border-red-500/30 bg-red-500/10'
                  }`}>
                    {selectedPerformance.percentage}% · {selectedPerformance.completed}/{selectedPerformance.scheduled}
                  </span>
                )}
              </div>
              {missionsForDate.length > 0 ? (
                <div className="space-y-2">
                  {missionsForDate.map((m) => {
                    const state = missionStateMeta(m.calendarState);
                    const StateIcon = state.icon;
                    return (
                      <div key={m.id} className={`rpg-card ${m.calendarState === 'new' ? 'border-sky-500/30 bg-sky-500/5' : ''}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm text-foreground flex-1">{m.title}</span>
                          <span className={`rpg-badge inline-flex items-center gap-1 ${state.className}`}>
                            <StateIcon className="w-3 h-3" /> {state.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground rpg-card py-4 text-center">{t('app.calendar.missions_empty')}</p>
              )}

              {/* Diário de Aventura */}
              {selectedDate && (
                <div data-tour="calendar-journal" className="rpg-card space-y-3 mt-2">
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
      <TranslatedGuidedTour
        tourKey="calendar"
        targets={[
          { target: 'calendar-header', key: 'overview' },
          { target: 'calendar-grid', key: 'days' },
          { target: 'calendar-missions', key: 'missions' },
          { target: 'calendar-journal', key: 'journal' },
        ]}
      />
    </AppLayout>
  );
}
