import { motion } from 'framer-motion';
import { Sparkles, Clock3, Flame, Coins, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import { useProfile } from '@/hooks/useProfile';
import { useAvailableTalents, useBuyTalent, usePlayerTalents, type Talent } from '@/hooks/useTalents';

const TALENT_UI: Record<string, { icon: any; accent: string; title: string }> = {
  madrugador: { icon: Clock3, accent: 'from-orange-500/30 to-amber-500/10 border-orange-400/40', title: 'Madrugador' },
  foco_inabalavel: { icon: Flame, accent: 'from-blue-500/30 to-cyan-500/10 border-cyan-400/40', title: 'Foco Inabalavel' },
  mestre_mercador: { icon: Coins, accent: 'from-emerald-500/30 to-lime-500/10 border-emerald-400/40', title: 'Mestre Mercador' },
};

const FALLBACK_TALENTS: Talent[] = [
  { id: 'mock-madrugador', nome: 'Madrugador', descricao: '+15% XP antes das 8h.', efeito: 'madrugador' },
  { id: 'mock-foco', nome: 'Foco Inabalavel', descricao: 'Combo dura ate 48h entre conclusoes.', efeito: 'foco_inabalavel' },
  { id: 'mock-mercador', nome: 'Mestre Mercador', descricao: '10% de desconto na loja.', efeito: 'mestre_mercador' },
];

export default function FeatsTree() {
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
      onSuccess: () => toast.success(`Talento desbloqueado: ${talento.nome}`),
      onError: (err: any) => toast.error(err?.message || 'Nao foi possivel comprar o talento.'),
    });
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-display font-bold text-primary text-glow">Arvore de Talentos</h1>
        </div>

        <div className="rpg-card flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">Pontos de Talento disponiveis</p>
            <p className="text-2xl font-bold text-primary">{pontos}</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Voce ganha 1 ponto a cada 5 niveis. Proximo marco: nivel {nextMilestone}.
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

                <button
                  onClick={() => handleBuy(talento)}
                  disabled={owned || pontos <= 0 || buyTalent.isPending}
                  className="w-full rounded-lg border border-primary/40 bg-primary/20 px-3 py-2 text-sm font-semibold text-primary transition hover:bg-primary/30 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {owned ? 'Adquirido' : 'Comprar (1 ponto)'}
                </button>
              </motion.div>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
