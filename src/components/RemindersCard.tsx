import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, Check, Clock, Plus, Repeat2, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useCreateReminder,
  useDeleteReminder,
  useDismissReminder,
  useReminders,
  type Reminder,
} from '@/hooks/useReminders';
import {
  findNextWeeklyReminderOccurrence,
  getLocalTodayString,
  type ReminderRecurrenceType,
} from '@/lib/reminders';

const WEEKDAYS = [
  { value: 0, label: 'Dom' },
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
];

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function relativeTime(iso: string): string {
  const diffMin = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (diffMin < -60 * 24) return `${Math.abs(Math.round(diffMin / (60 * 24)))} dias atrás`;
  if (diffMin < -60) return `${Math.abs(Math.round(diffMin / 60))}h atrás`;
  if (diffMin < 0) return `${Math.abs(diffMin)}min atrás`;
  if (diffMin < 60) return `em ${diffMin}min`;
  if (diffMin < 60 * 24) return `em ${Math.round(diffMin / 60)}h`;
  return `em ${Math.round(diffMin / (60 * 24))} dias`;
}

function dateDaysFromToday(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return getLocalTodayString(date);
}

export default function RemindersCard() {
  const { data: reminders = [] } = useReminders();
  const createReminder = useCreateReminder();
  const dismissReminder = useDismissReminder();
  const deleteReminder = useDeleteReminder();

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [recurrenceType, setRecurrenceType] = useState<ReminderRecurrenceType>('once');
  const [remindAt, setRemindAt] = useState('');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [startDate, setStartDate] = useState(() => getLocalTodayString());
  const [endDate, setEndDate] = useState(() => dateDaysFromToday(30));
  const [remindTime, setRemindTime] = useState('08:00');

  const active = useMemo(
    () => [...reminders].sort((a, b) => a.remind_at.localeCompare(b.remind_at)),
    [reminders],
  );
  const overdue = useMemo(
    () => active.filter((reminder) => new Date(reminder.remind_at).getTime() <= Date.now()),
    [active],
  );
  const upcoming = useMemo(
    () => active.filter((reminder) => new Date(reminder.remind_at).getTime() > Date.now()),
    [active],
  );

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setRecurrenceType('once');
    setRemindAt('');
    setDaysOfWeek([]);
    setStartDate(getLocalTodayString());
    setEndDate(dateDaysFromToday(30));
    setRemindTime('08:00');
    setShowForm(false);
  };

  const handleCreate = () => {
    if (!title.trim()) {
      toast.error('Dê um título para o lembrete');
      return;
    }

    if (recurrenceType === 'once') {
      if (!remindAt) {
        toast.error('Escolha a data e o horário do lembrete');
        return;
      }
      const occurrence = new Date(remindAt);
      if (occurrence <= new Date()) {
        toast.error('Escolha um horário futuro');
        return;
      }

      createReminder.mutate({
        title: title.trim(),
        description: description.trim() || undefined,
        remind_at: occurrence.toISOString(),
        recurrence_type: 'once',
      }, {
        onSuccess: () => {
          toast.success('Lembrete único criado!');
          resetForm();
        },
        onError: (error: Error) => toast.error(error.message || 'Erro ao criar lembrete'),
      });
      return;
    }

    if (daysOfWeek.length === 0) {
      toast.error('Escolha pelo menos um dia da semana');
      return;
    }
    if (!startDate || !endDate || !remindTime) {
      toast.error('Preencha o início, o fim e o horário');
      return;
    }
    if (endDate < startDate) {
      toast.error('A data final deve ser igual ou posterior à inicial');
      return;
    }

    const nextOccurrence = findNextWeeklyReminderOccurrence({
      daysOfWeek,
      startDate,
      endDate,
      time: remindTime,
    });
    if (!nextOccurrence) {
      toast.error('Não existe uma próxima ocorrência dentro desse período');
      return;
    }

    createReminder.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      remind_at: nextOccurrence.toISOString(),
      recurrence_type: 'weekly',
      days_of_week: [...daysOfWeek].sort(),
      starts_on: startDate,
      ends_on: endDate,
      remind_time: remindTime,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }, {
      onSuccess: () => {
        toast.success('Lembrete recorrente criado!');
        resetForm();
      },
      onError: (error: Error) => toast.error(error.message || 'Erro ao criar lembrete'),
    });
  };

  const nowMinIso = useMemo(() => {
    const date = new Date();
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  }, []);

  const toggleWeekday = (day: number) => {
    setDaysOfWeek((current) => current.includes(day)
      ? current.filter((value) => value !== day)
      : [...current, day]);
  };

  return (
    <div className="rpg-card space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-display font-semibold text-foreground">Lembretes</h2>
          {overdue.length > 0 && (
            <span className="rounded-full border border-amber-500/40 bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-400">
              {overdue.length} agora
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowForm((visible) => !visible)}
          className="h-7 px-2 text-xs"
        >
          {showForm
            ? <X className="w-3.5 h-3.5" />
            : <><Plus className="mr-1 w-3.5 h-3.5" /> Novo</>}
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Lembretes não são missões — não dão XP, só te avisam no horário marcado.
      </p>

      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3 overflow-hidden pt-1"
          >
            <Input
              placeholder="Título (ex: Terapia ou tomar remédio)"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={80}
              className="text-sm"
            />
            <Input
              placeholder="Detalhes (opcional)"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={200}
              className="text-sm"
            />

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRecurrenceType('once')}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                  recurrenceType === 'once'
                    ? 'border-primary/60 bg-primary/15 text-primary'
                    : 'border-border bg-muted/20 text-muted-foreground'
                }`}
              >
                Único
              </button>
              <button
                type="button"
                onClick={() => setRecurrenceType('weekly')}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                  recurrenceType === 'weekly'
                    ? 'border-violet-400/60 bg-violet-400/15 text-violet-300'
                    : 'border-border bg-muted/20 text-muted-foreground'
                }`}
              >
                Diário / recorrente
              </button>
            </div>

            {recurrenceType === 'once' ? (
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">Quando avisar?</span>
                <Input
                  type="datetime-local"
                  min={nowMinIso}
                  value={remindAt}
                  onChange={(event) => setRemindAt(event.target.value)}
                  className="text-sm"
                />
              </label>
            ) : (
              <div className="space-y-3 rounded-xl border border-violet-400/20 bg-violet-400/5 p-3">
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-foreground">Em quais dias?</span>
                    <span className="text-[10px] text-muted-foreground">
                      {daysOfWeek.length} dia(s) por semana
                    </span>
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {WEEKDAYS.map((day) => (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => toggleWeekday(day.value)}
                        className={`rounded-md border py-1.5 text-[10px] font-semibold transition-colors ${
                          daysOfWeek.includes(day.value)
                            ? 'border-violet-400/60 bg-violet-400/20 text-violet-200'
                            : 'border-border bg-muted/20 text-muted-foreground'
                        }`}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => setDaysOfWeek([0, 1, 2, 3, 4, 5, 6])} className="text-[10px] text-violet-300 hover:underline">
                      Todos os dias
                    </button>
                    <button type="button" onClick={() => setDaysOfWeek([1, 2, 3, 4, 5])} className="text-[10px] text-violet-300 hover:underline">
                      Dias úteis
                    </button>
                    <button type="button" onClick={() => setDaysOfWeek([])} className="text-[10px] text-muted-foreground hover:underline">
                      Limpar
                    </button>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  <label className="space-y-1">
                    <span className="text-[11px] text-muted-foreground">Começa em</span>
                    <Input type="date" min={getLocalTodayString()} value={startDate} onChange={(event) => setStartDate(event.target.value)} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] text-muted-foreground">Repete até</span>
                    <Input type="date" min={startDate || getLocalTodayString()} value={endDate} onChange={(event) => setEndDate(event.target.value)} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] text-muted-foreground">Horário</span>
                    <Input type="time" value={remindTime} onChange={(event) => setRemindTime(event.target.value)} />
                  </label>
                </div>
              </div>
            )}

            <Button size="sm" onClick={handleCreate} disabled={createReminder.isPending} className="w-full">
              {createReminder.isPending ? 'Criando…' : 'Criar lembrete'}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {active.length === 0 ? (
        <p className="py-2 text-center text-xs text-muted-foreground">
          Nenhum lembrete ativo. Clique em <strong>+ Novo</strong> para criar.
        </p>
      ) : (
        <div className="space-y-1.5">
          {[...overdue, ...upcoming].slice(0, 8).map((reminder) => (
            <ReminderRow
              key={reminder.id}
              reminder={reminder}
              isOverdue={new Date(reminder.remind_at).getTime() <= Date.now()}
              onDismiss={() => dismissReminder.mutate(reminder.id, {
                onSuccess: () => toast.success('Lembrete marcado como visto'),
              })}
              onDelete={() => deleteReminder.mutate(reminder.id, {
                onSuccess: () => toast.success('Lembrete removido'),
              })}
            />
          ))}
          {active.length > 8 && (
            <p className="pt-1 text-center text-[10px] text-muted-foreground">
              + {active.length - 8} lembretes
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ReminderRow({
  reminder,
  isOverdue,
  onDismiss,
  onDelete,
}: {
  reminder: Reminder;
  isOverdue: boolean;
  onDismiss: () => void;
  onDelete: () => void;
}) {
  const recurring = reminder.recurrence_type === 'weekly';
  const selectedDays = WEEKDAYS
    .filter((day) => reminder.days_of_week.includes(day.value))
    .map((day) => day.label)
    .join(', ');

  return (
    <div className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${
      isOverdue
        ? 'border-amber-500/40 bg-amber-500/10'
        : 'border-border bg-muted/15'
    }`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium text-foreground">{reminder.title}</p>
          {recurring && <Repeat2 className="h-3 w-3 shrink-0 text-violet-300" />}
        </div>
        {reminder.description && (
          <p className="truncate text-[11px] text-muted-foreground">{reminder.description}</p>
        )}
        {recurring && reminder.ends_on && (
          <p className="truncate text-[10px] text-violet-300/80">
            {selectedDays} · até {fmtDate(reminder.ends_on)}
          </p>
        )}
        <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          {recurring ? 'Próximo: ' : ''}{fmtDateTime(reminder.remind_at)} · {relativeTime(reminder.remind_at)}
        </p>
      </div>
      <div className="flex shrink-0 gap-1">
        {isOverdue && !recurring && (
          <button
            onClick={onDismiss}
            title="Marcar como visto"
            className="rounded-lg border border-emerald-500/30 bg-emerald-500/15 p-1.5 text-emerald-400 transition-colors hover:bg-emerald-500/25"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          onClick={onDelete}
          title={recurring ? 'Encerrar e apagar recorrência' : 'Apagar'}
          className="rounded-lg border border-border bg-muted/40 p-1.5 text-muted-foreground transition-colors hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
