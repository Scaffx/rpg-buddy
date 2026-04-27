import { motion } from 'framer-motion';
import { Sparkles, Clock3, Flame, Coins, CheckCircle2, Shield, BookOpen, Swords, WandSparkles, Gem, Wind } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import AppLayout from '@/components/AppLayout';
import { useProfile } from '@/hooks/useProfile';
import { useAvailableTalents, useBuyTalent, usePlayerTalents, type Talent } from '@/hooks/useTalents';

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

export default function FeatsTree() {
  const { t } = useTranslation();
  const { data: profile } = useProfile();
  const { data: available = [] } = useAvailableTalents();
  const { data: ownedRows = [] } = usePlayerTalents();
  const buyTalent = useBuyTalent();

  const talentos = available.length > 0 ? available : FALLBACK_TALENTS;
  const ownedEffects = new Set<string>(
    (ownedRows || []).map((r: any) => String(r?.talentos_disponiveis?.efeito || '')),
  );

  const pontos = Number((profile as any)?.pontos_talento ?? 0);
  const level = Number(profile?.level ?? 1);
  const nextMilestone = (Math.floor(level / 5) + 1) * 5;

  const handleBuy = (talento: Talent) => {
    if (talento.id.startsWith('mock-')) {
      toast.error('Talentos mockados sem ID real no banco. Rode as migrations para habilitar compra.');
      return;
    }

    buyTalent.mutate(talento, {
      onSuccess: () => toast.success(t('app.feats.talent_unlocked', { name: talento.nome })),
      onError: (err: any) => toast.error(err?.message || t('app.feats.error_buy')),
    });
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-display font-bold text-primary text-glow">{t('app.feats.page_title')}</h1>
        </div>

        <div className="rpg-card flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{t('app.feats.available_points')}</p>
            <p className="text-2xl font-bold text-primary">{pontos}</p>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('app.feats.points_hint', { n: nextMilestone })}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {talentos.map((talento, index) => {
            const ui = TALENT_UI[talento.efeito] || TALENT_UI.madrugador;
            const Icon = ui.icon;
            const owned = ownedEffects.has(talento.efeito);

            return (
              <motion.div
                key={talento.efeito}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08 }}
                className={`rounded-xl border bg-gradient-to-br p-5 ${ui.accent}`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Icon className="w-5 h-5 text-primary" />
                    <h2 className="text-lg font-bold text-foreground">{ui.title}</h2>
                  </div>
                  {owned && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
                </div>

                <p className="text-sm text-muted-foreground mb-5">{talento.descricao}</p>
                <div className="mb-4 rounded-md border border-border/60 bg-background/30 px-3 py-2">
                  <p className="text-xs text-muted-foreground">{t('app.feats.synergy_label')}</p>
                  <p className="text-sm font-medium text-foreground">{ui.synergy}</p>
                </div>
                <p className="text-xs text-primary mb-5">{t('app.feats.cost_label')}</p>

                <button
                  onClick={() => handleBuy(talento)}
                  disabled={owned || pontos <= 0 || buyTalent.isPending}
                  className="w-full rounded-lg border border-primary/40 bg-primary/20 px-3 py-2 text-sm font-semibold text-primary transition hover:bg-primary/30 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {owned ? t('app.feats.button_owned') : t('app.feats.button_buy')}
                </button>
              </motion.div>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
