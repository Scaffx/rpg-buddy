import { useMemo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProfile, useClasses, useSelectClass } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';
import { useAddGold } from '@/hooks/useGold';
import AppLayout from '@/components/AppLayout';
import { Loader2, Lock, Check, Swords, ChevronDown, ChevronRight, ArrowDown, Gift } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

interface ClassNode {
  id: string;
  name: string;
  icon: string;
  description: string | null;
  column_index: number;
  column_label: string;
  level_min: number;
  level_max: number;
  parent_class_id: string | null;
  children: ClassNode[];
}

const tierColors: Record<number, { bg: string; border: string; label: string }> = {
  1: { bg: 'bg-muted/60', border: 'border-muted-foreground/30', label: 'Início' },
  2: { bg: 'bg-blue-950/40', border: 'border-blue-500/30', label: 'Classe 1' },
  3: { bg: 'bg-emerald-950/40', border: 'border-emerald-500/30', label: 'Classe 2' },
  4: { bg: 'bg-purple-950/40', border: 'border-purple-500/30', label: 'Transclasse' },
  5: { bg: 'bg-orange-950/40', border: 'border-orange-500/30', label: 'Classe 3' },
  6: { bg: 'bg-red-950/40', border: 'border-red-500/30', label: 'Classe 4' },
};

const tierGlows: Record<number, string> = {
  2: '0 0 12px hsl(210 80% 50% / 0.2)',
  3: '0 0 12px hsl(142 70% 45% / 0.2)',
  4: '0 0 12px hsl(270 60% 55% / 0.2)',
  5: '0 0 12px hsl(25 80% 50% / 0.2)',
  6: '0 0 12px hsl(0 72% 51% / 0.2)',
};

// Maps onboarding starter_class id to the class name in the progression tree
const STARTER_TO_CLASS_NAME: Record<string, string> = {
  guerreiro: 'Espadachim',
  mago: 'Mago',
  gatuno: 'Gatuno',
  clerico: 'Noviço',
  arqueiro: 'Arqueiro',
  ferreiro: 'Mercador',
};

// Reverse map: class name in the tree → starter_class id
const CLASS_NAME_TO_STARTER: Record<string, string> = Object.fromEntries(
  Object.entries(STARTER_TO_CLASS_NAME).map(([k, v]) => [v, k])
);

export default function ClassesPage() {
  const { data: profile, isLoading: pLoading } = useProfile();
  const { data: classes, isLoading: cLoading } = useClasses();
  const selectClass = useSelectClass();
  const { user } = useAuth();
  const addGold = useAddGold();
  const { toast } = useToast();
  const [selecting, setSelecting] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<ClassNode | null>(null);
  const [expandedBranches, setExpandedBranches] = useState<Set<string>>(new Set());
  const [claimingReward, setClaimingReward] = useState(false);

  // Get starter_class from profile or localStorage
  const starterClass = useMemo(() => {
    if (!user) return null;
    const fromProfile = (profile as any)?.starter_class;
    if (fromProfile) return fromProfile as string;
    return localStorage.getItem(`starter_class_v1_${user.id}`);
  }, [profile, user]);

  // Check if class reward was already claimed
  const rewardClaimed = useMemo(() => {
    if (!user) return false;
    return localStorage.getItem(`class_reward_claimed_${user.id}`) === 'true';
  }, [user]);

  // Build tree from flat list
  const tree = useMemo(() => {
    if (!classes) return null;
    const map = new Map<string, ClassNode>();
    classes.forEach((c: any) => map.set(c.id, { ...c, children: [] }));
    let root: ClassNode | null = null;
    map.forEach((node) => {
      if (node.parent_class_id && map.has(node.parent_class_id)) {
        map.get(node.parent_class_id)!.children.push(node);
      }
      if (node.column_index === 1) root = node;
    });
    return root;
  }, [classes]);

  // Find the ancestry path of the currently selected class
  const currentClassPath = useMemo(() => {
    if (!profile?.current_class_id || !classes) return new Set<string>();
    const map = new Map<string, any>();
    classes.forEach((c: any) => map.set(c.id, c));
    const path = new Set<string>();
    let current = map.get(profile.current_class_id);
    while (current) {
      path.add(current.id);
      current = current.parent_class_id ? map.get(current.parent_class_id) : null;
    }
    return path;
  }, [profile, classes]);

  // Compute the golden path from root to the starter class node
  const { goldenPath, goldenTargetId } = useMemo(() => {
    if (!starterClass || !classes) return { goldenPath: new Set<string>(), goldenTargetId: null as string | null };
    const targetName = STARTER_TO_CLASS_NAME[starterClass];
    if (!targetName) return { goldenPath: new Set<string>(), goldenTargetId: null as string | null };

    const map = new Map<string, any>();
    classes.forEach((c: any) => map.set(c.id, c));

    // Find the target class node by name
    let targetNode: any = null;
    for (const c of classes) {
      if ((c as any).name === targetName) { targetNode = c; break; }
    }
    if (!targetNode) return { goldenPath: new Set<string>(), goldenTargetId: null as string | null };

    const path = new Set<string>();
    let current = targetNode;
    while (current) {
      path.add(current.id);
      current = current.parent_class_id ? map.get(current.parent_class_id) : null;
    }
    return { goldenPath: path, goldenTargetId: targetNode.id as string };
  }, [starterClass, classes]);

  const userLevel = profile?.level || 1;

  const toggleBranch = useCallback((id: string) => {
    setExpandedBranches(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelect = async (classId: string, className: string) => {
    if (profile?.current_class_id) {
      toast({ title: '🔒 Classe bloqueada', description: 'Sua classe já foi selecionada e não pode ser alterada.', variant: 'destructive' });
      return;
    }
    setSelecting(classId);
    try {
      // Resolve the starter_class id by walking up to the tier-2 ancestor
      const classMap = new Map<string, any>();
      (classes || []).forEach((c: any) => classMap.set(c.id, c));
      let node = classMap.get(classId);
      while (node && node.column_index > 2) {
        node = node.parent_class_id ? classMap.get(node.parent_class_id) : null;
      }
      const starterClass = node?.column_index === 2
        ? CLASS_NAME_TO_STARTER[node.name]
        : undefined;

      await selectClass.mutateAsync({ classId, starterClass });
      toast({ title: `🎉 Classe selecionada: ${className}!` });
      setSelectedDetail(null);
    } catch {
      toast({ title: 'Erro ao selecionar classe', variant: 'destructive' });
    } finally {
      setSelecting(null);
    }
  };

  const handleClaimReward = async () => {
    if (!user || rewardClaimed || claimingReward) return;
    setClaimingReward(true);
    try {
      await addGold.mutateAsync({ amount: 50, reason: 'Recompensa de classe inicial', type: 'class_reward' });
      localStorage.setItem(`class_reward_claimed_${user.id}`, 'true');
      toast({ title: '🎉 Recompensa coletada!', description: '+50 moedas de ouro!' });
      setSelectedDetail(null);
    } catch {
      toast({ title: 'Erro ao coletar recompensa', variant: 'destructive' });
    } finally {
      setClaimingReward(false);
    }
  };

  if (pLoading || cLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  const renderNode = (node: ClassNode, depth: number = 0): React.ReactNode => {
    const unlocked = userLevel >= node.level_min;
    const isSelected = profile?.current_class_id === node.id;
    const isInPath = currentClassPath.has(node.id);
    const isInGoldenPath = goldenPath.has(node.id);
    const isGoldenTarget = node.id === goldenTargetId;
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedBranches.has(node.id) || isInPath || isInGoldenPath;
    const tier = tierColors[node.column_index] || tierColors[1];
    const canClaimReward = isGoldenTarget && unlocked && !rewardClaimed;

    return (
      <div key={node.id} className="flex flex-col items-center">
        {/* Node card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={isGoldenTarget ? {
            opacity: 1,
            scale: [1, 1.05, 1],
            borderColor: ['hsl(45, 100%, 50%)', 'hsl(45, 100%, 70%)', 'hsl(45, 100%, 50%)'],
          } : { opacity: 1, scale: 1 }}
          transition={isGoldenTarget ? {
            delay: depth * 0.05,
            scale: { repeat: Infinity, duration: 2, ease: 'easeInOut' },
            borderColor: { repeat: Infinity, duration: 2, ease: 'easeInOut' },
          } : { delay: depth * 0.05 }}
          className={`
            relative rounded-xl border-2 p-3 w-36 cursor-pointer transition-all duration-200
            ${tier.bg} ${isGoldenTarget ? 'border-yellow-400' : tier.border}
            ${!unlocked ? 'opacity-35 grayscale' : 'hover:scale-105'}
            ${isSelected ? 'border-primary ring-2 ring-primary/30' : ''}
            ${isInGoldenPath && !isGoldenTarget ? 'border-yellow-500/60' : ''}
          `}
          style={
            isGoldenTarget
              ? { boxShadow: '0 0 20px hsl(45 100% 50% / 0.5), 0 0 40px hsl(45 100% 50% / 0.2)' }
              : isSelected
                ? { boxShadow: 'var(--glow-gold)' }
                : isInGoldenPath
                  ? { boxShadow: '0 0 10px hsl(45 100% 50% / 0.25)' }
                  : unlocked && tierGlows[node.column_index]
                    ? { boxShadow: tierGlows[node.column_index] }
                    : {}
          }
          onClick={() => unlocked && setSelectedDetail(node)}
        >
          <div className="text-center space-y-1">
            <span className="text-2xl block">{node.icon}</span>
            <p className="text-xs font-display font-bold text-foreground leading-tight">{node.name}</p>
            <p className="text-[9px] text-muted-foreground">
              Nv. {node.level_min}{node.level_max < 99 ? `–${node.level_max}` : '+'}
            </p>
            {isSelected && (
              <span className="inline-flex items-center gap-0.5 text-[9px] text-primary font-bold">
                <Check className="w-2.5 h-2.5" /> Atual
              </span>
            )}
            {isGoldenTarget && !isSelected && (
              <span className="inline-flex items-center gap-0.5 text-[9px] text-yellow-400 font-bold">
                ⭐ Sua classe
              </span>
            )}
            {canClaimReward && (
              <span className="inline-flex items-center gap-0.5 text-[9px] text-yellow-300 font-bold animate-pulse">
                <Gift className="w-2.5 h-2.5" /> Recompensa!
              </span>
            )}
            {!unlocked && (
              <span className="inline-flex items-center gap-0.5 text-[9px] text-muted-foreground">
                <Lock className="w-2.5 h-2.5" /> Nv. {node.level_min}
              </span>
            )}
          </div>

          {/* Expand toggle */}
          {hasChildren && unlocked && (
            <button
              onClick={(e) => { e.stopPropagation(); toggleBranch(node.id); }}
              className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-secondary border border-border rounded-full p-0.5 hover:bg-accent transition-colors z-10"
            >
              {isExpanded ? <ChevronDown className="w-3 h-3 text-foreground" /> : <ChevronRight className="w-3 h-3 text-foreground" />}
            </button>
          )}
        </motion.div>

        {/* Children */}
        <AnimatePresence>
          {hasChildren && isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex flex-col items-center mt-1"
            >
              {/* Connector line */}
              <div className={`w-px h-6 ${isInGoldenPath ? 'bg-yellow-400' : 'bg-border'}`} />

              {/* Branch lines + children */}
              <div className="relative flex gap-2">
                {/* Horizontal connector */}
                {node.children.length > 1 && (
                  <div
                    className="absolute top-0 h-px bg-border"
                    style={{
                      left: `calc(50% / ${node.children.length})`,
                      right: `calc(50% / ${node.children.length})`,
                    }}
                  />
                )}
                {node.children.map((child) => (
                  <div key={child.id} className="flex flex-col items-center">
                    <div className={`w-px h-4 ${goldenPath.has(child.id) ? 'bg-yellow-400' : 'bg-border'}`} />
                    {renderNode(child, depth + 1)}
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Swords className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-display font-bold text-primary text-glow">
            Árvore de Classes
          </h1>
        </div>

        <p className="text-sm text-muted-foreground">
          Nível atual: <span className="text-primary font-bold">{userLevel}</span> — Clique em uma classe desbloqueada para ver detalhes.
        </p>

        {/* Legend */}
        <div className="flex flex-wrap gap-2">
          {Object.entries(tierColors).map(([idx, t]) => (
            <span key={idx} className={`text-[10px] px-2 py-0.5 rounded-full border ${t.bg} ${t.border} text-foreground`}>
              {t.label}
            </span>
          ))}
        </div>

        {/* Tree */}
        <div className="overflow-x-auto pb-8">
          <div className="flex justify-center min-w-[400px] sm:min-w-[600px] py-4">
            {tree && renderNode(tree)}
          </div>
        </div>
      </div>

      {/* Detail modal */}
      <Dialog open={!!selectedDetail} onOpenChange={() => setSelectedDetail(null)}>
        <DialogContent className="bg-card border-border max-w-md">
          {selectedDetail && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <span className="text-4xl">{selectedDetail.icon}</span>
                  <div>
                    <DialogTitle className="font-display text-xl text-foreground">{selectedDetail.name}</DialogTitle>
                    <DialogDescription className="text-muted-foreground text-xs">
                      {tierColors[selectedDetail.column_index]?.label} • Nível {selectedDetail.level_min}
                      {selectedDetail.level_max < 99 ? `–${selectedDetail.level_max}` : '+'}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-4 mt-2">
                <p className="text-sm text-foreground/80">{selectedDetail.description}</p>

                {/* Next evolutions */}
                {selectedDetail.children.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-muted-foreground mb-2">Próximas evoluções:</p>
                    <div className="flex gap-2">
                      {selectedDetail.children.map((child) => (
                        <div key={child.id} className={`flex-1 rounded-lg border p-2 text-center ${tierColors[child.column_index]?.bg} ${tierColors[child.column_index]?.border}`}>
                          <span className="text-xl block">{child.icon}</span>
                          <p className="text-[10px] font-display font-bold text-foreground mt-1">{child.name}</p>
                          <p className="text-[9px] text-muted-foreground">Nv. {child.level_min}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action button */}
                {selectedDetail.id === goldenTargetId && userLevel >= selectedDetail.level_min && !rewardClaimed ? (
                  <Button
                    className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold"
                    onClick={handleClaimReward}
                    disabled={claimingReward}
                  >
                    {claimingReward ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Gift className="w-4 h-4 mr-2" />
                    )}
                    Recolher Recompensa (50 🪙)
                  </Button>
                ) : profile?.current_class_id === selectedDetail.id ? (
                  <div className="flex items-center justify-center gap-1 text-sm text-primary font-bold py-2">
                    <Check className="w-4 h-4" /> Classe Atual
                  </div>
                ) : profile?.current_class_id ? (
                  <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground py-2">
                    <Lock className="w-4 h-4" /> Classe selecionada — não é possível trocar
                  </div>
                ) : userLevel >= selectedDetail.level_min ? (
                  <Button
                    className="w-full"
                    onClick={() => handleSelect(selectedDetail.id, selectedDetail.name)}
                    disabled={selecting === selectedDetail.id}
                  >
                    {selecting === selectedDetail.id ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : null}
                    Selecionar {selectedDetail.name}
                  </Button>
                ) : (
                  <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground py-2">
                    <Lock className="w-4 h-4" /> Desbloqueável no nível {selectedDetail.level_min}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
