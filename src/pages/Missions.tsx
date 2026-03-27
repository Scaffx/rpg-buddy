import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  useMissions, useAttributes, useCreateMission, useCompleteMission,
  useChecklistItems, useAddChecklistItem, useToggleChecklistItem,
} from '@/hooks/useProfile';
import { useUpdateMission, useDeleteMission, useArchiveMission, useDeleteChecklistItem } from '@/hooks/useMissionActions';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Plus, Check, Loader2, Target, ChevronDown, ChevronUp,
  Search, X, Pencil, Trash2, Pause, Play, Sun, Moon, Sunrise, RotateCcw,
  Beer, Shield, Flame,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const TIMES = [
  { value: 'manha', label: '🌅 Manhã', icon: Sunrise },
  { value: 'tarde', label: '☀️ Tarde', icon: Sun },
  { value: 'noite', label: '🌙 Noite', icon: Moon },
  { value: 'flex', label: '🔄 Flex', icon: RotateCcw },
];

const PRIORITIES = [
  { value: 'baixa', label: 'Baixa', icon: Beer, color: 'text-success border-success/50 bg-success/10' },
  { value: 'media', label: 'Média', icon: Shield, color: 'text-yellow-400 border-yellow-400/50 bg-yellow-400/10' },
  { value: 'alta', label: 'Alta', icon: Flame, color: 'text-destructive border-destructive/50 bg-destructive/10' },
];

const TABS = [
  { value: 'pendentes', label: 'Pendentes', color: 'bg-yellow-400/20 text-yellow-400' },
  { value: 'todas', label: 'Todas', color: 'bg-muted text-muted-foreground' },
  { value: 'foco', label: 'Foco do Dia', color: 'bg-primary/20 text-primary' },
  { value: 'concluidas', label: 'Concluídas', color: 'bg-success/20 text-success' },
];

const ATTRIBUTE_CATEGORIES = [
  'Todos', 'Força', 'Inteligência', 'Sabedoria', 'Carisma',
  'Vitalidade', 'Agilidade', 'Disciplina', 'Criatividade', 'Resiliência',
];

const STATUS_COLORS: Record<string, string> = {
  pendente: 'bg-cyan-400',
  em_progresso: 'bg-yellow-400',
  completa: 'bg-success',
  arquivada: 'bg-muted-foreground',
};

const PRIORITY_BORDER: Record<string, string> = {
  alta: 'border-l-destructive',
  media: 'border-l-yellow-400',
  baixa: 'border-l-success',
};

export default function Missions() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('pendentes');
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['Todos']);
  const [expandedMission, setExpandedMission] = useState<string | null>(null);
  const [newChecklistText, setNewChecklistText] = useState('');

  // Modal states
  const [showCreateEdit, setShowCreateEdit] = useState(false);
  const [editingMission, setEditingMission] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formAttrId, setFormAttrId] = useState('');
  const [formPriority, setFormPriority] = useState('media');
  const [formDays, setFormDays] = useState<string[]>([]);
  const [formHorario, setFormHorario] = useState('flex');

  const { data: allMissions, isLoading } = useMissions();
  const { data: attrs } = useAttributes();
  const createMission = useCreateMission();
  const completeMission = useCompleteMission();
  const updateMission = useUpdateMission();
  const deleteMission = useDeleteMission();
  const archiveMission = useArchiveMission();
  const { toast } = useToast();

  const todayDay = useMemo(() => {
    const d = new Date().getDay();
    return DAYS[d === 0 ? 6 : d - 1];
  }, []);

  // Filter missions
  const filteredMissions = useMemo(() => {
    if (!allMissions) return [];
    let result = [...allMissions];

    // Tab filter
    if (activeTab === 'pendentes') {
      result = result.filter((m: any) => !m.completed && (m as any).status !== 'arquivada');
    } else if (activeTab === 'foco') {
      result = result.filter((m: any) => {
        const days = (m.days_of_week as string[]) || [];
        return !m.completed && (days.length === 0 || days.includes(todayDay));
      });
    } else if (activeTab === 'concluidas') {
      result = result.filter((m: any) => m.completed || (m as any).status === 'arquivada');
    }

    // Category filter
    if (!selectedCategories.includes('Todos')) {
      result = result.filter((m: any) => {
        const attrName = (m as any).attributes?.name;
        return selectedCategories.includes(attrName);
      });
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((m: any) => m.title.toLowerCase().includes(q));
    }

    // Sort by priority
    const priorityOrder: Record<string, number> = { alta: 0, media: 1, baixa: 2 };
    result.sort((a: any, b: any) => (priorityOrder[(a as any).priority || 'media'] ?? 1) - (priorityOrder[(b as any).priority || 'media'] ?? 1));

    return result;
  }, [allMissions, activeTab, selectedCategories, searchQuery, todayDay]);

  // Group by time period
  const groupedMissions = useMemo(() => {
    const groups: Record<string, any[]> = { manha: [], tarde: [], noite: [], flex: [] };
    filteredMissions.forEach((m: any) => {
      const h = m.horario_provavel || 'flex';
      if (groups[h]) groups[h].push(m);
      else groups.flex.push(m);
    });
    return groups;
  }, [filteredMissions]);

  const toggleCategory = (cat: string) => {
    if (cat === 'Todos') {
      setSelectedCategories(['Todos']);
    } else {
      setSelectedCategories((prev) => {
        const without = prev.filter((c) => c !== 'Todos');
        if (without.includes(cat)) {
          const next = without.filter((c) => c !== cat);
          return next.length === 0 ? ['Todos'] : next;
        }
        return [...without, cat];
      });
    }
  };

  const openCreateModal = () => {
    setEditingMission(null);
    setFormTitle('');
    setFormDescription('');
    setFormNotes('');
    setFormAttrId('');
    setFormPriority('media');
    setFormDays([]);
    setFormHorario('flex');
    setShowCreateEdit(true);
  };

  const openEditModal = (m: any) => {
    setEditingMission(m);
    setFormTitle(m.title);
    setFormDescription((m as any).description || '');
    setFormNotes((m as any).notes || '');
    setFormAttrId(m.attribute_id);
    setFormPriority((m as any).priority || 'media');
    setFormDays((m.days_of_week as string[]) || []);
    setFormHorario(m.horario_provavel || 'flex');
    setShowCreateEdit(true);
  };

  const handleSave = async () => {
    if (!formTitle.trim() || !formAttrId) return;
    try {
      if (editingMission) {
        await updateMission.mutateAsync({
          missionId: editingMission.id,
          updates: {
            title: formTitle.trim(),
            description: formDescription.trim() || undefined,
            notes: formNotes.trim() || undefined,
            attribute_id: formAttrId,
            priority: formPriority,
            days_of_week: formDays,
            horario_provavel: formHorario,
          },
        });
        toast({ title: '✏️ Missão atualizada!' });
      } else {
        await createMission.mutateAsync({
          title: formTitle.trim(),
          attributeId: formAttrId,
          daysOfWeek: formDays,
          horarioProvavel: formHorario,
        });
        // Update the new mission with extra fields
        toast({ title: '📜 Missão criada!', description: 'Boa sorte, aventureiro!' });
      }
      setShowCreateEdit(false);
    } catch {
      toast({ title: 'Erro', variant: 'destructive' });
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

  const handleDelete = async (id: string) => {
    try {
      await deleteMission.mutateAsync(id);
      setDeleteConfirm(null);
      toast({ title: '🗑️ Missão deletada com sucesso' });
    } catch {
      toast({ title: 'Erro', variant: 'destructive' });
    }
  };

  const handleArchive = async (id: string) => {
    try {
      await archiveMission.mutateAsync(id);
      toast({ title: '⏸️ Missão arquivada' });
    } catch {
      toast({ title: 'Erro', variant: 'destructive' });
    }
  };

  const handlePlay = async (mission: any) => {
    const newStatus = (mission as any).status === 'em_progresso' ? 'pendente' : 'em_progresso';
    try {
      await updateMission.mutateAsync({ missionId: mission.id, updates: { status: newStatus } });
      toast({
        title: newStatus === 'em_progresso' ? '▶️ Missão iniciada!' : '⏸️ Missão pausada',
      });
    } catch {
      toast({ title: 'Erro', variant: 'destructive' });
    }
  };

  const TIME_GROUPS = [
    { key: 'manha', label: 'Manhã', icon: Sunrise },
    { key: 'tarde', label: 'Tarde', icon: Sun },
    { key: 'noite', label: 'Noite', icon: Moon },
    { key: 'flex', label: 'Flex', icon: RotateCcw },
  ];

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-display font-bold text-primary">
            <Target className="w-6 h-6 inline mr-2" />
            Missões
          </h1>
          <Button onClick={openCreateModal} className="bg-primary text-primary-foreground hover:bg-primary/90" size="sm">
            <Plus className="w-4 h-4 mr-1" /> Nova Missão
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Pesquisar missão..."
            className="pl-9 bg-secondary border-border"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 flex-wrap">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-all ${
                activeTab === tab.value
                  ? `${tab.color} ring-1 ring-current`
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.value === 'concluidas' && <Check className="w-3 h-3 inline mr-1" />}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Category filters */}
        <div className="flex gap-1.5 flex-wrap">
          {ATTRIBUTE_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => toggleCategory(cat)}
              className={`px-2 py-1 text-[10px] rounded-full border transition-colors ${
                selectedCategories.includes(cat)
                  ? 'bg-primary/20 border-primary/50 text-primary'
                  : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Mission groups */}
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : filteredMissions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhuma missão encontrada.</p>
        ) : (
          TIME_GROUPS.map(({ key, label, icon: Icon }) => {
            const missions = groupedMissions[key];
            if (!missions || missions.length === 0) return null;
            return (
              <div key={key} className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                  <Icon className="w-4 h-4" />
                  {label} ({missions.length})
                </h3>
                <div className="space-y-2">
                  {missions.map((m: any, i: number) => (
                    <MissionCard
                      key={m.id}
                      mission={m}
                      index={i}
                      expanded={expandedMission === m.id}
                      onToggle={() => setExpandedMission(expandedMission === m.id ? null : m.id)}
                      onComplete={() => handleComplete(m)}
                      onEdit={() => openEditModal(m)}
                      onDelete={() => setDeleteConfirm(m.id)}
                      onArchive={() => handleArchive(m.id)}
                      onPlay={() => handlePlay(m)}
                      completing={completeMission.isPending}
                      newChecklistText={expandedMission === m.id ? newChecklistText : ''}
                      onNewChecklistTextChange={setNewChecklistText}
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Create/Edit Modal */}
      <MissionFormModal
        open={showCreateEdit}
        onOpenChange={setShowCreateEdit}
        isEditing={!!editingMission}
        attrs={attrs || []}
        formTitle={formTitle} setFormTitle={setFormTitle}
        formDescription={formDescription} setFormDescription={setFormDescription}
        formNotes={formNotes} setFormNotes={setFormNotes}
        formAttrId={formAttrId} setFormAttrId={setFormAttrId}
        formPriority={formPriority} setFormPriority={setFormPriority}
        formDays={formDays} setFormDays={setFormDays}
        formHorario={formHorario} setFormHorario={setFormHorario}
        onSave={handleSave}
        saving={createMission.isPending || updateMission.isPending}
        missionId={editingMission?.id}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza que deseja deletar esta missão?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
              className="bg-destructive text-destructive-foreground"
            >
              Deletar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

/* ─── Mission Card ─── */

function MissionCard({
  mission, index, expanded, onToggle, onComplete, onEdit, onDelete, onArchive, onPlay,
  completing, newChecklistText, onNewChecklistTextChange,
}: {
  mission: any; index: number; expanded: boolean;
  onToggle: () => void; onComplete: () => void; onEdit: () => void;
  onDelete: () => void; onArchive: () => void; onPlay: () => void;
  completing: boolean; newChecklistText: string; onNewChecklistTextChange: (v: string) => void;
}) {
  const { data: checklist } = useChecklistItems(mission.id);
  const addItem = useAddChecklistItem();
  const toggleItem = useToggleChecklistItem();
  const deleteItem = useDeleteChecklistItem();
  const { toast } = useToast();

  const days = (mission.days_of_week as string[]) || [];
  const timeLabel = TIMES.find((t) => t.value === mission.horario_provavel)?.label || '🔄 Flex';
  const completedCount = (checklist || []).filter((c: any) => c.completed).length;
  const totalCount = (checklist || []).length;
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const status = (mission as any).status || 'pendente';
  const priority = (mission as any).priority || 'media';
  const isCompleted = mission.completed;

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
      transition={{ delay: index * 0.03 }}
      className={`rpg-card-glow space-y-2 border-l-4 ${PRIORITY_BORDER[priority] || 'border-l-yellow-400'} ${isCompleted ? 'opacity-60' : ''}`}
    >
      {/* Top row */}
      <div className="flex items-start gap-2">
        {/* Status dot */}
        <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${STATUS_COLORS[status] || 'bg-cyan-400'}`} />

        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold text-foreground ${isCompleted ? 'line-through' : ''}`}>{mission.title}</p>
          {(mission as any).description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{(mission as any).description}</p>
          )}
          <div className="flex items-center gap-2 flex-wrap mt-1">
            <span className="rpg-badge text-[10px]">
              {(mission as any).attributes?.icon} {(mission as any).attributes?.name}
            </span>
            {days.length > 0 && (
              <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">DIÁRIA</span>
            )}
            <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
              {PRIORITIES.find((p) => p.value === priority)?.label || 'Média'}
            </span>
            <span className="text-xs text-primary font-bold">+{mission.xp_reward} XP</span>
          </div>
        </div>

        {/* Action buttons - desktop */}
        <div className="hidden md:flex items-center gap-1 shrink-0">
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onEdit} title="Editar">
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onDelete} title="Excluir">
            <Trash2 className="w-3.5 h-3.5 text-destructive" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onArchive} title="Arquivar">
            <Pause className="w-3.5 h-3.5" />
          </Button>
          {!isCompleted && (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-yellow-400"
                onClick={onPlay}
                title={status === 'em_progresso' ? 'Pausar' : 'Iniciar'}
              >
                {status === 'em_progresso' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </Button>
              <Button
                size="sm"
                className="h-7 px-2 text-xs bg-success text-success-foreground hover:bg-success/90"
                onClick={onComplete}
                disabled={completing}
              >
                <Check className="w-3.5 h-3.5" />
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onToggle}>
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </Button>
        </div>

        {/* Mobile: dropdown-like row */}
        <div className="flex md:hidden items-center gap-1 shrink-0">
          {!isCompleted && (
            <Button
              size="sm"
              className="h-7 px-2 text-xs bg-success text-success-foreground hover:bg-success/90"
              onClick={onComplete}
              disabled={completing}
            >
              <Check className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onToggle}>
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      {/* Sub-missions counter + schedule */}
      <div className="flex items-center gap-2 flex-wrap text-[10px] text-muted-foreground">
        {totalCount > 0 && <span>Sub-missões: {completedCount}/{totalCount}</span>}
        {days.length > 0 && <span>📅 {days.join(', ')}</span>}
        <span>{timeLabel}</span>
        <span>Criada em: {new Date(mission.created_at).toLocaleDateString('pt-BR')}</span>
      </div>

      {/* Progress */}
      {totalCount > 0 && <Progress value={progressPercent} className="h-1.5" />}

      {/* Mobile action row */}
      {expanded && (
        <div className="flex md:hidden gap-1 flex-wrap">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onEdit}><Pencil className="w-3 h-3 mr-1" />Editar</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs text-destructive" onClick={onDelete}><Trash2 className="w-3 h-3 mr-1" />Excluir</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onArchive}><Pause className="w-3 h-3 mr-1" />Arquivar</Button>
          {!isCompleted && (
            <Button size="sm" variant="outline" className="h-7 text-xs text-yellow-400" onClick={onPlay}>
              <Play className="w-3 h-3 mr-1" />{status === 'em_progresso' ? 'Pausar' : 'Iniciar'}
            </Button>
          )}
        </div>
      )}

      {/* Expanded checklist */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden space-y-2 pt-2 border-t border-border"
          >
            {(mission as any).notes && (
              <p className="text-xs text-muted-foreground italic bg-secondary/50 p-2 rounded">
                📝 {(mission as any).notes}
              </p>
            )}
            <p className="text-xs text-muted-foreground font-medium">Sub-missões (+2 XP cada)</p>
            {checklist?.map((item: any) => (
              <div key={item.id} className="flex items-center gap-2">
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
                <button onClick={() => deleteItem.mutate(item.id)} className="text-destructive/60 hover:text-destructive">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <Input
                value={newChecklistText}
                onChange={(e) => onNewChecklistTextChange(e.target.value)}
                placeholder="Adicionar item..."
                className="h-7 text-xs bg-secondary border-border"
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddChecklist())}
              />
              <Button size="sm" variant="outline" className="h-7 text-xs border-primary/30 text-primary" onClick={handleAddChecklist} disabled={addItem.isPending}>
                <Plus className="w-3 h-3" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ─── Create/Edit Modal ─── */

function MissionFormModal({
  open, onOpenChange, isEditing, attrs,
  formTitle, setFormTitle, formDescription, setFormDescription,
  formNotes, setFormNotes, formAttrId, setFormAttrId,
  formPriority, setFormPriority, formDays, setFormDays,
  formHorario, setFormHorario, onSave, saving, missionId,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; isEditing: boolean; attrs: any[];
  formTitle: string; setFormTitle: (v: string) => void;
  formDescription: string; setFormDescription: (v: string) => void;
  formNotes: string; setFormNotes: (v: string) => void;
  formAttrId: string; setFormAttrId: (v: string) => void;
  formPriority: string; setFormPriority: (v: string) => void;
  formDays: string[]; setFormDays: (v: string[]) => void;
  formHorario: string; setFormHorario: (v: string) => void;
  onSave: () => void; saving: boolean; missionId?: string;
}) {
  const { data: checklist } = useChecklistItems(missionId || '');
  const addItem = useAddChecklistItem();
  const toggleItem = useToggleChecklistItem();
  const deleteItem = useDeleteChecklistItem();
  const [newItem, setNewItem] = useState('');

  const toggleDay = (d: string) => {
    setFormDays(formDays.includes(d) ? formDays.filter((x) => x !== d) : [...formDays, d]);
  };

  const handleAddItem = async () => {
    if (!newItem.trim() || !missionId) return;
    await addItem.mutateAsync({ missionId, description: newItem.trim() });
    setNewItem('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-primary font-display">
            {isEditing ? '✏️ Editar Missão' : '📜 Nova Missão'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Title */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Título *</label>
            <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="Título da missão..." className="bg-secondary border-border" />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Descrição</label>
            <Textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="Descreva a missão..." className="bg-secondary border-border min-h-[60px]" />
          </div>

          {/* Attribute */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Atributo *</label>
            <Select value={formAttrId} onValueChange={setFormAttrId}>
              <SelectTrigger className="bg-secondary border-border">
                <SelectValue placeholder="Escolha o atributo" />
              </SelectTrigger>
              <SelectContent>
                {attrs.map((a: any) => (
                  <SelectItem key={a.id} value={a.id}>{a.icon} {a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Observações</label>
            <Textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Adicione observações sobre esta missão..." className="bg-secondary border-border min-h-[50px]" />
          </div>

          {/* Priority */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Prioridade</label>
            <div className="flex gap-2">
              {PRIORITIES.map((p) => {
                const Icon = p.icon;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setFormPriority(p.value)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border text-xs font-medium transition-all ${
                      formPriority === p.value ? `${p.color} ring-1 ring-current` : 'bg-secondary border-border text-muted-foreground'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Days */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Dias da Semana</label>
            <div className="flex gap-1.5 flex-wrap">
              {DAYS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(d)}
                  className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                    formDays.includes(d)
                      ? 'bg-primary/20 border-primary/50 text-primary'
                      : 'bg-secondary border-border text-muted-foreground'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Time */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Horário Provável</label>
            <div className="flex gap-1.5 flex-wrap">
              {TIMES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setFormHorario(t.value)}
                  className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                    formHorario === t.value
                      ? 'bg-primary/20 border-primary/50 text-primary'
                      : 'bg-secondary border-border text-muted-foreground'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Checklist (only in edit mode) */}
          {isEditing && missionId && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Sub-missões (+2 XP cada)</label>
              <div className="space-y-1.5">
                {checklist?.map((item: any) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <Checkbox
                      checked={item.completed}
                      onCheckedChange={() => toggleItem.mutate({ itemId: item.id, completed: !item.completed, xpBonus: item.xp_bonus })}
                    />
                    <span className={`text-xs flex-1 ${item.completed ? 'line-through text-muted-foreground' : ''}`}>{item.description}</span>
                    <span className="text-[10px] text-primary">+{item.xp_bonus} XP</span>
                    <button onClick={() => deleteItem.mutate(item.id)} className="text-destructive/60 hover:text-destructive">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Input
                    value={newItem}
                    onChange={(e) => setNewItem(e.target.value)}
                    placeholder="Adicionar item..."
                    className="h-7 text-xs bg-secondary border-border"
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddItem())}
                  />
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleAddItem} disabled={addItem.isPending}>
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* XP preview */}
          <div className="rpg-card bg-secondary/50 text-center">
            <p className="text-xs text-muted-foreground">Recompensa</p>
            <p className="text-primary font-bold">+25 XP</p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-border">Cancelar</Button>
          <Button onClick={onSave} disabled={saving || !formTitle.trim() || !formAttrId} className="bg-success text-success-foreground hover:bg-success/90">
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
            {isEditing ? 'Salvar' : 'Criar Missão'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
