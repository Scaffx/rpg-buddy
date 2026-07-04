import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Network, Lock, RotateCcw, Check } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { useProfile } from '@/hooks/useProfile';
import { useHeroClass } from '@/hooks/useHeroClass';
import {
  useSkillTreeNodes,
  usePlayerSkillNodes,
  useAllocateSkillNode,
  useResetSkillTree,
  computeSpentPoints,
  type SkillTreeNode,
} from '@/hooks/useSkillTree';

// Galhos (branches) do node-graph + cor/ícone.
const BRANCH_META: Record<string, { emoji: string; color: string; ring: string }> = {
  tronco:      { emoji: '✦', color: 'text-primary',     ring: 'ring-primary/50' },
  fogo:        { emoji: '🔥', color: 'text-orange-400',  ring: 'ring-orange-500/50' },
  gelo:        { emoji: '❄️', color: 'text-cyan-300',    ring: 'ring-cyan-400/50' },
  raio:        { emoji: '⚡', color: 'text-yellow-300',  ring: 'ring-yellow-400/50' },
  arcano:      { emoji: '🔮', color: 'text-fuchsia-300', ring: 'ring-fuchsia-500/50' },
  fisico:      { emoji: '⚔️', color: 'text-rose-300',    ring: 'ring-rose-500/50' },
  forca:       { emoji: '💪', color: 'text-red-300',     ring: 'ring-red-500/50' },
  sangramento: { emoji: '🩸', color: 'text-rose-400',    ring: 'ring-rose-600/50' },
  veneno:      { emoji: '🧪', color: 'text-lime-300',    ring: 'ring-lime-500/50' },
  furtividade: { emoji: '🗡️', color: 'text-slate-300',   ring: 'ring-slate-400/50' },
  precisao:    { emoji: '🎯', color: 'text-amber-300',   ring: 'ring-amber-500/50' },
  infusao:     { emoji: '🜂', color: 'text-orange-300',  ring: 'ring-orange-500/50' },
  defesa:      { emoji: '🛡️', color: 'text-sky-300',     ring: 'ring-sky-500/50' },
  suporte:     { emoji: '🌿', color: 'text-emerald-300', ring: 'ring-emerald-500/50' },
  sagrado:     { emoji: '✨', color: 'text-yellow-200',  ring: 'ring-yellow-300/50' },
  forja:       { emoji: '🔨', color: 'text-amber-400',   ring: 'ring-amber-600/50' },
};
// Ordem de preferência dos galhos (os demais entram depois, na ordem do banco).
const BRANCH_ORDER = ['forca', 'fisico', 'sangramento', 'fogo', 'gelo', 'raio', 'arcano', 'veneno', 'furtividade', 'precisao', 'infusao', 'defesa', 'sagrado', 'suporte', 'forja'];

export default function SkillTreePage({ embedded }: { embedded?: boolean } = {}) {
  const { t } = useTranslation();
  const { data: profile } = useProfile();
  // Árvore a exibir: Aprendiz (tier 0, lv 1-4) mostra a mini-árvore tutorial; ao virar
  // tier-1, mostra a árvore da classe-base (mago/guerreiro/gatuno/ferreiro/arqueiro/novato).
  const { treeKey } = useHeroClass();
  const tree = treeKey || 'mago';
  const { data: nodes = [], isLoading } = useSkillTreeNodes(tree);
  const { data: ranks = {} } = usePlayerSkillNodes();
  const allocate = useAllocateSkillNode();
  const reset = useResetSkillTree();

  const level = Number(profile?.level ?? 1);
  const spent = useMemo(() => computeSpentPoints(nodes, ranks), [nodes, ranks]);
  const available = Math.max(0, level - spent);

  const tronco = useMemo(() => nodes.find((n) => n.branch === 'tronco'), [nodes]);
  const branches = useMemo(() => {
    const groups: Record<string, SkillTreeNode[]> = {};
    for (const n of nodes) if (n.branch !== 'tronco') (groups[n.branch] ||= []).push(n);
    const present = Object.keys(groups);
    const ordered = [...BRANCH_ORDER.filter((b) => groups[b]?.length), ...present.filter((b) => !BRANCH_ORDER.includes(b))];
    return ordered.map((b) => {
      const items = groups[b];
      const tiers = Array.from(new Set(items.map((n) => n.tier))).sort((a, z) => a - z);
      return { branch: b, rows: tiers.map((tr) => items.filter((n) => n.tier === tr).sort((a, z) => a.sort - z.sort)) };
    });
  }, [nodes]);

  const nodeName = (id: string | null) => (id ? nodes.find((n) => n.id === id)?.name ?? id : '');

  const stateOf = (node: SkillTreeNode) => {
    const rank = ranks[node.id] || 0;
    const prereqOk = !node.prereq_node_id || (ranks[node.prereq_node_id] || 0) >= 1;
    const gateOpen = spent >= node.gate_points;
    const exclusiveTaken = !!node.exclusive_group && rank === 0 && nodes.some(
      (n) => n.exclusive_group === node.exclusive_group && n.id !== node.id && (ranks[n.id] || 0) > 0,
    );
    const maxed = rank >= node.max_rank;
    const canAllocate = gateOpen && prereqOk && !exclusiveTaken && !maxed && available >= node.cost;
    return { rank, prereqOk, gateOpen, exclusiveTaken, maxed, canAllocate, hardLocked: !gateOpen || !prereqOk || exclusiveTaken };
  };

  const errorMsg = (code: string) => ({
    NO_POINTS: t('app.skilltree.err_no_points'),
    GATE_LOCKED: t('app.skilltree.err_gate'),
    PREREQ_LOCKED: t('app.skilltree.err_prereq'),
    MAX_RANK: t('app.skilltree.err_max'),
    EXCLUSIVE_TAKEN: t('app.skilltree.err_exclusive'),
  }[code] || t('app.skilltree.err_generic'));

  const handleAllocate = (node: SkillTreeNode) => {
    const s = stateOf(node);
    if (!s.canAllocate) {
      if (s.exclusiveTaken) toast.error(t('app.skilltree.err_exclusive'));
      else if (!s.gateOpen) toast.error(t('app.skilltree.err_gate'));
      else if (!s.prereqOk) toast.error(t('app.skilltree.err_prereq'));
      else if (s.maxed) toast.error(t('app.skilltree.err_max'));
      else toast.error(t('app.skilltree.err_no_points'));
      return;
    }
    allocate.mutate(node.id, {
      onSuccess: () => toast.success(t('app.skilltree.allocated', { name: node.name })),
      onError: (err: any) => toast.error(errorMsg(String(err?.message || ''))),
    });
  };

  // Respec: grátis até o nível 15; depois custa ouro fixo.
  const RESET_COST = 150;
  const resetCharged = level > 15;
  const handleReset = () => {
    if (resetCharged && !window.confirm(t('app.skilltree.respec_confirm', { cost: RESET_COST }))) return;
    reset.mutate(undefined, {
      onSuccess: (data: any) => toast.success(
        data?.charged > 0 ? t('app.skilltree.reset_paid', { cost: data.charged }) : t('app.skilltree.reset_done'),
      ),
      onError: (err: any) => toast.error(
        String(err?.message || '').includes('INSUFFICIENT_GOLD') ? t('app.skilltree.err_gold', { cost: RESET_COST }) : (err?.message || t('app.skilltree.err_generic')),
      ),
    });
  };

  /** Um nó do grafo (skill = quadrado, passivo = círculo, variante = losango). */
  const NodeButton = ({ node }: { node: SkillTreeNode }) => {
    const s = stateOf(node);
    const meta = BRANCH_META[node.branch] || BRANCH_META.tronco;
    const shape =
      node.node_type === 'skill' ? 'rounded-xl w-16 h-16'
      : node.node_type === 'variant' ? 'rounded-lg w-14 h-14 rotate-45'
      : 'rounded-full w-14 h-14';
    const inner = node.node_type === 'variant' ? '-rotate-45' : '';
    const elIcon = node.node_type === 'skill' ? meta.emoji : node.node_type === 'variant' ? '◆' : '•';
    return (
      <div className="flex flex-col items-center gap-1 w-[88px]">
        <button
          type="button"
          onClick={() => handleAllocate(node)}
          title={`${node.name} — ${node.description}`}
          className={`relative flex items-center justify-center border-2 transition select-none ${shape} ${
            s.rank > 0
              ? `bg-primary/20 border-primary ring-2 ${meta.ring}`
              : s.canAllocate
                ? 'bg-secondary border-foreground/40 hover:border-primary hover:bg-primary/10 animate-pulse'
                : 'bg-muted/30 border-border/50 opacity-60'
          }`}
        >
          <span className={`text-lg ${inner} ${s.rank > 0 ? meta.color : 'text-muted-foreground'}`}>
            {s.hardLocked && s.rank === 0 ? <Lock className="w-4 h-4" /> : elIcon}
          </span>
          {/* selo de rank */}
          <span className={`absolute -bottom-1.5 -right-1.5 rounded-full px-1.5 text-[10px] font-mono font-bold border ${inner} ${
            s.maxed ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-foreground border-border'
          }`}>
            {s.rank}/{node.max_rank}
          </span>
        </button>
        <p className="text-[10px] leading-tight text-center text-muted-foreground line-clamp-2 h-[26px]">{node.name}</p>
        {s.hardLocked && s.rank === 0 && (
          <p className="text-[9px] text-amber-400/80 text-center leading-tight">
            {!s.gateOpen ? t('app.skilltree.gate_short', { n: node.gate_points }) : s.exclusiveTaken ? t('app.skilltree.excl_short') : ''}
          </p>
        )}
      </div>
    );
  };

  const Connector = () => <div className="w-px h-4 bg-border mx-auto" />;

  const content = (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Network className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-display font-bold text-primary text-glow">{t('app.skilltree.page_title')}</h1>
          <span className="ml-1 text-sm text-muted-foreground">· {t(`app.skilltree.class_${tree}`, { defaultValue: tree })}</span>
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
            variant="outline" size="sm" onClick={handleReset} disabled={reset.isPending || spent === 0}
            className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> {t('app.skilltree.respec')}{resetCharged ? ` (${RESET_COST}🪙)` : ''}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground -mt-3">{t('app.skilltree.hint')}</p>

        {isLoading ? (
          <div className="rpg-card text-center py-10 text-muted-foreground">…</div>
        ) : nodes.length === 0 ? (
          <div className="rpg-card text-center py-10 text-muted-foreground">{t('app.skilltree.coming_soon')}</div>
        ) : (
          <div className="rpg-card overflow-x-auto">
            {/* Tronco */}
            {tronco && (
              <div className="flex flex-col items-center">
                <NodeButton node={tronco} />
                <Connector />
                {/* barra de ramificação */}
                <div className="h-px bg-border" style={{ width: `${branches.length * 120}px`, maxWidth: '100%' }} />
              </div>
            )}

            {/* Galhos */}
            <div className="flex gap-4 justify-center pt-2 min-w-max">
              {branches.map(({ branch, rows }) => {
                const meta = BRANCH_META[branch] || BRANCH_META.tronco;
                return (
                  <div key={branch} className="flex flex-col items-center gap-0">
                    <p className={`text-xs font-bold uppercase tracking-wider mb-1 ${meta.color}`}>
                      {meta.emoji} {t(`app.skilltree.branch_${branch}`, { defaultValue: branch })}
                    </p>
                    <Connector />
                    {rows.map((row, ri) => (
                      <div key={ri} className="flex flex-col items-center">
                        <div className="flex gap-2 items-start justify-center">
                          {row.map((node) => <NodeButton key={node.id} node={node} />)}
                        </div>
                        {ri < rows.length - 1 && <Connector />}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Legenda */}
        <div className="rpg-card flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded bg-secondary border-2 border-foreground/40" /> {t('app.skilltree.legend_skill')}</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-full bg-secondary border-2 border-foreground/40" /> {t('app.skilltree.legend_passive')}</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rotate-45 bg-secondary border-2 border-foreground/40" /> {t('app.skilltree.legend_variant')}</span>
          <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-primary" /> {t('app.skilltree.legend_phase2')}</span>
        </div>
      </div>
  );
  return embedded ? content : <AppLayout>{content}</AppLayout>;
}
