import { motion } from 'framer-motion';
import { Sparkles, Clock3, Flame, Coins, CheckCircle2, Shield, BookOpen, Swords, WandSparkles, Gem, Wind, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import TranslatedGuidedTour from '@/components/TranslatedGuidedTour';
import { useProfile } from '@/hooks/useProfile';
import { useAvailableTalents, useBuyTalent, usePlayerTalents, useToggleEquipTalent, MAX_EQUIPPED_TALENTS, type Talent } from '@/hooks/useTalents';
import { MODE_SKILL_LIMITS } from '@/lib/constants';

// Área de cada talento — agrupa a árvore por temas (roadmap #4b: árvore unificada).
const TALENT_AREA: Record<string, string> = {
  cacador_de_titas: 'ofensivo',
  corpo_de_ferro: 'defensivo', pele_de_pedra: 'defensivo', pulmoes_de_aco: 'defensivo',
  sifao_de_mana: 'magia', alquimista_amador: 'magia',
  madrugador: 'foco', foco_inabalavel: 'foco', rato_biblioteca: 'foco', ordem_no_caos: 'foco', estado_de_fluxo: 'foco',
  mestre_mercador: 'economia', investidor_anjo: 'economia',
  presenca_inspiradora: 'social', sorte_de_principiante: 'sorte', fotossintese: 'vitalidade',
};
const AREA_META: Record<string, { emoji: string }> = {
  ofensivo: { emoji: '⚔️' }, defensivo: { emoji: '🛡️' }, magia: { emoji: '✨' },
  foco: { emoji: '🎯' }, economia: { emoji: '🪙' }, social: { emoji: '🤝' },
  sorte: { emoji: '🍀' }, vitalidade: { emoji: '🌿' }, outros: { emoji: '📦' },
};
const AREA_ORDER = ['ofensivo', 'magia', 'defensivo', 'foco', 'economia', 'social', 'sorte', 'vitalidade', 'outros'];

// Ícone/cor por tipo de efeito das habilidades ativas (espelha a arena).
const SKILL_EFFECT_META: Record<string, { icon: string; cls: string }> = {
  dano:    { icon: '⚔️', cls: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200' },
  heal:    { icon: '💚', cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' },
  buff:    { icon: '🛡️', cls: 'border-blue-500/40 bg-blue-500/10 text-blue-200' },
  debuff:  { icon: '🔻', cls: 'border-orange-500/40 bg-orange-500/10 text-orange-200' },
  cc:      { icon: '⚡', cls: 'border-violet-500/40 bg-violet-500/10 text-violet-200' },
  utility: { icon: '✨', cls: 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-200' },
};

const TALENT_UI: Record<string, { icon: any; accent: string; title: string; synergy: string }> = {
  madrugador: {
    icon: Clock3,
    accent: 'from-orange-500/30 to-amber-500/10 border-orange-400/40',
    title: 'Madrugador',
    synergy: 'Rotina e produtividade matinal',
  },
  foco_inabalavel: {
    icon: Flame,
    accent: 'from-blue-500/30 to-cyan-500/10 border-cyan-400/40',
    title: 'Foco Inabalavel',
    synergy: 'Consistencia e combo de missoes',
  },
  mestre_mercador: {
    icon: Coins,
    accent: 'from-emerald-500/30 to-lime-500/10 border-emerald-400/40',
    title: 'Mestre Mercador',
    synergy: 'Economia e eficiencia de recursos',
  },
  rato_biblioteca: {
    icon: BookOpen,
    accent: 'from-indigo-500/30 to-blue-500/10 border-indigo-400/40',
    title: 'Rato de Biblioteca',
    synergy: 'Estudo e conhecimento',
  },
  corpo_de_ferro: {
    icon: Shield,
    accent: 'from-rose-500/30 to-orange-500/10 border-rose-400/40',
    title: 'Corpo de Ferro',
    synergy: 'Condicionamento fisico',
  },
  sorte_de_principiante: {
    icon: Gem,
    accent: 'from-cyan-500/30 to-sky-500/10 border-cyan-400/40',
    title: 'Sorte de Principiante',
    synergy: 'Risco e recompensa',
  },
  cacador_de_titas: {
    icon: Swords,
    accent: 'from-red-500/30 to-amber-500/10 border-red-400/40',
    title: 'Cacador de Titas',
    synergy: 'Bosses e desafios extremos',
  },
  pele_de_pedra: {
    icon: Shield,
    accent: 'from-stone-500/30 to-zinc-500/10 border-stone-400/40',
    title: 'Pele de Pedra',
    synergy: 'Defesa e sobrevivencia',
  },
  sifao_de_mana: {
    icon: WandSparkles,
    accent: 'from-violet-500/30 to-indigo-500/10 border-violet-400/40',
    title: 'Sifao de Mana',
    synergy: 'Magia e recuperacao de energia',
  },
  investidor_anjo: {
    icon: Coins,
    accent: 'from-emerald-500/30 to-teal-500/10 border-emerald-400/40',
    title: 'Investidor Anjo',
    synergy: 'Economia e crescimento de ouro',
  },
  alquimista_amador: {
    icon: WandSparkles,
    accent: 'from-fuchsia-500/30 to-purple-500/10 border-fuchsia-400/40',
    title: 'Alquimista Amador',
    synergy: 'Consumiveis e buffs',
  },
  pulmoes_de_aco: {
    icon: Wind,
    accent: 'from-teal-500/30 to-cyan-500/10 border-teal-400/40',
    title: 'Pulmoes de Aco',
    synergy: 'Resistencia e cardio',
  },
  ordem_no_caos: {
    icon: Sparkles,
    accent: 'from-slate-500/30 to-blue-500/10 border-slate-400/40',
    title: 'Ordem no Caos',
    synergy: 'Gestao de multitarefas',
  },
  estado_de_fluxo: {
    icon: Flame,
    accent: 'from-sky-500/30 to-indigo-500/10 border-sky-400/40',
    title: 'Estado de Fluxo',
    synergy: 'Foco continuo e performance',
  },
  presenca_inspiradora: {
    icon: Gem,
    accent: 'from-amber-500/30 to-yellow-500/10 border-amber-400/40',
    title: 'Presenca Inspiradora',
    synergy: 'Social e lideranca',
  },
  fotossintese: {
    icon: Wind,
    accent: 'from-lime-500/30 to-green-500/10 border-lime-400/40',
    title: 'Fotossintese',
    synergy: 'Recuperacao passiva e vitalidade',
  },
};

const FALLBACK_TALENTS: Talent[] = [
  { id: 'mock-madrugador', nome: 'Madrugador', descricao: '+15% XP antes das 8h.', efeito: 'madrugador' },
  { id: 'mock-foco', nome: 'Foco Inabalavel', descricao: 'Combo dura ate 48h entre conclusoes.', efeito: 'foco_inabalavel' },
  { id: 'mock-mercador', nome: 'Mestre Mercador', descricao: '10% de desconto na loja.', efeito: 'mestre_mercador' },
  { id: 'mock-rato-biblioteca', nome: 'Rato de Biblioteca', descricao: 'Bonus de XP em tarefas de estudo e leitura.', efeito: 'rato_biblioteca' },
  { id: 'mock-corpo-de-ferro', nome: 'Corpo de Ferro', descricao: 'Aumenta resistencia para rotinas fisicas intensas.', efeito: 'corpo_de_ferro' },
  { id: 'mock-sorte-principiante', nome: 'Sorte de Principiante', descricao: 'Pequena chance de recompensa extra em missoes.', efeito: 'sorte_de_principiante' },
  { id: 'mock-cacador-titas', nome: 'Cacador de Titas', descricao: 'Melhora desempenho contra desafios de alto nivel.', efeito: 'cacador_de_titas' },
  { id: 'mock-pele-de-pedra', nome: 'Pele de Pedra', descricao: 'Aumenta defesa base em situacoes de risco.', efeito: 'pele_de_pedra' },
  { id: 'mock-sifao-mana', nome: 'Sifao de Mana', descricao: 'Recupera uma porcao de MP ao concluir tarefas.', efeito: 'sifao_de_mana' },
  { id: 'mock-investidor-anjo', nome: 'Investidor Anjo', descricao: 'Aumenta ganho de ouro em conclusoes consistentes.', efeito: 'investidor_anjo' },
  { id: 'mock-alquimista-amador', nome: 'Alquimista Amador', descricao: 'Melhora efeitos de consumiveis e buffs.', efeito: 'alquimista_amador' },
  { id: 'mock-pulmoes-aco', nome: 'Pulmoes de Aco', descricao: 'Eleva desempenho em atividades de resistencia.', efeito: 'pulmoes_de_aco' },
  { id: 'mock-ordem-caos', nome: 'Ordem no Caos', descricao: 'Bonus quando ha varias tarefas em paralelo.', efeito: 'ordem_no_caos' },
  { id: 'mock-estado-fluxo', nome: 'Estado de Fluxo', descricao: 'Aumenta eficiencia em sequencias de foco.', efeito: 'estado_de_fluxo' },
  { id: 'mock-presenca-inspiradora', nome: 'Presenca Inspiradora', descricao: 'Fortalece bonus de suporte e motivacao.', efeito: 'presenca_inspiradora' },
  { id: 'mock-fotossintese', nome: 'Fotossintese', descricao: 'Recuperacao leve passiva de energia ao longo do dia.', efeito: 'fotossintese' },
];

export default function FeatsTree({ embedded }: { embedded?: boolean } = {}) {
  const { t } = useTranslation();
  const { data: profile } = useProfile();
  const { data: available = [] } = useAvailableTalents();
  const { data: ownedRows = [] } = usePlayerTalents();
  const buyTalent = useBuyTalent();
  const toggleEquip = useToggleEquipTalent();

  const talentos = available.length > 0 ? available : FALLBACK_TALENTS;
  const ownedMap = new Map<string, { rowId: string; equipped: boolean }>(
    (ownedRows || []).map((r: any) => [
      String(r?.talentos_disponiveis?.efeito || ''),
      { rowId: r.id, equipped: !!r.equipped },
    ]),
  );
  const equippedCount = (ownedRows || []).filter((r: any) => r.equipped).length;

  const pontos = Number(profile?.pontos_talento ?? 0);
  const level = Number(profile?.level ?? 1);
  const nextMilestone = (Math.floor(level / 5) + 1) * 5;

  const featText = (efeito: string, field: 'title' | 'synergy' | 'desc', fallback: string) =>
    t(`app.feats.talent_${efeito}_${field}`, { defaultValue: fallback });

  const handleBuy = (talento: Talent) => {
    if (talento.id.startsWith('mock-')) {
      toast.error(t('app.feats.toast_mock'));
      return;
    }

    buyTalent.mutate(talento, {
      onSuccess: () => toast.success(t('app.feats.talent_unlocked', { name: talento.nome })),
      onError: (err: any) => toast.error(err?.message || t('app.feats.error_buy')),
    });
  };

  const handleToggleEquip = (efeito: string) => {
    const row = ownedMap.get(efeito);
    if (!row) return;
    toggleEquip.mutate(
      { rowId: row.rowId, currentlyEquipped: row.equipped, equippedCount },
      { onError: (err: any) => toast.error(err?.message || t('app.feats.error_equip')) },
    );
  };

  // ── Habilidades ativas de combate (loadout) — visão unificada (roadmap #4b) ──
  const combatLoadout: any[] = Array.isArray((profile as any)?.combat_skill_loadout)
    ? ((profile as any).combat_skill_loadout as any[])
    : [];

  // Árvore organizada por área (tema).
  const talentsByArea = AREA_ORDER
    .map((area) => ({ area, items: talentos.filter((tl) => (TALENT_AREA[tl.efeito] || 'outros') === area) }))
    .filter((g) => g.items.length > 0);

  const renderTalentCard = (talento: Talent, index: number) => {
    const ui = TALENT_UI[talento.efeito] || TALENT_UI.madrugador;
    const Icon = ui.icon;
    const ownedData = ownedMap.get(talento.efeito);
    const owned = !!ownedData;
    const equipped = owned && ownedData!.equipped;
    const canEquip = owned && !equipped && equippedCount < MAX_EQUIPPED_TALENTS;
    const canUnequip = owned && equipped;

    return (
      <motion.div
        key={talento.efeito}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: Math.min(index * 0.05, 0.4) }}
        className={`rounded-xl border bg-gradient-to-br p-5 ${ui.accent} ${equipped ? 'ring-2 ring-primary/40' : ''}`}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Icon className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold text-foreground">{featText(talento.efeito, 'title', ui.title)}</h2>
          </div>
          {equipped && <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 border border-primary/40 text-primary font-bold">{t('app.feats.active')}</span>}
          {owned && !equipped && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
        </div>

        <p className="text-sm text-muted-foreground mb-5">{featText(talento.efeito, 'desc', talento.descricao)}</p>
        <div className="mb-4 rounded-md border border-border/60 bg-background/30 px-3 py-2">
          <p className="text-xs text-muted-foreground">{t('app.feats.synergy_label')}</p>
          <p className="text-sm font-medium text-foreground">{featText(talento.efeito, 'synergy', ui.synergy)}</p>
        </div>
        <p className="text-xs text-primary mb-5">{t('app.feats.cost_label')}</p>

        {!owned ? (
          <button
            onClick={() => handleBuy(talento)}
            disabled={pontos <= 0 || buyTalent.isPending}
            className="w-full rounded-lg border border-primary/40 bg-primary/20 px-3 py-2 text-sm font-semibold text-primary transition hover:bg-primary/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('app.feats.button_buy')}
          </button>
        ) : (
          <button
            onClick={() => handleToggleEquip(talento.efeito)}
            disabled={toggleEquip.isPending || (!canEquip && !canUnequip)}
            className={`w-full rounded-lg border px-3 py-2 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${
              equipped
                ? 'border-primary/40 bg-primary/20 text-primary hover:bg-primary/10'
                : canEquip
                  ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                  : 'border-border bg-muted/20 text-muted-foreground cursor-not-allowed'
            }`}
          >
            {equipped
              ? t('app.feats.unequip')
              : canEquip
                ? t('app.feats.equip')
                : t('app.feats.limit_reached', { max: MAX_EQUIPPED_TALENTS })}
          </button>
        )}
      </motion.div>
    );
  };

  const content = (
      <div className="space-y-6">
        <div data-tour="feats-header" className="flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-display font-bold text-primary text-glow">{t('app.feats.page_title')}</h1>
        </div>

        <div data-tour="feats-points" className="rpg-card flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm">
              <span className="text-muted-foreground">{t('app.feats.available_points')}</span>
              <span className="ml-2 align-middle text-2xl font-bold text-primary">{pontos}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">
              {t('app.feats.points_hint', { n: nextMilestone })}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t('app.feats.equipped_label')}: <span className={`font-bold ${equippedCount >= MAX_EQUIPPED_TALENTS ? 'text-yellow-400' : 'text-foreground'}`}>{equippedCount}/{MAX_EQUIPPED_TALENTS}</span>
            </p>
          </div>
        </div>

        {/* ── Habilidades ativas de combate (loadout) — visão unificada ───────── */}
        <div data-tour="feats-loadout" className="rpg-card border-cyan-500/30 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Swords className="w-5 h-5 text-cyan-400" />
              <h2 className="text-lg font-bold text-foreground">{t('app.feats.active_skills_title')}</h2>
            </div>
            <Link
              to="/profile"
              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/20"
            >
              <Settings2 className="w-3.5 h-3.5" /> {t('app.feats.edit_loadout')}
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('app.feats.mode_limits', { solo: MODE_SKILL_LIMITS.solo, dungeon: MODE_SKILL_LIMITS.dungeon, event: MODE_SKILL_LIMITS.event })}
          </p>
          {combatLoadout.length > 0 ? (
            <div className="flex gap-2 flex-wrap">
              {combatLoadout.slice(0, MODE_SKILL_LIMITS.event).map((skill: any, i: number) => {
                const meta = SKILL_EFFECT_META[String(skill?.effectType || 'dano')] || SKILL_EFFECT_META.dano;
                return (
                  <span key={String(skill?.id ?? i)} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${meta.cls}`}>
                    <span>{meta.icon}</span>
                    <span>{String(skill?.name ?? '—')}</span>
                    {typeof skill?.mpCost === 'number' && skill.mpCost > 0 && (
                      <span className="opacity-70 font-mono">{skill.mpCost} MP</span>
                    )}
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('app.feats.no_active_skills')}</p>
          )}
        </div>

        {/* ── Talentos (passivos) agrupados por área ──────────────────────────── */}
        <div data-tour="feats-tree" className="space-y-6">
        {talentsByArea.map(({ area, items }) => (
          <div key={area} className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
              <span className="text-base">{(AREA_META[area] || AREA_META.outros).emoji}</span>
              {t(`app.feats.area_${area}`, { defaultValue: area })}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {items.map((talento, index) => renderTalentCard(talento, index))}
            </div>
          </div>
        ))}
        </div>
        {!embedded && (
          <TranslatedGuidedTour
            tourKey="feats"
            targets={[
              { target: 'feats-header', key: 'overview' },
              { target: 'feats-points', key: 'points' },
              { target: 'feats-loadout', key: 'loadout' },
              { target: 'feats-tree', key: 'tree' },
            ]}
          />
        )}
      </div>
  );
  return embedded ? content : <AppLayout>{content}</AppLayout>;
}
