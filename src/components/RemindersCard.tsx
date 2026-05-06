import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Plus, Trash2, Check, Clock, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useReminders,
  useCreateReminder,
  useDismissReminder,
  useDeleteReminder,
  type Reminder,
} from '@/hooks/useReminders';

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
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

export default function RemindersCard() {
  const { data: reminders = [] } = useReminders();
  const createReminder = useCreateReminder();
  const dismissReminder = useDismissReminder();
  const deleteReminder = useDeleteReminder();

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [remindAt, setRemindAt] = useState('');

  // Não-dispensados ordenados por horário
  const active = useMemo(
    () => reminders.filter((r) => !r.dismissed_at).sort((a, b) => a.remind_at.localeCompare(b.remind_at)),
    [reminders],
  );

  const overdue = useMemo(
    () => active.filter((r) => new Date(r.remind_at).getTime() <= Date.now()),
    [active],
  );
  const upcoming = useMemo(
    () => active.filter((r) => new Date(r.remind_at).getTime() > Date.now()),
    [active],
  );

  const handleCreate = () => {
    if (!title.trim()) {
      toast.error('Dê um título para o lembrete');
      return;
    }
    if (!remindAt) {
      toast.error('Escolha quando ser lembrado');
      return;
    }
    const isoRemind = new Date(remindAt).toISOString();
    createReminder.mutate(
      { title: title.trim(), description: description.trim() || undefined, remind_at: isoRemind },
      {
        onSuccess: () => {
          toast.success('Lembrete criado!');
          setTitle('');
          setDescription('');
          setRemindAt('');
          setShowForm(false);
        },
        onError: (e: any) => toast.error(e.message || 'Erro ao criar lembrete'),
      },
    );
  };

  // valor mínimo do datetime-local: agora
  const nowMinIso = useMemo(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }, []);

  return (
    <div className="rpg-card space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-display font-semibold text-foreground">Lembretes</h2>
          {overdue.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/40 rounded-full font-bold">
              {overdue.length} agora
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowForm((v) => !v)}
          className="h-7 px-2 text-xs"
        >
          {showForm ? <X className="w-3.5 h-3.5" /> : <><Plus className="w-3.5 h-3.5 mr-1" /> Novo</>}
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
            className="space-y-2 pt-1 overflow-hidden"
          >
            <Input
              placeholder="Título (ex: Tomar remédio)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              className="text-sm"
            />
            <Input
              placeholder="Detalhes (opcional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
              className="text-sm"
            />
            <Input
              type="datetime-local"
              min={nowMinIso}
              value={remindAt}
              onChange={(e) => setRemindAt(e.target.value)}
              className="text-sm"
            />
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={createReminder.isPending}
              className="w-full"
            >
              {createReminder.isPending ? 'Criando…' : 'Criar lembrete'}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {active.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-2">
          Nenhum lembrete ativo. Clique em <strong>+ Novo</strong> para criar.
        </p>
      ) : (
        <div className="space-y-1.5">
          {[...overdue, ...upcoming].slice(0, 8).map((r) => {
            const isOverdue = new Date(r.remind_at).getTime() <= Date.now();
            return (
              <ReminderRow
                key={r.id}
                reminder={r}
                isOverdue={isOverdue}
                onDismiss={() =>
                  dismissReminder.mutate(r.id, {
                    onSuccess: () => toast.success('Lembrete marcado como visto'),
                  })
                }
                onDelete={() =>
                  deleteReminder.mutate(r.id, {
                    onSuccess: () => toast.success('Lembrete removido'),
                  })
                }
              />
            );
          })}
          {active.length > 8 && (
            <p className="text-[10px] text-muted-foreground text-center pt-1">
              + {active.length - 8} lembretes mais antigos
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
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${
        isOverdue
          ? 'border-amber-500/40 bg-amber-500/10'
          : 'border-border bg-muted/15'
      }`}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{reminder.title}</p>
        {reminder.description && (
          <p className="text-[11px] text-muted-foreground truncate">{reminder.description}</p>
        )}
        <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
          <Clock className="w-3 h-3" />
          {fmtDateTime(reminder.remind_at)} · {relativeTime(reminder.remind_at)}
        </p>
      </div>
      <div className="flex gap-1 shrink-0">
        {isOverdue && (
          <button
            onClick={onDismiss}
            title="Marcar como visto"
            className="p-1.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/25 transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={onDelete}
          title="Apagar"
          className="p-1.5 bg-muted/40 text-muted-foreground border border-border rounded-lg hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
