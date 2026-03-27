import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  useMissions, useAttributes, useCreateMission, useCompleteMission,
  useChecklistItems, useAddChecklistItem, useToggleChecklistItem,
} from '@/hooks/useProfile';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Check, Loader2, Target, ChevronDown, ChevronUp, Swords } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const TIMES = [
  { value: 'manha', label: '🌅 Manhã' },
  { value: 'tarde', label: '☀️ Tarde' },
  { value: 'noite', label: '🌙 Noite' },
  { value: 'flex', label: '🔄 Flex' },
];

export default function Missions() {
  const [title, setTitle] = useState('');
  const [attrId, setAttrId] = useState('');
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [horario, setHorario] = useState('flex');
  const [showForm, setShowForm] = useState(false);
  const [expandedMission, setExpandedMission] = useState<string | null>(null);
  const [newChecklistText, setNewChecklistText] = useState('');

  const { data: pending, isLoading: pLoading } = useMissions(false);
  const { data: completed } = useMissions(true);
  const { data: attrs } = useAttributes();
  const createMission = useCreateMission();
  const completeMission = useCompleteMission();
  const { toast } = useToast();

  const toggleDay = (d: string) => {
    setSelectedDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !attrId) return;
    try {
      await createMission.mutateAsync({
        title: title.trim(),
        attributeId: attrId,
        daysOfWeek: selectedDays,
        horarioProvavel: horario,
      });
      setTitle('');
      setAttrId('');
      setSelectedDays([]);
      setHorario('flex');
      setShowForm(false);
      toast({ title: '📜 Missão criada!', description: 'Boa sorte, aventureiro!' });
    } catch {
      toast({ title: 'Erro ao criar missão', variant: 'destructive' });
    }
  };

  const handleComplete = async (mission: any) => {
    try {
      await completeMission.mutateAsync({
        missionId: mission.id,
        attributeId: mission.attribute_id,
        xpReward: mission.xp_reward,
      });
      toast({ title: '⚔️ Missão concluída!', description: `+${mission.xp_reward} XP ganhos!` });
    } catch {
      toast({ title: 'Erro', variant: 'destructive' });
    }
  };

  // Separate missions with checklists as "main missions"
  const mainMissions = useMemo(() => pending?.filter(() => true) || [], [pending]);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-display font-bold text-primary text-glow">
            <Target className="w-6 h-6 inline mr-2" />
            Missões
          </h1>
          <Button
            onClick={() => setShowForm(!showForm)}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            size="sm"
          >
            <Plus className="w-4 h-4 mr-1" />
            Nova Missão
          </Button>
        </div>

        <AnimatePresence>
          {showForm && (
            <motion.form
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              onSubmit={handleCreate}
              className="rpg-card-glow space-y-3 overflow-hidden"
            >
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Título da missão..."
                required
                className="bg-secondary border-border"
              />
              <Select value={attrId} onValueChange={setAttrId}>
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue placeholder="Escolha o atributo" />
                </SelectTrigger>
                <SelectContent>
                  {attrs?.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.icon} {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Days of week */}
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Dias da semana</p>
                <div className="flex gap-1.5 flex-wrap">
                  {DAYS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleDay(d)}
                      className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                        selectedDays.includes(d)
                          ? 'bg-primary/20 border-primary/50 text-primary'
                          : 'bg-secondary border-border text-muted-foreground'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              {/* Time selector */}
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Horário provável</p>
                <div className="flex gap-1.5 flex-wrap">
                  {TIMES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setHorario(t.value)}
                      className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                        horario === t.value
                          ? 'bg-primary/20 border-primary/50 text-primary'
                          : 'bg-secondary border-border text-muted-foreground'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rpg-card bg-secondary/50 text-center">
                <p className="text-xs text-muted-foreground">Recompensa</p>
                <p className="text-primary font-bold">+25 XP</p>
              </div>

              <Button
                type="submit"
                disabled={createMission.isPending}
                className="w-full bg-primary text-primary-foreground"
              >
                {createMission.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Criar Missão
              </Button>
            </motion.form>
          )}
        </AnimatePresence>

        {/* Main Missions Section */}
        <div>
          <h2 className="text-lg font-display font-semibold text-foreground mb-3 flex items-center gap-2">
            <Swords className="w-5 h-5 text-primary" />
            Missões Principais ({mainMissions.length})
          </h2>
          {pLoading ? (
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          ) : mainMissions.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {mainMissions.map((m, i) => (
                <MainMissionCard
                  key={m.id}
                  mission={m}
                  index={i}
                  expanded={expandedMission === m.id}
                  onToggle={() => setExpandedMission(expandedMission === m.id ? null : m.id)}
                  onComplete={() => handleComplete(m)}
                  completing={completeMission.isPending}
                  newChecklistText={expandedMission === m.id ? newChecklistText : ''}
                  onNewChecklistTextChange={setNewChecklistText}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma missão pendente. Crie uma nova!</p>
          )}
        </div>

        {/* Completed */}
        {completed && completed.length > 0 && (
          <div>
            <h2 className="text-lg font-display font-semibold text-foreground mb-3">
              Concluídas ({completed.length})
            </h2>
            <div className="space-y-2">
              {completed.slice(0, 10).map((m) => (
                <div key={m.id} className="rpg-card opacity-60 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-foreground line-through">{m.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {m.completed_at && new Date(m.completed_at).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <span className="text-primary text-sm font-bold">+{m.xp_reward} XP</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function MainMissionCard({
  mission, index, expanded, onToggle, onComplete, completing,
  newChecklistText, onNewChecklistTextChange,
}: {
  mission: any;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onComplete: () => void;
  completing: boolean;
  newChecklistText: string;
  onNewChecklistTextChange: (v: string) => void;
}) {
  const { data: checklist } = useChecklistItems(mission.id);
  const addItem = useAddChecklistItem();
  const toggleItem = useToggleChecklistItem();
  const { toast } = useToast();

  const days = (mission.days_of_week as string[]) || [];
  const timeLabel = TIMES.find((t) => t.value === mission.horario_provavel)?.label || '🔄 Flex';

  const completedCount = (checklist || []).filter((c: any) => c.completed).length;
  const totalCount = (checklist || []).length;
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const handleAddChecklist = async () => {
    if (!newChecklistText.trim()) return;
    try {
      await addItem.mutateAsync({ missionId: mission.id, description: newChecklistText.trim() });
      onNewChecklistTextChange('');
    } catch {
      toast({ title: 'Erro', variant: 'destructive' });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="rpg-card-glow space-y-3"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground">{mission.title}</p>
          <div className="flex items-center gap-2 flex-wrap mt-1">
            <span className="rpg-badge text-[10px]">
              {(mission as any).attributes?.icon} {(mission as any).attributes?.name}
            </span>
            <span className="text-xs text-primary font-bold">+{mission.xp_reward} XP</span>
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={onToggle} className="h-7 w-7 p-0 shrink-0">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>
      </div>

      {/* Schedule */}
      {(days.length > 0 || mission.horario_provavel) && (
        <div className="flex items-center gap-2 flex-wrap">
          {days.length > 0 && (
            <span className="text-[10px] text-muted-foreground bg-secondary px-2 py-0.5 rounded">
              📅 {days.join(', ')}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground bg-secondary px-2 py-0.5 rounded">
            {timeLabel}
          </span>
        </div>
      )}

      {/* Progress bar */}
      {totalCount > 0 && (
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-[10px] text-muted-foreground">
              {completedCount}/{totalCount} sub-missões
            </span>
            <span className="text-[10px] text-primary font-semibold">{Math.round(progressPercent)}%</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={onComplete}
          disabled={completing}
          className="flex-1 bg-success text-success-foreground hover:bg-success/90"
        >
          <Check className="w-4 h-4 mr-1" />
          Completar Missão
        </Button>
      </div>

      {/* Expanded checklist */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden space-y-2 pt-2 border-t border-border"
          >
            <p className="text-xs text-muted-foreground font-medium">Sub-missões (+2 XP cada)</p>
            {checklist?.map((item: any) => (
              <label
                key={item.id}
                className="flex items-center gap-2 cursor-pointer"
                onClick={(e) => e.stopPropagation()}
              >
                <Checkbox
                  checked={item.completed}
                  onCheckedChange={() =>
                    toggleItem.mutate({ itemId: item.id, completed: !item.completed, xpBonus: item.xp_bonus })
                  }
                />
                <span className={`text-xs flex-1 ${item.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                  {item.description}
                </span>
                <span className="text-[10px] text-primary">+{item.xp_bonus} XP</span>
              </label>
            ))}
            <div className="flex gap-2">
              <Input
                value={newChecklistText}
                onChange={(e) => onNewChecklistTextChange(e.target.value)}
                placeholder="Nova sub-missão..."
                className="h-7 text-xs bg-secondary border-border"
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddChecklist())}
              />
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-primary/30 text-primary"
                onClick={handleAddChecklist}
                disabled={addItem.isPending}
              >
                <Plus className="w-3 h-3" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
