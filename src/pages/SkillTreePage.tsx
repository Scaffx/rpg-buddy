import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Swords, Lock, RotateCcw, Plus, Check } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { useProfile } from '@/hooks/useProfile';
import {
  useSkillTreeNodes,
  usePlayerSkillNodes,
  useAllocateSkillNode,
  useResetSkillTree,
  computeSpentPoints,
  type SkillTreeNode,
} from '@/hooks/useSkillTree';

const AREA_META: Record<string, { emoji: string; accent: string }> = {
  fisico:  { emoji: '⚔️', accent: 'border-rose-500/40' },
  fogo:    { emoji: '🔥', accent: 'border-orange-500/40' },
  gelo:    { emoji: '❄️', accent: 'border-cyan-400/40' },
  raio:    { emoji: '⚡', accent: 'border-yellow-400/40' },
  arcano:  { emoji: '✨', accent: 'border-fuchsia-500/40' },
  suporte: { emoji: '🌿', accent: 'border-emerald-500/40' },
};
const AREA_ORDER = ['fisico', 'fogo', 'gelo', 'raio', 'arcano', 'suporte'];

export default function SkillTreePage() {
  const { t } = useTranslation();
  const { data: profile } = useProfile();
  const { data: nodes = [], isLoading } = useSkillTreeNodes();
  const { data: ranks = {} } = usePlayerSkillNodes();
  const allocate = useAllocateSkillNode();
  const reset = useResetSkillTree();

  const level = Number(profile?.level ?? 1);
  const spent = useMemo(() => computeSpentPoints(nodes, ranks), [nodes, ranks]);
  const available = Math.max(0, level - spent);

  const byArea = useMemo(() => {
    const groups: Record<string, SkillTreeNode[]> = {};
    for (const n of nodes) (groups[n.area] ||= []).push(n);
    return AREA_ORDER
      .filter((a) => groups[a]?.length)
      .map((a) => ({ area: a, items: groups[a].sort((x, y) => x.tier - y.tier || x.sort - y.sort) }));
  }, [nodes]);

  const nodeName = (id: string) => nodes.find((n) => n.id === id)?.name ?? id;

  const errorMsg = (code: string) => {
    const m: Record<string, string> = {
      NO_POINTS: t('app.skilltree.err_no_points'),
      GATE_LOCKED: t('app.skilltree.err_gate'),
      PREREQ_LOCKED: t('app.skilltree.err_prereq'),
      MAX_RANK: t('app.skilltree.err_max'),
    };
    return m[code] || t('app.skilltree.err_generic');
  };

  const handleAllocate = (node: SkillTreeNode) => {
    allocate.mutate(node.id, {
      onSuccess: () => toast.success(t('app.skilltree.allocated', { name: node.name })),
      onError: (err: any) => toast.error(errorMsg(String(err?.message || ''))),
    });
  };

  const handleReset = () => {
    reset.mutate(undefined, {
      onSuccess: () => toast.success(t('app.skilltree.reset_done')),
      onError: (err: any) => toast.error(err?.message || t('app.skilltree.err_generic')),
    });
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Swords className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-display font-bold text-primary text-glow">{t('app.skilltree.page_title')}</h1>
        </div>

        {/* Barra de pontos + respec */}
        <div className="rpg-card flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-6">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{t('app.skilltree.points_available')}</p>
              <p className={`text-2xl font-bold ${available > 0 ? 'text-primary' : 'text-muted-foreground'}`}>{available}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{t('app.skilltree.points_spent')}</p>
              <p className="text-2xl font-bold text-foreground">{spent}</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={reset.isPending || spent === 0}
            className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> {t('app.skilltree.respec')}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground -mt-3">{t('app.skilltree.hint')}</p>

        {isLoading ? (
          <div className="rpg-card text-center py-10 text-muted-foreground">…</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {byArea.map(({ area, items }) => {
              const meta = AREA_META[area] || { emoji: '📦', accent: 'border-border' };
              return (
                <div key={area} className={`rpg-card border ${meta.accent} space-y-3`}>
                  <h2 className="flex items-center gap-2 font-display font-bold text-foreground">
                    <span className="text-xl">{meta.emoji}</span>
                    {t(`app.skilltree.area_${area}`, { defaultValue: area })}
                  </h2>

                  <div className="space-y-2">
                    {items.map((node, idx) => {
                      const rank = ranks[node.id] || 0;
                      const prereqRank = node.prereq_node_id ? (ranks[node.prereq_node_id] || 0) : 1;
                      const gateOpen = spent >= node.gate_points;
                      const prereqOk = prereqRank >= 1;
                      const maxed = rank >= node.max_rank;
                      const affordable = available >= node.cost;
                      const canAllocate = gateOpen && prereqOk && !maxed && affordable;
                      const hardLocked = !gateOpen || !prereqOk;

                      return (
                        <motion.div
                          key={node.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: Math.min(idx * 0.04, 0.3) }}
                          className={`relative rounded-lg border p-3 transition ${
                            rank > 0
                              ? 'border-primary/50 bg-primary/10'
                              : hardLocked
                                ? 'border-border/50 bg-muted/20 opacity-70'
                                : 'border-border bg-secondary/40'
                          }`}
                        >
                          {idx > 0 && <div className="absolute -top-2 left-5 h-2 w-px bg-border" />}
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-foreground flex items-center gap-1.5">
                                {hardLocked && <Lock className="w-3 h-3 text-muted-foreground" />}
                                {node.name}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">{node.description}</p>
                            </div>
                            <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-mono font-bold ${
                              maxed ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                            }`}>
                              {rank}/{node.max_rank}
                            </span>
                          </div>

                          <div className="mt-2 flex items-center justify-between gap-2">
                            {hardLocked ? (
                              <span className="text-[11px] text-amber-400/80">
                                {!gateOpen
                                  ? t('app.skilltree.requires_points', { n: node.gate_points })
                                  : t('app.skilltree.requires_node', { name: nodeName(node.prereq_node_id || '') })}
                              </span>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">
                                {t('app.skilltree.cost_n', { n: node.cost })}
                              </span>
                            )}
                            {maxed ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                                <Check className="w-3.5 h-3.5" /> {t('app.skilltree.maxed')}
                              </span>
                            ) : (
                              <Button
                                size="sm"
                                disabled={!canAllocate || allocate.isPending}
                                onClick={() => handleAllocate(node)}
                                className="h-7 px-2.5 text-xs bg-primary/20 text-primary border border-primary/40 hover:bg-primary/30 disabled:opacity-40"
                              >
                                <Plus className="w-3.5 h-3.5 mr-1" /> {t('app.skilltree.allocate')}
                              </Button>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
