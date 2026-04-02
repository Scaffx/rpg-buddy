import { useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Users, Dumbbell, Brain, Heart, Palette, Trophy, Sparkles, Zap } from 'lucide-react';
import { toast } from 'sonner';

interface NpcChallenge {
  id: string;
  text: string;
  completed: boolean;
}

interface Npc {
  id: string;
  name: string;
  title: string;
  personality: string;
  description: string;
  icon: React.ReactNode;
  gradient: string;
  borderColor: string;
  challenges: NpcChallenge[];
}

const INITIAL_NPCS: Npc[] = [
  {
    id: 'atlas',
    name: 'Atlas',
    title: 'O Forjador de Corpos',
    personality: 'Motivacional e enérgico',
    description: 'Supere seus limites físicos com exercícios progressivos que forjam disciplina e resistência.',
    icon: <Dumbbell className="w-8 h-8" />,
    gradient: 'from-yellow-500/20 to-orange-500/20',
    borderColor: 'border-yellow-500/40',
    challenges: [
      { id: 'atlas-1', text: 'Corrida de 3km sem parar (ou caminhe 5km se for iniciante)', completed: false },
      { id: 'atlas-2', text: '50 agachamentos + 30 flexões (adapte ao seu nível)', completed: false },
      { id: 'atlas-3', text: '15 minutos de yoga ou alongamento profundo', completed: false },
    ],
  },
  {
    id: 'nova',
    name: 'Nova',
    title: 'A Mente Iluminada',
    personality: 'Analítica e curiosa',
    description: 'Expanda sua mente com desafios intelectuais que afinam o raciocínio e a criatividade lógica.',
    icon: <Brain className="w-8 h-8" />,
    gradient: 'from-pink-500/20 to-purple-500/20',
    borderColor: 'border-pink-500/40',
    challenges: [
      { id: 'nova-1', text: 'Leia um artigo científico e resuma em 3 frases', completed: false },
      { id: 'nova-2', text: 'Resolva um puzzle lógico ou problema de matemática', completed: false },
      { id: 'nova-3', text: 'Aprenda um conceito novo e explique para alguém', completed: false },
    ],
  },
  {
    id: 'elara',
    name: 'Elara',
    title: 'A Guardiã da Alma',
    personality: 'Empática e sábia',
    description: 'Fortaleça sua resiliência emocional enfrentando medos internos e praticando autocompaixão.',
    icon: <Heart className="w-8 h-8" />,
    gradient: 'from-blue-500/20 to-cyan-500/20',
    borderColor: 'border-blue-500/40',
    challenges: [
      { id: 'elara-1', text: 'Escreva no diário sobre um medo e como superá-lo', completed: false },
      { id: 'elara-2', text: '10 minutos de meditação de aceitação', completed: false },
      { id: 'elara-3', text: 'Converse com alguém sobre algo que te incomoda', completed: false },
    ],
  },
  {
    id: 'zephyr',
    name: 'Zephyr',
    title: 'O Sonhador Rebelde',
    personality: 'Excêntrico e inspirador',
    description: 'Liberte sua criatividade com experimentos artísticos e brainstorming sem limites.',
    icon: <Palette className="w-8 h-8" />,
    gradient: 'from-emerald-500/20 to-teal-500/20',
    borderColor: 'border-emerald-500/40',
    challenges: [
      { id: 'zephyr-1', text: 'Faça um desenho, colagem ou escrita criativa por 15 min', completed: false },
      { id: 'zephyr-2', text: 'Brainstorm: 10 ideias malucas para um problema real', completed: false },
      { id: 'zephyr-3', text: 'Experimente algo artístico que nunca fez antes', completed: false },
    ],
  },
];

function getStoredProgress(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem('npc_challenges') || '{}');
  } catch { return {}; }
}

function saveProgress(progress: Record<string, boolean>) {
  localStorage.setItem('npc_challenges', JSON.stringify(progress));
}

export default function NpcPage() {
  const [selectedNpc, setSelectedNpc] = useState<Npc | null>(null);
  const [progress, setProgress] = useState<Record<string, boolean>>(getStoredProgress);

  const totalChallenges = INITIAL_NPCS.reduce((sum, npc) => sum + npc.challenges.length, 0);
  const completedChallenges = Object.values(progress).filter(Boolean).length;

  const toggleChallenge = (challengeId: string) => {
    const updated = { ...progress, [challengeId]: !progress[challengeId] };
    setProgress(updated);
    saveProgress(updated);
  };

  const handleRegister = () => {
    if (!selectedNpc) return;
    const npcCompleted = selectedNpc.challenges.filter(c => progress[c.id]).length;
    toast.success(`${npcCompleted} desafio(s) de ${selectedNpc.name} registrado(s)!`, {
      description: 'Seus dados foram salvos para análise futura pela IA.',
    });
    setSelectedNpc(null);
  };

  const npcCompletedCount = (npc: Npc) => npc.challenges.filter(c => progress[c.id]).length;

  return (
    <AppLayout>
      <div className="min-h-screen p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="w-7 h-7 text-primary" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">NPCs do Crescimento</h1>
              <p className="text-sm text-muted-foreground">Desafios fora da zona de conforto</p>
            </div>
          </div>
          <Button size="sm" className="gap-2">
            <Sparkles className="w-4 h-4" /> Novo Desafio
          </Button>
        </div>

        {/* NPC Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {INITIAL_NPCS.map((npc) => {
            const done = npcCompletedCount(npc);
            const total = npc.challenges.length;
            return (
              <Card
                key={npc.id}
                className={`bg-gradient-to-br ${npc.gradient} border ${npc.borderColor} hover:scale-[1.02] transition-transform cursor-pointer`}
                onClick={() => setSelectedNpc(npc)}
              >
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl bg-background/40 border ${npc.borderColor}`}>
                      {npc.icon}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-foreground text-base truncate">{npc.name}</h3>
                      <p className="text-xs text-muted-foreground italic">{npc.title}</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{npc.description}</p>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-muted-foreground">🎭 {npc.personality}</span>
                    <span className="text-[11px] font-semibold text-primary">{done}/{total} ✓</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-background/30 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${(done / total) * 100}%` }}
                    />
                  </div>
                  <Button variant="outline" size="sm" className="w-full mt-1 gap-2 border-primary/30 hover:bg-primary/10">
                    <Zap className="w-3.5 h-3.5" /> Interagir
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Footer Stats */}
        <div className="flex items-center justify-center gap-6 p-4 rounded-xl border border-border bg-card/50">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-primary" />
            <span className="text-sm text-muted-foreground">
              Desafios Completos: <span className="font-bold text-foreground">{completedChallenges}/{totalChallenges}</span>
            </span>
          </div>
          <div className="h-5 w-px bg-border" />
          <div className="text-sm text-muted-foreground">
            Próximo Nível: <span className="font-bold text-primary">{totalChallenges - completedChallenges} restantes</span>
          </div>
        </div>
      </div>

      {/* Interaction Modal */}
      <Dialog open={!!selectedNpc} onOpenChange={() => setSelectedNpc(null)}>
        <DialogContent className="sm:max-w-md border-primary/20">
          {selectedNpc && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3 mb-1">
                  <div className={`p-2 rounded-lg bg-gradient-to-br ${selectedNpc.gradient} border ${selectedNpc.borderColor}`}>
                    {selectedNpc.icon}
                  </div>
                  <div>
                    <DialogTitle className="text-lg">{selectedNpc.name}</DialogTitle>
                    <DialogDescription className="text-xs italic">{selectedNpc.title} • {selectedNpc.personality}</DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-3 py-2">
                <p className="text-sm font-semibold text-foreground">⚔️ Desafios Diários</p>
                {selectedNpc.challenges.map((challenge) => (
                  <label
                    key={challenge.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      progress[challenge.id]
                        ? 'bg-primary/10 border-primary/30'
                        : 'bg-card border-border hover:border-primary/20'
                    }`}
                  >
                    <Checkbox
                      checked={!!progress[challenge.id]}
                      onCheckedChange={() => toggleChallenge(challenge.id)}
                      className="mt-0.5"
                    />
                    <span className={`text-sm leading-relaxed ${progress[challenge.id] ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                      {challenge.text}
                    </span>
                  </label>
                ))}
              </div>

              <DialogFooter>
                <Button onClick={handleRegister} className="w-full gap-2">
                  <Sparkles className="w-4 h-4" /> Registrar Progresso
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
