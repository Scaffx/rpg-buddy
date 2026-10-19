import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Sparkles, Target, Trophy, Coins, Heart, Skull, Sword, Calendar, Users, Brain, ScrollText } from 'lucide-react';

type Step = {
  icon: React.ReactNode;
  title: string;
  description: string;
  bullets?: string[];
};

// The progression and adventure copy is kept with the five supported locales.
const buildSteps = (t: (key: string) => string): Step[] => [
  {
    icon: <Sparkles className="w-10 h-10 text-primary" />,
    title: t('app.helpTutorial.introTitle'),
    description: t('app.helpTutorial.introDescription'),
    bullets: [
      'Cada hábito é uma missão',
      t('app.helpTutorial.introRoutine'),
      t('app.helpTutorial.introAdventure'),
      'Ao subir de nível, libere classes e habilidades',
    ],
  },
  {
    icon: <Target className="w-10 h-10 text-primary" />,
    title: t('app.helpTutorial.dailyTitle'),
    description: t('app.helpTutorial.dailyDescription'),
    bullets: [
      t('app.helpTutorial.dailyProgress'),
      t('app.helpTutorial.dailyLimits'),
      t('app.helpTutorial.dailyNoPenalty'),
      '🛡️ Protetor de Streak salva você 2x por semana',
    ],
  },
  {
    icon: <Brain className="w-10 h-10 text-blue-400" />,
    title: '11 Atributos do Herói',
    description: 'Como um RPG real: Força, Inteligência, Sabedoria, Carisma, Vitalidade, Agilidade, Destreza, Constituição, Sorte, Percepção e Foco.',
    bullets: [
      'Cada missão fortalece atributos específicos',
      'Atributos sobem de nível independentemente',
      'Veja gráfico radar em "Progresso"',
    ],
  },
  {
    icon: <Trophy className="w-10 h-10 text-amber-400" />,
    title: 'Streak & Consistência',
    description: 'Cumpra ≥60% das missões diárias para manter sua streak ativa. Quebrou? Você perde o multiplicador.',
    bullets: [
      '🔥 Streak ativa = mais XP por missão',
      '🛡️ Protetores evitam quebra (2 por semana)',
      'Veja sua streak no topo do app',
    ],
  },
  {
    icon: <Coins className="w-10 h-10 text-yellow-400" />,
    title: t('app.helpTutorial.goldTitle'),
    description: t('app.helpTutorial.goldDescription'),
    bullets: [
      t('app.helpTutorial.goldAdventure'),
      t('app.helpTutorial.goldShop'),
      'Item de respec de classe',
    ],
  },
  {
    icon: <Skull className="w-10 h-10 text-destructive" />,
    title: t('app.helpTutorial.bossTitle'),
    description: t('app.helpTutorial.bossDescription'),
    bullets: [
      t('app.helpTutorial.bossStages'),
      t('app.helpTutorial.bossRewards'),
      t('app.helpTutorial.bossNoKey'),
    ],
  },
  {
    icon: <Sword className="w-10 h-10 text-red-400" />,
    title: t('app.helpTutorial.classesTitle'),
    description: 'Escolha entre 55 classes: Guerreiro, Mago, Assassino, etc. Cada uma tem missões pré-definidas e habilidades únicas.',
    bullets: [
      'Mude de classe na página "Classes"',
      'Habilidades desbloqueiam ao subir de nível',
      t('app.helpTutorial.classesPower'),
    ],
  },
  {
    icon: <Heart className="w-10 h-10 text-rose-400" />,
    title: 'Saúde do Personagem',
    description: 'Você tem HP, MP, Fadiga, Fome e Sede. Comer, beber água e dormir mantém o herói saudável.',
    bullets: [
      'Beba água: 35ml × seu peso (ml/dia)',
      'Coma o mínimo configurado por dia',
      'Não dormir = fadiga acumula',
    ],
  },
  {
    icon: <Calendar className="w-10 h-10 text-emerald-400" />,
    title: 'Calendário & Histórico',
    description: 'Veja todo seu histórico de missões cumpridas, XP ganho e progressão no calendário.',
    bullets: [
      'Visualize seu desempenho semanal',
      'Veja gráfico XP dos últimos 7 dias',
      'Identifique padrões de consistência',
    ],
  },
  {
    icon: <Users className="w-10 h-10 text-cyan-400" />,
    title: t('app.helpTutorial.npcTitle'),
    description: t('app.helpTutorial.npcDescription'),
    bullets: [
      'Ranking calculado pelo "Power Level"',
      t('app.helpTutorial.npcNoXp'),
      t('app.helpTutorial.npcSoon'),
    ],
  },
  {
    icon: <ScrollText className="w-10 h-10 text-primary" />,
    title: 'Pronto para começar! ⚔️',
    description: 'Explore o app. Use o chat IA flutuante (canto inferior direito) para qualquer dúvida ou para criar/concluir missões por comando.',
    bullets: [
      'Chat IA: clique no ícone roxo no canto',
      'Reabra este tutorial em "Ajuda" no menu',
      'Bom jogo, aventureiro!',
    ],
  },
];

export default function HelpTutorialModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const STEPS = buildSteps(t);
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;

  const handleClose = () => {
    setStep(0);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="rpg-card max-w-lg border-primary/40">
        <DialogHeader>
          <div className="flex items-center justify-center mb-2">
            <div className="p-3 rounded-full bg-primary/10 border border-primary/30">
              {current.icon}
            </div>
          </div>
          <DialogTitle className="text-center text-xl">{current.title}</DialogTitle>
          <DialogDescription className="text-center text-sm">
            {current.description}
          </DialogDescription>
        </DialogHeader>

        {current.bullets && (
          <ul className="space-y-2 mt-2">
            {current.bullets.map((b, i) => (
              <li key={i} className="text-sm text-muted-foreground flex items-start gap-2 bg-muted/20 rounded-lg px-3 py-2 border border-border/50">
                <span className="text-primary mt-0.5">•</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 mt-4">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={`h-2 rounded-full transition-all ${
                i === step ? 'w-6 bg-primary' : 'w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50'
              }`}
              aria-label={`Ir para passo ${i + 1}`}
            />
          ))}
        </div>

        <DialogFooter className="flex-row justify-between gap-2 sm:justify-between">
          <Button
            variant="outline"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={isFirst}
            className="gap-1"
          >
            <ChevronLeft className="w-4 h-4" /> Anterior
          </Button>
          <span className="text-xs text-muted-foreground self-center">
            {step + 1} / {STEPS.length}
          </span>
          {isLast ? (
            <Button onClick={handleClose} className="gap-1">
              Vamos lá! ⚔️
            </Button>
          ) : (
            <Button onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))} className="gap-1">
              Próximo <ChevronRight className="w-4 h-4" />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
