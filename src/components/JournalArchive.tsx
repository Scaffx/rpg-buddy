import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { BookOpen, CalendarDays, ExternalLink, Loader2 } from 'lucide-react';
import { useJournalEntries, type JournalMood } from '@/hooks/useAdventureJournal';
import { parseLocalDate } from '@/lib/dateUtils';

const MOOD_EMOJI: Record<JournalMood, string> = {
  feliz: '😄',
  motivado: '🔥',
  neutro: '😐',
  cansado: '😴',
  ansioso: '😰',
};

export function JournalArchive() {
  const { t, i18n } = useTranslation();
  const { data: entries = [], isLoading } = useJournalEntries();
  const locale = i18n.resolvedLanguage === 'pt' ? 'pt-BR' : i18n.resolvedLanguage;

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rpg-card py-12 px-5 text-center space-y-3">
        <BookOpen className="w-9 h-9 text-primary/70 mx-auto" />
        <div>
          <h2 className="font-display font-semibold text-foreground">{t('app.virtues.journals_empty_title')}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t('app.virtues.journals_empty_body')}</p>
        </div>
        <Link to="/calendar" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
          <CalendarDays className="w-4 h-4" /> {t('app.virtues.write_first_journal')}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display font-semibold text-foreground">{t('app.virtues.my_journals_title')}</h2>
        <p className="text-xs text-muted-foreground mt-1">{t('app.virtues.my_journals_subtitle')}</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {entries.map((entry) => {
          const mood = (entry.mood || 'neutro') as JournalMood;
          const dateLabel = parseLocalDate(entry.entry_date).toLocaleDateString(locale, {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          });

          return (
            <article key={entry.id} className="rpg-card p-4 space-y-3 border-border/70">
              <header className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xl" aria-hidden>{MOOD_EMOJI[mood]}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground capitalize truncate">{dateLabel}</p>
                    <p className="text-[11px] text-muted-foreground">{t(`app.calendar.mood_${mood === 'feliz' ? 'happy' : mood === 'motivado' ? 'motivated' : mood === 'neutro' ? 'neutral' : mood === 'cansado' ? 'tired' : 'anxious'}`)}</p>
                  </div>
                </div>
                <Link
                  to={`/calendar?date=${entry.entry_date}`}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
                >
                  {t('app.virtues.open_in_calendar')} <ExternalLink className="w-3 h-3" />
                </Link>
              </header>
              <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">{entry.content}</p>
            </article>
          );
        })}
      </div>
    </div>
  );
}
