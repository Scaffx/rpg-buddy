// src/pages/Missions.tsx
import { ATTRIBUTE_COLORS } from "@/lib/attributes";
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useMissions,
  useAttributes,
  useCreateMission,
  useCompleteMission,
  useChecklistItems,
  useAddChecklistItem,
  useToggleChecklistItem,
} from "@/hooks/useProfile";
import {
  useUpdateMission,
  useDeleteMission,
  useArchiveMission,
  useDeleteChecklistItem,
} from "@/hooks/useMissionActions";
import { useCheckFailedMissions, useFailedMissions, usePayPenalty, useAcceptPenalty, useWelcomeBackCheck } from "@/hooks/useFailedMissions";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Check,
  Loader2,
  Target,
  ChevronDown,
  ChevronUp,
  Search,
  X,
  Pencil,
  Trash2,
  Pause,
  Play,
  Sun,
  Moon,
  Sunrise,
  RotateCcw,
  Beer,
  Shield,
  Flame,
  Lock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useUndoMission } from '@/hooks/useUndoMission'; 

const DAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const DAYS_FULL = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

const TIMES = [
  { value: "manha", label: "🌅 Manhã", icon: Sunrise },
  { value: "tarde", label: "☀️ Tarde", icon: Sun },
  { value: "noite", label: "🌙 Noite", icon: Moon },
  { value: "flex", label: "🔄 Flex", icon: RotateCcw },
];

const PRIORITIES = [
  { value: "baixa", label: "Baixa", icon: Beer, color: "text-success border-success/50 bg-success/10" },
  { value: "media", label: "Média", icon: Shield, color: "text-yellow-400 border-yellow-400/50 bg-yellow-400/10" },
  { value: "alta", label: "Alta", icon: Flame, color: "text-destructive border-destructive/50 bg-destructive/10" },
];

const TABS = [
  { value: "pendentes", label: "Pendentes", color: "bg-yellow-400/20 text-yellow-400" },
  { value: "todas", label: "Todas", color: "bg-muted text-muted-foreground" },
  { value: "foco", label: "Foco do Dia", color: "bg-primary/20 text-primary" },
  { value: "concluidas", label: "Concluídas", color: "bg-success/20 text-success" },
];

// Importado de @/lib/attributes

const ATTRIBUTE_CATEGORIES = [
  { name: "Todos", emoji: "🎯" },
  { name: "Agilidade", emoji: "⚡" },
  { name: "Carisma", emoji: "👤" },
  { name: "Criatividade", emoji: "🎨" },
  { name: "Disciplina", emoji: "✨" },
  { name: "Força", emoji: "💪" },
  { name: "Inteligência", emoji: "🧠" },
  { name: "Resiliência", emoji: "🛡️" },
  { name: "Sabedoria", emoji: "📚" },
  { name: "Vitalidade", emoji: "❤️" },
  { name: "Autoaperfeiçoamento", emoji: "⭐" },
  { name: "Relacionamento", emoji: "💜" },
];

const STATUS_COLORS: Record<string, string> = {
  pendente: "bg-cyan-400",
  em_progresso: "bg-yellow-400",
  completa: "bg-success",
  arquivada: "bg-muted-foreground",
};

// ✅ FUNÇÃO AUXILIAR: Verificar se missão foi concluída hoje
function foiConcluidaHoje(mission: any): boolean {
  const today = new Date().toISOString().split("T")[0];
  const dailyStatus = mission.daily_status || {};
  return dailyStatus[today] === "completed";
}

// ✅ FUNÇÃO AUXILIAR: Obter próximo dia agendado
function obterProximoDiaAgendado(mission: any): string | null {
  const days = (mission.days_of_week as string[]) || [];
  if (days.length === 0) return null;

  const hoje = new Date();
  for (let i = 1; i <= 7; i++) {
    const proxima = new Date(hoje);
    proxima.setDate(proxima.getDate() + i);
    const diaSemana = DAYS[proxima.getDay() === 0 ? 6 : proxima.getDay() - 1];
    if (days.includes(diaSemana)) {
      return DAYS_FULL[proxima.getDay() === 0 ? 6 : proxima.getDay() - 1];
    }
  }
  return null;
}

export default function Missions() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("pendentes");
  const [selectedCategories, setSelectedCategories] = useState<string[]>(["Todos"]);
  const [expandedMission, setExpandedMission] = useState<string | null>(null);
  const [newChecklistText, setNewChecklistText] = useState("");

  // Modal states
  const [showCreateEdit, setShowCreateEdit] = useState(false);
  const [editingMission, setEditingMission] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formAttrId, setFormAttrId] = useState("");
  const [formSecondaryAttrIds, setFormSecondaryAttrIds] = useState<string[]>([]);
  const [formPriority, setFormPriority] = useState("media");
  const [formDays, setFormDays] = useState<string[]>([]);
  const [formHorario, setFormHorario] = useState<string | string[]>('flex');
  const [formMissionType, setFormMissionType] = useState<"recorrente" | "unica">("recorrente");
  const [formDueDate, setFormDueDate] = useState("");

  const { data: allMissions, isLoading } = useMissions();
  const { data: attrs } = useAttributes();
  const createMission = useCreateMission();
  const completeMission = useCompleteMission();
  const updateMission = useUpdateMission();
  const deleteMission = useDeleteMission();
  const archiveMission = useArchiveMission();
  const { toast } = useToast();

  useCheckFailedMissions();
  const { data: failedMissions = [] } = useFailedMissions();
  const payPenalty = usePayPenalty();
  const acceptPenalty = useAcceptPenalty();
  const { showWelcomeBack, setShowWelcomeBack, daysAway } = useWelcomeBackCheck();

  const todayDay = useMemo(() => {
    const d = new Date().getDay();
    return DAYS[d === 0 ? 6 : d - 1];
  }, []);

  // ✅ FILTRO ATUALIZADO: Separar "Hoje" de "Próximos Dias" + "Missões Únicas"
  const { todayMissions, nextDaysMissions, todayUniqueMissions, nextUniqueMissions, completedMissions } = useMemo(() => {
    if (!allMissions) return { todayMissions: [], nextDaysMissions: [], todayUniqueMissions: [], nextUniqueMissions: [], completedMissions: [] };

    let today: any[] = [];
    let nextDays: any[] = [];
    let todayUnique: any[] = [];
    let nextUnique: any[] = [];
    let completed: any[] = [];

    const hoje = new Date().toISOString().split('T')[0];

    allMissions.forEach((m: any) => {
      const days = (m.days_of_week as string[]) || [];
      const isDaily = days.length > 0;
      const isUnique = days.length === 0 && m.due_date; // Missão única tem due_date e não tem dias recorrentes
      const completedToday = foiConcluidaHoje(m);
      const isCompleted = m.completed || m.status === "arquivada";

      // Filtro por aba
      if (activeTab === "concluidas") {
        if (isCompleted || completedToday) {
          completed.push(m);
        }
        return;
      }

      if (activeTab === "todas") {
        if (!isCompleted) {
          if (isUnique) {
            if (m.due_date === hoje) {
              todayUnique.push(m);
            } else if (m.due_date > hoje) {
              nextUnique.push(m);
            }
          } else if (isDaily && completedToday) {
            nextDays.push(m);
          } else if (isDaily && !completedToday && days.includes(todayDay)) {
            today.push(m);
          } else if (isDaily && !completedToday && !days.includes(todayDay)) {
            nextDays.push(m);
          } else if (!isDaily && !isCompleted) {
            today.push(m);
          }
        }
        return;
      }

      if (activeTab === "foco") {
        if (isUnique && m.due_date === hoje) {
          todayUnique.push(m);
        } else if (isDaily && !completedToday && days.includes(todayDay)) {
          today.push(m);
        }
        return;
      }

      // Pendentes (padrão)
      if (isUnique) {
        if (m.due_date === hoje) {
          todayUnique.push(m);
        } else if (m.due_date > hoje) {
          nextUnique.push(m);
        }
      } else if (isDaily && completedToday) {
        nextDays.push(m);
      } else if (isDaily && !completedToday && days.includes(todayDay)) {
        today.push(m);
      } else if (isDaily && !completedToday && !days.includes(todayDay)) {
        nextDays.push(m);
      } else if (!isDaily && !isCompleted) {
        today.push(m);
      }
    });

    // Aplicar filtros de categoria e busca
    const filterMissions = (missions: any[]) => {
      let result = [...missions];

      if (!selectedCategories.includes("Todos")) {
        result = result.filter((m: any) => {
          const attrName = m.attributes?.name;
          const secondaryIds: string[] = (m as any).secondary_attribute_ids || [];
          const allAttrNames = [attrName];
          if (attrs && secondaryIds.length > 0) {
            secondaryIds.forEach((id: string) => {
              const a = attrs.find((at: any) => at.id === id);
              if (a) allAttrNames.push(a.name);
            });
          }
          return selectedCategories.some((c) => allAttrNames.includes(c));
        });
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        result = result.filter((m: any) => m.title.toLowerCase().includes(q));
      }

      const priorityOrder: Record<string, number> = { alta: 0, media: 1, baixa: 2 };
      result.sort(
        (a: any, b: any) => (priorityOrder[a.priority || "media"] ?? 1) - (priorityOrder[b.priority || "media"] ?? 1),
      );

      return result;
    };

    return {
      todayMissions: filterMissions(today),
      nextDaysMissions: filterMissions(nextDays),
      todayUniqueMissions: filterMissions(todayUnique),
      nextUniqueMissions: filterMissions(nextUnique),
      completedMissions: filterMissions(completed),
    };
  }, [allMissions, activeTab, selectedCategories, searchQuery, todayDay, attrs]);

  const toggleCategory = (cat: string) => {
    if (cat === "Todos") {
      setSelectedCategories(["Todos"]);
    } else {
      setSelectedCategories((prev) => {
        const without = prev.filter((c) => c !== "Todos");
        if (without.includes(cat)) {
          const next = without.filter((c) => c !== cat);
          return next.length === 0 ? ["Todos"] : next;
        }
        return [...without, cat];
      });
    }
  };

  const openCreateModal = () => {
    setEditingMission(null);
    setFormTitle("");
    setFormDescription("");
    setFormNotes("");
    setFormAttrId("");
    setFormSecondaryAttrIds([]);
    setFormPriority("media");
    setFormDays([]);
    setFormHorario("flex");
    setFormMissionType("recorrente");
    setFormDueDate("");
    setShowCreateEdit(true);
  };

const openEditModal = (m: any) => {
  setEditingMission(m);
  setFormTitle(m.title);
  setFormDescription(m.description || '');
  setFormNotes(m.notes || '');
  setFormAttrId(m.attribute_id);
  setFormSecondaryAttrIds((m as any).secondary_attribute_ids || []);
  setFormPriority(m.priority || 'media');
  setFormDays((m.days_of_week as string[]) || []);
  
  const horario = m.horario_provavel || 'flex';
  // Always parse comma-separated string into array
  if (typeof horario === 'string' && horario.includes(',')) {
    setFormHorario(horario.split(',').map((h: string) => h.trim()));
  } else if (Array.isArray(horario)) {
    setFormHorario(horario);
  } else {
    setFormHorario(horario);
  }
  
  // Determinar tipo de missão
  const days = (m.days_of_week as string[]) || [];
  const isMissionType = days.length === 0 && m.due_date ? "unica" : "recorrente";
  setFormMissionType(isMissionType);
  setFormDueDate(m.due_date || '');
  
  setShowCreateEdit(true);
};

const handleSave = async () => {
  if (!formTitle.trim() || !formAttrId) return;
  
  // Validação para missões únicas
  if (formMissionType === "unica" && !formDueDate) {
    toast({ title: 'Erro', description: 'Selecione uma data para missões únicas', variant: 'destructive' });
    return;
  }

  try {
    // ✅ Converter formHorario para o formato correto
    const horarioParaSalvar = Array.isArray(formHorario) 
      ? formHorario 
      : [formHorario].filter(Boolean);

    // Preparar dias de semana (vazio para missões únicas)
    const daysToSave = formMissionType === "unica" ? [] : formDays;

    if (editingMission) {
      await updateMission.mutateAsync({
        missionId: editingMission.id,
        updates: {
          title: formTitle.trim(),
          description: formDescription.trim() || undefined,
          notes: formNotes.trim() || undefined,
          attribute_id: formAttrId,
          priority: formPriority,
          days_of_week: daysToSave,
          due_date: formMissionType === "unica" ? formDueDate : null,
          horario_provavel: Array.isArray(horarioParaSalvar) ? horarioParaSalvar.join(',') : horarioParaSalvar,
          secondary_attribute_ids: formSecondaryAttrIds,
        },
      });
      toast({ title: '✏️ Missão atualizada!' });
    } else {
      await createMission.mutateAsync({
        title: formTitle.trim(),
        attributeId: formAttrId,
        daysOfWeek: daysToSave,
        dueDate: formMissionType === "unica" ? formDueDate : undefined,
        horarioProvavel: Array.isArray(horarioParaSalvar) ? horarioParaSalvar.join(',') : horarioParaSalvar,
        priority: formPriority,
        description: formDescription.trim() || undefined,
        notes: formNotes.trim() || undefined,
        secondaryAttributeIds: formSecondaryAttrIds,
      });
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
        secondaryAttributeIds: (mission as any).secondary_attribute_ids || [],
      });

      toast({
        title: "⚔️ Missão concluída!",
        description: `+${mission.xp_reward} XP ganhos! Próxima: ${obterProximoDiaAgendado(mission) || "Nenhum"}`,
      });
    } catch {
      toast({ title: "Erro", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMission.mutateAsync(id);
      setDeleteConfirm(null);
      toast({ title: "🗑️ Missão deletada com sucesso" });
    } catch {
      toast({ title: "Erro", variant: "destructive" });
    }
  };

  const handleArchive = async (id: string) => {
    try {
      await archiveMission.mutateAsync(id);
      toast({ title: "⏸️ Missão arquivada" });
    } catch {
      toast({ title: "Erro", variant: "destructive" });
    }
  };

  const handlePlay = async (mission: any) => {
    const newStatus = mission.status === "em_progresso" ? "pendente" : "em_progresso";

    try {
      await updateMission.mutateAsync({ missionId: mission.id, updates: { status: newStatus } });
      toast({
        title: newStatus === "em_progresso" ? "▶️ Missão iniciada!" : "⏸️ Missão pausada",
      });
    } catch {
      toast({ title: "Erro", variant: "destructive" });
    }
  };

  const TIME_GROUPS = [
    { key: "manha", label: "Manhã", icon: Sunrise },
    { key: "tarde", label: "Tarde", icon: Sun },
    { key: "noite", label: "Noite", icon: Moon },
    { key: "flex", label: "Flex", icon: RotateCcw },
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
          <Button
            onClick={openCreateModal}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            size="sm"
          >
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
            <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2">
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
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.value === "concluidas" && <Check className="w-3 h-3 inline mr-1" />}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Category filters */}
        <div className="flex gap-1.5 flex-wrap">
          {ATTRIBUTE_CATEGORIES.map((cat) => (
            <button
              key={cat.name}
              onClick={() => toggleCategory(cat.name)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors flex items-center gap-1.5 ${
                selectedCategories.includes(cat.name)
                  ? "bg-primary/20 border-primary/50 text-primary"
                  : "bg-secondary border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>{cat.emoji}</span>
              <span>{cat.name}</span>
            </button>
          ))}
        </div>

        {/* Welcome Back Dialog */}
        <Dialog open={showWelcomeBack} onOpenChange={setShowWelcomeBack}>
          <DialogContent className="rpg-card border-primary/30 max-w-md">
            <DialogHeader>
              <DialogTitle className="text-xl text-center">
                ⚔️ Sentimos sua falta, Herói!
              </DialogTitle>
            </DialogHeader>
            <div className="text-center space-y-3 py-4">
              <p className="text-6xl">🏰</p>
              <p className="text-sm text-muted-foreground">
                Você esteve ausente por <span className="font-bold text-primary">{daysAway} dias</span>.
              </p>
              <p className="text-sm text-muted-foreground">
                Inimigos se fortaleceram e missões ficaram pendentes! Volte à ação e recupere seu progresso.
              </p>
              {failedMissions.length > 0 && (
                <p className="text-xs text-destructive font-semibold">
                  🔥 {failedMissions.length} missão(ões) fracassada(s) aguardam sua decisão.
                </p>
              )}
            </div>
            <DialogFooter>
              <Button onClick={() => setShowWelcomeBack(false)} className="w-full">
                ⚔️ Voltar à Batalha!
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Failed Missions Section */}
        {failedMissions.length > 0 && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-destructive flex items-center gap-2">
                <Flame className="w-5 h-5" />
                🔥 MISSÕES FRACASSADAS ({failedMissions.length})
              </h3>
              {failedMissions.length > 1 && (
                <button
                  onClick={() => {
                    acceptPenalty.mutate(failedMissions, {
                      onSuccess: () => toast({ title: "✅ Todas as penalidades aceitas." }),
                      onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
                    });
                  }}
                  disabled={acceptPenalty.isPending}
                  className="text-xs px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 font-bold hover:bg-red-500/30 transition-colors disabled:opacity-50"
                >
                  {acceptPenalty.isPending ? <Loader2 className="w-3 h-3 inline mr-1 animate-spin" /> : null}
                  Aceitar Tudo (-{failedMissions.reduce((sum: number, m: any) => sum + (m.xp_penalized || m.xp_reward), 0)} XP)
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {failedMissions.map((m: any) => {
                const failedDate = m.failed_date
                  ? new Date(m.failed_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                  : 'Hoje';
                return (
                  <div
                    key={m.id}
                    className="bg-card border border-destructive/20 rounded-lg p-3 flex flex-col gap-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{m.title}</p>
                      <p className="text-xs text-destructive">XP Perdido: -{m.xp_penalized || m.xp_reward}</p>
                      <p className="text-xs text-muted-foreground">📅 {failedDate}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          payPenalty.mutate(m, {
                            onSuccess: () => toast({ title: "✅ Penalidade paga! XP restaurado." }),
                            onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
                          });
                        }}
                        disabled={payPenalty.isPending || acceptPenalty.isPending}
                        className="flex-1 text-xs px-2 py-1.5 rounded-lg bg-yellow-400/20 text-yellow-400 font-bold hover:bg-yellow-400/30 transition-colors disabled:opacity-50"
                      >
                        {payPenalty.isPending ? <Loader2 className="w-3 h-3 inline mr-1 animate-spin" /> : "💰"}
                        Pagar 10
                      </button>
                      <button
                        onClick={() => {
                          acceptPenalty.mutate(m, {
                            onSuccess: () => toast({ title: "✅ Penalidade aceita." }),
                            onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
                          });
                        }}
                        disabled={payPenalty.isPending || acceptPenalty.isPending}
                        className="flex-1 text-xs px-2 py-1.5 rounded-lg bg-red-500/20 text-red-400 font-bold hover:bg-red-500/30 transition-colors disabled:opacity-50"
                      >
                        {acceptPenalty.isPending ? <Loader2 className="w-3 h-3 inline mr-1 animate-spin" /> : "✓"}
                        Aceitar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ✅ SEÇÃO: MISSÕES DE HOJE */}
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : todayMissions.length === 0 && nextDaysMissions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhuma missão encontrada.</p>
        ) : (
          <>
            {/* HOJE */}
            {todayMissions.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-lg font-bold text-primary flex items-center gap-2">📅 Missões de Hoje</h2>

                {TIME_GROUPS.map(({ key, label, icon: Icon }) => {
                  const missions = todayMissions.filter((m: any) => {
                    const h = m.horario_provavel || 'flex';
                    const horarios = typeof h === 'string' && h.includes(',') ? h.split(',') : Array.isArray(h) ? h : [h];
                    return horarios.includes(key);
                  });
                  if (!missions || missions.length === 0) return null;

                  return (
                    <div key={key} className="space-y-2">
                      <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                        <Icon className="w-4 h-4" />
                        {label} ({missions.length})
                      </h3>

                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {missions.map((m: any, i: number) => (
                          <MissionCard
                            key={m.id}
                            mission={m}
                            attrs={attrs || []}
                            index={i}
                            expanded={expandedMission === m.id}
                            onToggle={() => setExpandedMission(expandedMission === m.id ? null : m.id)}
                            onComplete={() => handleComplete(m)}
                            onEdit={() => openEditModal(m)}
                            onDelete={() => setDeleteConfirm(m.id)}
                            onArchive={() => handleArchive(m.id)}
                            onPlay={() => handlePlay(m)}
                            completing={completeMission.isPending}
                            newChecklistText={expandedMission === m.id ? newChecklistText : ""}
                            onNewChecklistTextChange={setNewChecklistText}
                            isCompletedToday={false}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ✅ SEÇÃO: MISSÕES ÚNICAS */}
            {(todayUniqueMissions.length > 0 || nextUniqueMissions.length > 0) && (
              <div className="mt-8 pt-8 border-t border-border">
                {/* Únicas de Hoje */}
                {todayUniqueMissions.length > 0 && (
                  <div className="space-y-3 mb-8">
                    <h2 className="text-lg font-bold text-orange-400 flex items-center gap-2">
                      🎯 Missões Únicas de Hoje
                      <span className="text-xs bg-orange-400/20 text-orange-400 px-2 py-1 rounded-full">{todayUniqueMissions.length}</span>
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {todayUniqueMissions.map((m: any, i: number) => (
                        <MissionCard
                          key={m.id}
                          mission={m}
                          attrs={attrs || []}
                          index={i}
                          expanded={expandedMission === m.id}
                          onToggle={() => setExpandedMission(expandedMission === m.id ? null : m.id)}
                          onComplete={() => handleComplete(m)}
                          onEdit={() => openEditModal(m)}
                          onDelete={() => setDeleteConfirm(m.id)}
                          onArchive={() => handleArchive(m.id)}
                          onPlay={() => handlePlay(m)}
                          completing={completeMission.isPending}
                          newChecklistText={expandedMission === m.id ? newChecklistText : ""}
                          onNewChecklistTextChange={setNewChecklistText}
                          isCompletedToday={false}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Únicas dos Próximos Dias */}
                {nextUniqueMissions.length > 0 && (
                  <div className="space-y-3">
                    <h2 className="text-lg font-bold text-orange-300 flex items-center gap-2">
                      🗓️ Próximas Missões Únicas
                      <span className="text-xs bg-orange-400/20 text-orange-300 px-2 py-1 rounded-full">{nextUniqueMissions.length}</span>
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {nextUniqueMissions.map((m: any, i: number) => (
                        <MissionCard
                          key={m.id}
                          mission={m}
                          attrs={attrs || []}
                          index={i}
                          expanded={expandedMission === m.id}
                          onToggle={() => setExpandedMission(expandedMission === m.id ? null : m.id)}
                          onComplete={() => handleComplete(m)}
                          onEdit={() => openEditModal(m)}
                          onDelete={() => setDeleteConfirm(m.id)}
                          onArchive={() => handleArchive(m.id)}
                          onPlay={() => handlePlay(m)}
                          completing={completeMission.isPending}
                          newChecklistText={expandedMission === m.id ? newChecklistText : ""}
                          onNewChecklistTextChange={setNewChecklistText}
                          isCompletedToday={false}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ✅ PRÓXIMOS DIAS */}
            {nextDaysMissions.length > 0 && (
              <div className="space-y-3 mt-8 pt-8 border-t border-border">
                <h2 className="text-lg font-bold text-muted-foreground flex items-center gap-2">
                  📆 Próximos Dias
                  <span className="text-xs bg-muted px-2 py-1 rounded-full">{nextDaysMissions.length} missão(ões)</span>
                </h2>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {nextDaysMissions.map((m: any, i: number) => (
                    <MissionCard
                      key={m.id}
                      mission={m}
                      attrs={attrs || []}
                      index={i}
                      expanded={expandedMission === m.id}
                      onToggle={() => setExpandedMission(expandedMission === m.id ? null : m.id)}
                      onComplete={() => handleComplete(m)}
                      onEdit={() => openEditModal(m)}
                      onDelete={() => setDeleteConfirm(m.id)}
                      onArchive={() => handleArchive(m.id)}
                      onPlay={() => handlePlay(m)}
                      completing={completeMission.isPending}
                      newChecklistText={expandedMission === m.id ? newChecklistText : ""}
                      onNewChecklistTextChange={setNewChecklistText}
                      isCompletedToday={foiConcluidaHoje(m)}
                      proximoDia={obterProximoDiaAgendado(m)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* CONCLUÍDAS */}
            {activeTab === "concluidas" && completedMissions.length > 0 && (
              <div className="space-y-3 mt-8 pt-8 border-t border-border">
                <h2 className="text-lg font-bold text-success flex items-center gap-2">
                  ✅ Concluídas
                  <span className="text-xs bg-success/20 text-success px-2 py-1 rounded-full">
                    {completedMissions.length}
                  </span>
                </h2>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {completedMissions.map((m: any, i: number) => (
                    <MissionCard
                      key={m.id}
                      mission={m}
                      attrs={attrs || []}
                      index={i}
                      expanded={expandedMission === m.id}
                      onToggle={() => setExpandedMission(expandedMission === m.id ? null : m.id)}
                      onComplete={() => handleComplete(m)}
                      onEdit={() => openEditModal(m)}
                      onDelete={() => setDeleteConfirm(m.id)}
                      onArchive={() => handleArchive(m.id)}
                      onPlay={() => handlePlay(m)}
                      completing={completeMission.isPending}
                      newChecklistText={expandedMission === m.id ? newChecklistText : ""}
                      onNewChecklistTextChange={setNewChecklistText}
                      isCompletedToday={false}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

{/* Create/Edit Modal */}
<MissionFormModal
  open={showCreateEdit}
  onOpenChange={setShowCreateEdit}
  isEditing={!!editingMission}
  attrs={attrs || []}
  formTitle={formTitle}
  setFormTitle={setFormTitle}
  formDescription={formDescription}
  setFormDescription={setFormDescription}
  formNotes={formNotes}
  setFormNotes={setFormNotes}
  formAttrId={formAttrId}
  setFormAttrId={setFormAttrId}
  formSecondaryAttrIds={formSecondaryAttrIds}
  setFormSecondaryAttrIds={setFormSecondaryAttrIds}
  formPriority={formPriority}
  setFormPriority={setFormPriority}
  formDays={formDays}
  setFormDays={setFormDays}
  formHorario={formHorario}
  setFormHorario={setFormHorario}
  formMissionType={formMissionType}
  setFormMissionType={setFormMissionType}
  formDueDate={formDueDate}
  setFormDueDate={setFormDueDate}
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

/* ─── Attribute Chip ─── */
function AttributeChip({ name, icon }: { name: string; icon: string }) {
  const colorClass = ATTRIBUTE_COLORS[name] || "bg-secondary text-secondary-foreground border-border";

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-medium ${colorClass}`}
    >
      {icon} {name}
    </span>
  );
}

/* ─── Mission Card ─── */
function MissionCard({
  mission, attrs, index, expanded, onToggle, onComplete, onEdit, onDelete, onArchive, onPlay,
  completing, newChecklistText, onNewChecklistTextChange, isCompletedToday, proximoDia,
}: {
  mission: any; attrs: any[]; index: number; expanded: boolean;
  onToggle: () => void; onComplete: () => void; onEdit: () => void;
  onDelete: () => void; onArchive: () => void; onPlay: () => void;
  completing: boolean; newChecklistText: string; onNewChecklistTextChange: (v: string) => void;
  isCompletedToday: boolean; proximoDia?: string | null;
}) {
  const { data: checklist } = useChecklistItems(mission.id);
  const addItem = useAddChecklistItem();
  const toggleItem = useToggleChecklistItem();
  const deleteItem = useDeleteChecklistItem();
  const undoMission = useUndoMission();
  const { toast } = useToast();

  const days = (mission.days_of_week as string[]) || [];
  const completedCount = (checklist || []).filter((c: any) => c.completed).length;
  const totalCount = (checklist || []).length;
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const status = mission.status || 'pendente';
  const isCompleted = mission.completed;

  // Get all attributes for this mission
  const primaryAttr = mission.attributes;
  const secondaryIds: string[] = (mission as any).secondary_attribute_ids || [];
  const secondaryAttrs = attrs.filter((a) => secondaryIds.includes(a.id));

  const allMissionAttrs = [
    primaryAttr && { name: primaryAttr.name, icon: primaryAttr.icon },
    ...secondaryAttrs.map((a: any) => ({ name: a.name, icon: a.icon })),
  ].filter(Boolean);

  // ✅ CORRIGIDO: Processar múltiplos horários com verificação de tipo
  const horarios = (() => {
    const h = mission.horario_provavel;
    if (Array.isArray(h)) return h;
    if (typeof h === 'string' && h.includes(',')) return h.split(',').map((x: string) => x.trim());
    if (typeof h === 'string' && h) return [h];
    return [];
  })();

  const horariosFormatados = horarios.length > 0
    ? horarios.map((h: string) => {
        const horarioObj = TIMES.find((t) => t.value === h);
        return horarioObj?.label || h;
      })
    : [];

  const handleAddChecklist = async () => {
    if (!newChecklistText.trim()) return;

    try {
      await addItem.mutateAsync({ missionId: mission.id, description: newChecklistText.trim() });
      onNewChecklistTextChange('');
    } catch {
      toast({ title: 'Erro', variant: 'destructive' });
    }
  };

  const handleUndo = async () => {
    try {
      await undoMission.mutateAsync(mission.id);
    } catch (error) {
      console.error('Erro ao desfazer:', error);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className={`rounded-xl bg-card border border-border p-3 flex flex-col justify-between aspect-square ${
        isCompleted ? 'opacity-60' : isCompletedToday ? 'opacity-75 border-yellow-400/50' : ''
      }`}
    >
      {/* Top: Status dot + icons */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className={`w-3 h-3 rounded-full shrink-0 ${STATUS_COLORS[status] || 'bg-cyan-400'}`} />
          <div className="flex items-center gap-0.5">
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-primary" onClick={onEdit}>
              <Pencil className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={onDelete}>
              <Trash2 className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground" onClick={onArchive}>
              <Pause className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Title */}
        <p className={`font-display font-bold text-base text-foreground leading-tight line-clamp-2 ${isCompleted ? 'line-through' : ''}`}>
          {mission.title}
        </p>

        {/* Description */}
        {mission.description && (
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{mission.description}</p>
        )}

        {/* ✅ Status: Concluída Hoje */}
        {isCompletedToday && (
          <div className="mt-2 p-2 bg-yellow-400/10 border border-yellow-400/30 rounded-md space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-yellow-400 font-semibold flex items-center gap-1">
                <Check className="w-3 h-3" />
                Concluída hoje
              </p>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleUndo}
                disabled={undoMission.isPending}
                className="h-6 w-6 p-0 text-yellow-400 hover:text-yellow-500 hover:bg-yellow-400/20"
                title="Desfazer conclusão"
              >
                <RotateCcw className="w-3 h-3" />
              </Button>
            </div>
            {proximoDia && (
              <p className="text-xs text-yellow-400/70">
                Próxima: {proximoDia}
              </p>
            )}
          </div>
        )}

        {/* Sub-missions */}
        {totalCount > 0 && (
          <div className="mt-2">
            <p className="text-xs text-muted-foreground">Sub-missões: {completedCount}/{totalCount}</p>
            <Progress value={progressPercent} className="h-1.5 mt-1" />
          </div>
        )}
      </div>

      {/* Bottom: Tags + actions */}
      <div className="mt-auto pt-2 space-y-2">
        {/* Attribute chips */}
        <div className="flex items-center gap-1 flex-wrap">
          {days.length > 0 && (
            <span className="text-xs font-medium bg-primary/15 text-primary px-2 py-0.5 rounded">📅 Diária</span>
          )}
          {mission.due_date && days.length === 0 && (
            <span className="text-xs font-medium bg-orange-400/15 text-orange-400 px-2 py-0.5 rounded">🎯 Única</span>
          )}
          {allMissionAttrs.map((a: any, idx: number) => (
            <AttributeChip key={idx} name={a.name} icon={a.icon} />
          ))}
        </div>

        {/* ✅ Horários Prováveis */}
        {horariosFormatados.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap text-xs">
            <span className="text-muted-foreground">⏰</span>
            <span className="text-muted-foreground">{horariosFormatados.join(' / ')}</span>
          </div>
        )}

        {/* XP + Date */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-primary font-bold">✨ +{mission.xp_reward} XP</span>
          <span className="text-xs text-muted-foreground">
            {mission.due_date && days.length === 0
              ? `🎯 ${new Date(mission.due_date + 'T00:00:00').toLocaleDateString('pt-BR')}`
              : new Date(mission.created_at).toLocaleDateString('pt-BR')}
          </span>
        </div>

        {/* Buttons */}
        {!isCompleted && (
          <div className="flex gap-2">
            <Button
              onClick={onComplete}
              disabled={completing || isCompletedToday}
              className={`flex-1 h-9 rounded-lg text-sm font-semibold border transition-all ${
                isCompletedToday
                  ? 'bg-muted text-muted-foreground border-border cursor-not-allowed opacity-50'
                  : 'bg-primary/15 text-primary hover:bg-primary/25 border border-primary/30'
              }`}
              title={isCompletedToday ? 'Missão já concluída hoje' : 'Completar missão'}
            >
              {isCompletedToday ? (
                <>
                  <Lock className="w-4 h-4 mr-1" /> Bloqueada
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-1" /> Completar
                </>
              )}
            </Button>

            <Button
              onClick={onPlay}
              disabled={isCompletedToday}
              className={`h-9 w-10 rounded-lg p-0 border transition-all ${
                isCompletedToday
                  ? 'bg-muted text-muted-foreground border-border cursor-not-allowed opacity-50'
                  : 'bg-primary/10 text-primary hover:bg-primary/20 border border-primary/30'
              }`}
            >
              {status === 'em_progresso' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </Button>
          </div>
        )}

        {/* Expand */}
        <button onClick={onToggle} className="w-full flex justify-center text-muted-foreground hover:text-foreground">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
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
  formSecondaryAttrIds, setFormSecondaryAttrIds,
  formPriority, setFormPriority, formDays, setFormDays,
  formHorario, setFormHorario, formMissionType, setFormMissionType,
  formDueDate, setFormDueDate, onSave, saving, missionId,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; isEditing: boolean; attrs: any[];
  formTitle: string; setFormTitle: (v: string) => void;
  formDescription: string; setFormDescription: (v: string) => void;
  formNotes: string; setFormNotes: (v: string) => void;
  formAttrId: string; setFormAttrId: (v: string) => void;
  formSecondaryAttrIds: string[]; setFormSecondaryAttrIds: (v: string[]) => void;
  formPriority: string; setFormPriority: (v: string) => void;
  formDays: string[]; setFormDays: (v: string[]) => void;
  formHorario: string | string[]; setFormHorario: (v: string | string[]) => void;
  formMissionType: "recorrente" | "unica"; setFormMissionType: (v: "recorrente" | "unica") => void;
  formDueDate: string; setFormDueDate: (v: string) => void;
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

  // ✅ NOVO: Alternar múltiplos horários (até 2)
  const toggleHorario = (h: string) => {
    const horarios = Array.isArray(formHorario) ? formHorario : [formHorario].filter(Boolean);
    
    if (horarios.includes(h)) {
      const updated = horarios.filter((x) => x !== h);
      setFormHorario(updated.length === 0 ? 'flex' : updated.length === 1 ? updated[0] : updated);
    } else if (horarios.length < 2) {
      setFormHorario([...horarios, h]);
    }
  };

  const toggleSecondaryAttr = (attrId: string) => {
    if (attrId === formAttrId) return;

    if (formSecondaryAttrIds.includes(attrId)) {
      setFormSecondaryAttrIds(formSecondaryAttrIds.filter((id) => id !== attrId));
    } else if (formSecondaryAttrIds.length < 2) {
      setFormSecondaryAttrIds([...formSecondaryAttrIds, attrId]);
    }
  };

  const handleAddItem = async () => {
    if (!newItem.trim() || !missionId) return;

    await addItem.mutateAsync({ missionId, description: newItem.trim() });
    setNewItem('');
  };

  const allSelectedIds = [formAttrId, ...formSecondaryAttrIds].filter(Boolean);
  const horariosArray = Array.isArray(formHorario) ? formHorario : [formHorario].filter(Boolean);

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

          {/* Primary Attribute */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Atributo Principal *</label>
            <Select value={formAttrId} onValueChange={(v) => {
              setFormAttrId(v);
              setFormSecondaryAttrIds(formSecondaryAttrIds.filter((id) => id !== v));
            }}>
              <SelectTrigger className="bg-secondary border-border">
                <SelectValue placeholder="Escolha o atributo principal" />
              </SelectTrigger>
              <SelectContent>
                {attrs.map((a: any) => (
                  <SelectItem key={a.id} value={a.id}>{a.icon} {a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Secondary Attributes (up to 2 more) */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Atributos Secundários (até 2)
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {attrs.map((a: any) => {
                const isPrimary = a.id === formAttrId;
                const isSelected = formSecondaryAttrIds.includes(a.id);
                const colorClass = ATTRIBUTE_COLORS[a.name] || 'bg-secondary text-secondary-foreground border-border';

                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => toggleSecondaryAttr(a.id)}
                    disabled={isPrimary}
                    className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                      isPrimary
                        ? 'opacity-30 cursor-not-allowed bg-secondary border-border text-muted-foreground'
                        : isSelected
                          ? `${colorClass} ring-1 ring-current`
                          : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {a.icon} {a.name}
                  </button>
                );
              })}
            </div>

            {allSelectedIds.length > 0 && (
              <div className="flex gap-1 mt-2 flex-wrap">
                {allSelectedIds.map((id) => {
                  const a = attrs.find((at: any) => at.id === id);
                  if (!a) return null;
                  return <AttributeChip key={id} name={a.name} icon={a.icon} />;
                })}
              </div>
            )}
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

          {/* ✅ NOVO: Tipo de Missão */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Tipo de Missão</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFormMissionType("recorrente")}
                className={`flex-1 px-3 py-2 rounded-md border text-xs font-medium transition-all ${
                  formMissionType === "recorrente"
                    ? 'bg-cyan-400/20 border-cyan-400/50 text-cyan-400 ring-1 ring-cyan-400'
                    : 'bg-secondary border-border text-muted-foreground'
                }`}
              >
                📅 Recorrente
              </button>
              <button
                type="button"
                onClick={() => setFormMissionType("unica")}
                className={`flex-1 px-3 py-2 rounded-md border text-xs font-medium transition-all ${
                  formMissionType === "unica"
                    ? 'bg-orange-400/20 border-orange-400/50 text-orange-400 ring-1 ring-orange-400'
                    : 'bg-secondary border-border text-muted-foreground'
                }`}
              >
                🎯 Única
              </button>
            </div>
          </div>

          {/* Days (only for recorrente) */}
          {formMissionType === "recorrente" && (
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
          )}

          {/* Due Date (only for unica) */}
          {formMissionType === "unica" && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Data de Conclusão *</label>
              <Input
                type="date"
                value={formDueDate}
                onChange={(e) => setFormDueDate(e.target.value)}
                className="bg-secondary border-border"
              />
            </div>
          )}

          {/* ✅ NOVO: Time (até 2 horários) */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Horário Provável (até 2)</label>
            <div className="flex gap-1.5 flex-wrap">
              {TIMES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => toggleHorario(t.value)}
                  disabled={horariosArray.length >= 2 && !horariosArray.includes(t.value)}
                  className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                    horariosArray.includes(t.value)
                      ? 'bg-primary/20 border-primary/50 text-primary'
                      : horariosArray.length >= 2
                        ? 'opacity-50 cursor-not-allowed bg-secondary border-border text-muted-foreground'
                        : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {horariosArray.length > 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                Selecionados: {horariosArray.map((h) => TIMES.find((t) => t.value === h)?.label).join(' + ')}
              </p>
            )}
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