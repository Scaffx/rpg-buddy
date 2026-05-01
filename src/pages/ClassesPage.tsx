import { useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { useProfile, useClasses, useSelectClass } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';
import { useAddGold } from '@/hooks/useGold';
import { useClaimClassKit } from '@/hooks/useInventory';
import AppLayout from '@/components/AppLayout';
import { Loader2, Lock, Check, Swords, ChevronDown, ChevronRight, ArrowDown, Gift, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { getClassProfileByTreeName, type ClassProfile } from '@/lib/classProfiles';

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
  const { t } = useTranslation();
  const { data: profile, isLoading: pLoading } = useProfile();
  const { data: classes, isLoading: cLoading } = useClasses();
  const selectClass = useSelectClass();
  const claimClassKit = useClaimClassKit();
  const { user } = useAuth();
  const addGold = useAddGold();
  const { toast } = useToast();
  const [selecting, setSelecting] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<ClassNode | null>(null);
  const [expandedBranches, setExpandedBranches] = useState<Set<string>>(new Set());
  const [claimingReward, setClaimingReward] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<{
    classId: string;
    className: string;
    profile: ClassProfile | null;
    baseName: string;
  } | null>(null);

  // Get starter_class from profile or localStorage
  const starterClass = useMemo(() => {
    if (!user) return null;
    const fromProfile = (profile as any)?.starter_class;
    if (fromProfile) return fromProfile as string;
    return localStorage.getItem(`starter_class_v1_${user.id}`);
  }, [profile, user]);

  // Check if class reward was already claimed
  const [rewardClaimed, setRewardClaimed] = useState(() => {
    if (!user) return false;
    return localStorage.getItem(`class_reward_claimed_${user?.id}`) === 'true';
  });

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
    if (!classes) return { goldenPath: new Set<string>(), goldenTargetId: null as string | null };

    const map = new Map<string, any>();
    classes.forEach((c: any) => map.set(c.id, c));

    // If user already selected a class, highlight only that branch (avoids showing two branches)
    if (profile?.current_class_id) {
      const path = new Set<string>();
      let current = map.get(profile.current_class_id);
      while (current) {
        path.add(current.id);
        current = current.parent_class_id ? map.get(current.parent_class_id) : null;
      }
      return { goldenPath: path, goldenTargetId: profile.current_class_id as string };
    }

    if (!starterClass) return { goldenPath: new Set<string>(), goldenTargetId: null as string | null };
    const targetName = STARTER_TO_CLASS_NAME[starterClass];
    if (!targetName) return { goldenPath: new Set<string>(), goldenTargetId: null as string | null };

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
  }, [starterClass, classes, profile?.current_class_id]);

  const userLevel = profile?.level || 1;

  const toggleBranch = useCallback((id: string) => {
    setExpandedBranches(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Resolve o ancestral tier-2 (classe-base) de uma classe qualquer
  const resolveBaseClass = useCallback(
    (classId: string) => {
      const classMap = new Map<string, any>();
      (classes || []).forEach((c: any) => classMap.set(c.id, c));
      let node = classMap.get(classId);
      while (node && node.column_index > 2) {
        node = node.parent_class_id ? classMap.get(node.parent_class_id) : null;
      }
      return node?.column_index === 2 ? node : null;
    },
    [classes],
  );

  // 1ª etapa: clicar em "Selecionar" abre o modal de confirmação com o perfil moderno
  const handleSelect = (classId: string, className: string) => {
    if (profile?.current_class_id) {
      toast({ title: `🔒 ${t('app.classes.locked_toast')}`, description: t('app.classes.locked_toast_desc'), variant: 'destructive' });
      return;
    }
    const baseNode = resolveBaseClass(classId);
    const baseName = baseNode?.name || className;
    const moderno = baseName ? getClassProfileByTreeName(baseName) : null;
    setPendingConfirm({ classId, className, profile: moderno, baseName });
  };

  // 2ª etapa: usuário confirma — só agora aplica de fato
  const confirmAndSelect = async () => {
    if (!pendingConfirm) return;
    const { classId, className } = pendingConfirm;
    setSelecting(classId);
    try {
      const baseNode = resolveBaseClass(classId);
      const starterClass = baseNode ? CLASS_NAME_TO_STARTER[baseNode.name] : undefined;

      await selectClass.mutateAsync({ classId, starterClass });

      // Fecha modais IMEDIATAMENTE após salvar a classe com sucesso.
      // Assim, mesmo que a etapa seguinte (kit) falhe, o usuário não fica
      // com a impressão de que a seleção falhou.
      setPendingConfirm(null);
      setSelectedDetail(null);

      if (starterClass) {
        try {
          await claimClassKit.mutateAsync(starterClass);
          toast({ title: `🎁 ${t('app.classes.kit_received', { name: className })}`, description: t('app.classes.kit_received_desc') });
        } catch {
          // Kit pode não existir ou já ter sido reivindicado — classe já foi selecionada, não é erro crítico
          toast({ title: `🎉 ${t('app.classes.class_selected', { name: className })}` });
        }
      } else {
        toast({ title: `🎉 ${t('app.classes.class_selected', { name: className })}` });
      }
    } catch (err) {
      toast({ title: t('app.classes.error_select'), description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
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
      setRewardClaimed(true);
      toast({ title: `🎉 ${t('app.classes.reward_collected')}`, description: t('app.classes.reward_collected_desc') });
      setSelectedDetail(null);
    } catch {
      toast({ title: t('app.classes.error_reward'), variant: 'destructive' });
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
                ⭐ Sugerida
              </span>
            )}
            {canClaimReward && (
              <span className="inline-flex items-center gap-0.5 text-[9px] text-yellow-300 font-bold animate-pulse">
                <Gift className="w-2.5 h-2.5" /> Recompensa!
              </span>
            )}
            {isGoldenTarget && !isSelected && !profile?.current_class_id && unlocked && (
              <button
                onClick={(e) => { e.stopPropagation(); handleSelect(node.id, node.name); }}
                className="mt-1 w-full text-[9px] font-bold bg-yellow-500/80 hover:bg-yellow-400 text-black rounded px-1 py-0.5 transition-colors"
              >
                Selecionar
              </button>
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
            {t('app.classes.page_title')}
          </h1>
        </div>

        <p className="text-sm text-muted-foreground">
        {t('app.classes.current_level_hint', { n: userLevel })}
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
                    <p className="text-xs font-bold text-muted-foreground mb-2">{t('app.classes.next_evolutions')}:</p>
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
                    {t('app.classes.claim_reward_button')}
                  </Button>
                ) : profile?.current_class_id === selectedDetail.id ? (
                  <div className="flex items-center justify-center gap-1 text-sm text-primary font-bold py-2">
                    <Check className="w-4 h-4" /> {t('app.classes.current_class')}
                  </div>
                ) : profile?.current_class_id ? (
                  <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground py-2">
                    <Lock className="w-4 h-4" /> {t('app.classes.class_locked')}
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
                    {t('app.classes.select_button', { name: selectedDetail.name })}
                  </Button>
                ) : (
                  <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground py-2">
                    <Lock className="w-4 h-4" /> {t('app.classes.unlocked_at', { n: selectedDetail.level_min })}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de confirmação: mostra o "perfil moderno" da classe-base antes de aplicar */}
      <Dialog open={!!pendingConfirm} onOpenChange={(v) => !v && !selecting && setPendingConfirm(null)}>
        <DialogContent className="bg-card border-primary/40 max-w-md">
          {pendingConfirm && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-center mb-2">
                  <div className="text-5xl">{pendingConfirm.profile?.emoji || '⚔️'}</div>
                </div>
                <DialogTitle className="text-center font-display text-xl text-primary">
                  Você é mesmo um {pendingConfirm.className}?
                </DialogTitle>
                <DialogDescription className="text-center text-xs text-muted-foreground">
                  Confirme se este perfil combina com a sua vida real.
                </DialogDescription>
              </DialogHeader>

              {pendingConfirm.profile ? (
                <div className="space-y-3 mt-2">
                  {/* Card do perfil moderno */}
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{pendingConfirm.profile.emoji}</span>
                      <div>
                        <p className="font-display font-bold text-foreground">
                          {pendingConfirm.baseName}
                        </p>
                        <p className="text-[11px] text-primary/80">
                          {pendingConfirm.profile.modernTitle}
                        </p>
                      </div>
                    </div>
                    <p className="text-sm text-foreground/80">
                      {pendingConfirm.profile.modernDescription}
                    </p>
                  </div>

                  {/* Exemplos de perfis */}
                  <div className="rounded-lg border border-border bg-muted/20 p-3">
                    <p className="text-[11px] font-bold text-muted-foreground uppercase mb-2">
                      Esta classe combina com você se você é…
                    </p>
                    <ul className="space-y-1">
                      {pendingConfirm.profile.examples.map((ex, i) => (
                        <li key={i} className="text-sm text-foreground/90 flex items-start gap-2">
                          <span className="text-primary mt-0.5">•</span>
                          <span>{ex}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Missões pré-definidas */}
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                    <p className="text-[11px] font-bold text-emerald-300 uppercase mb-2">
                      🎯 Missões iniciais sugeridas
                    </p>
                    <ul className="space-y-1">
                      {pendingConfirm.profile.missions.map((m, i) => (
                        <li key={i} className="text-xs text-foreground/80 flex items-start gap-2">
                          <span className="text-emerald-400 mt-0.5">✓</span>
                          <span>{m}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Aviso */}
                  <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-amber-200/90">
                      A escolha de classe <strong>não pode ser desfeita gratuitamente</strong>. Para trocar depois, você precisará gastar ouro.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                  Esta é uma classe avançada de <strong>{pendingConfirm.baseName}</strong>. Tem certeza que deseja seguir este caminho?
                </div>
              )}

              <DialogFooter className="flex-row gap-2 sm:justify-between">
                <Button
                  variant="outline"
                  onClick={() => setPendingConfirm(null)}
                  disabled={!!selecting}
                  className="flex-1"
                >
                  Não, voltar
                </Button>
                <Button
                  onClick={confirmAndSelect}
                  disabled={!!selecting}
                  className="flex-1 bg-primary"
                >
                  {selecting ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Check className="w-4 h-4 mr-2" />
                  )}
                  Sim, sou {pendingConfirm.className}!
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
