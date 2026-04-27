import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Users, Dumbbell, Brain, Heart, Palette, Trophy, Sparkles, Zap, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { currentWeekToken } from '@/lib/dateUtils';
import { NPC_XP_REWARD, NPC_GOLD_REWARD } from '@/lib/constants';

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

export default function NpcPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const weekToken = currentWeekToken();
  const [selectedNpc, setSelectedNpc] = useState<Npc | null>(null);

  // Completions this week from Supabase
  const { data: completions = [], isLoading: loadingCompletions } = useQuery<{ npc_id: string; challenge_id: string }[]>({
    queryKey: ['npc_completions', user?.id, weekToken],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('npc_challenge_completions' as any)
        .select('npc_id, challenge_id')
        .eq('user_id', user!.id)
        .eq('week_token', weekToken);
      if (error) throw error;
      return ((data || []) as unknown) as { npc_id: string; challenge_id: string }[];
    },
  });

  const completedSet = new Set(completions.map((c) => `${c.npc_id}|${c.challenge_id}`));

  const isCompleted = (npcId: string, challengeId: string) =>
    completedSet.has(`${npcId}|${challengeId}`);

  // Toggle (complete or uncomplete) a challenge via Supabase
  const toggleChallenge = useMutation({
    mutationFn: async ({ npcId, challengeId }: { npcId: string; challengeId: string }) => {
      if (!user) throw new Error('Não autenticado');
      const key = `${npcId}|${challengeId}`;
      const alreadyDone = completedSet.has(key);

      if (alreadyDone) {
        // Undo
        const { error } = await supabase
          .from('npc_challenge_completions' as any)
          .delete()
          .eq('user_id', user.id)
          .eq('npc_id', npcId)
          .eq('challenge_id', challengeId)
          .eq('week_token', weekToken);
        if (error) throw error;
      } else {
        // Complete + award XP/gold in a single transaction-like sequence
        const { error } = await supabase
          .from('npc_challenge_completions' as any)
          .insert({
            user_id: user.id,
            npc_id: npcId,
            challenge_id: challengeId,
            week_token: weekToken,
            xp_earned: NPC_XP_REWARD,
            gold_earned: NPC_GOLD_REWARD,
          } as any);
        if (error) {
          if (error.code === '23505') throw new Error('Desafio já concluído esta semana.');
          throw error;
        }
        // Award XP via RPC (use existing award mechanism)
        await supabase.rpc('add_xp_to_user' as any, { p_user_id: user.id, p_xp: NPC_XP_REWARD });
        // Award gold via profiles update
        await supabase.rpc('add_gold_to_user' as any, { p_user_id: user.id, p_gold: NPC_GOLD_REWARD });
      }

      return { wasCompleted: alreadyDone };
    },
    onSuccess: ({ wasCompleted }, { npcId, challengeId }) => {
      qc.invalidateQueries({ queryKey: ['npc_completions', user?.id, weekToken] });
      qc.invalidateQueries({ queryKey: ['profile'] });
      qc.invalidateQueries({ queryKey: ['gold'] });
      if (!wasCompleted) {
        toast.success(`Desafio concluído! +${NPC_XP_REWARD} XP, +${NPC_GOLD_REWARD} 🪙`, {
          description: 'Continue assim, aventureiro!',
        });
      }
    },
    onError: (err: any) => toast.error(err.message || t('app.npc.error_challenge')),
  });

  const totalChallenges = INITIAL_NPCS.reduce((sum, npc) => sum + npc.challenges.length, 0);
  const completedChallenges = completedSet.size;

  return (
    <AppLayout>
      <div className="min-h-screen p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="w-7 h-7 text-primary" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">{t('app.npc.page_title')}</h1>
              <p className="text-sm text-muted-foreground">{t('app.npc.page_subtitle')}</p>
            </div>
          </div>
          <Button size="sm" className="gap-2" disabled>
            <Sparkles className="w-4 h-4" /> Semana {weekToken}
          </Button>
        </div>

        {/* NPC Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {INITIAL_NPCS.map((npc) => {
            const done = npc.challenges.filter((c) => isCompleted(npc.id, c.id)).length;
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
                    <Zap className="w-3.5 h-3.5" /> {t('app.npc.interact_button')}
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
              {t('app.npc.stats_completed')}: <span className="font-bold text-foreground">{completedChallenges}/{totalChallenges}</span>
            </span>
          </div>
          <div className="h-5 w-px bg-border" />
          <div className="text-sm text-muted-foreground">
            {t('app.npc.next_level')}: <span className="font-bold text-primary">{totalChallenges - completedChallenges} {t('app.npc.remaining')}</span>
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
                <p className="text-sm font-semibold text-foreground">⚔️ {t('app.npc.weekly_challenges')}</p>
                <p className="text-xs text-muted-foreground">+{NPC_XP_REWARD} XP {t('app.npc.and')} +{NPC_GOLD_REWARD} 🪙 {t('app.npc.per_challenge')}</p>
                {selectedNpc.challenges.map((challenge) => {
                  const done = isCompleted(selectedNpc.id, challenge.id);
                  const isLoading = toggleChallenge.isPending;
                  return (
                    <label
                      key={challenge.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        done
                          ? 'bg-primary/10 border-primary/30'
                          : 'bg-card border-border hover:border-primary/20'
                      }`}
                    >
                      <Checkbox
                        checked={done}
                        onCheckedChange={() =>
                          toggleChallenge.mutate({ npcId: selectedNpc.id, challengeId: challenge.id })
                        }
                        disabled={isLoading}
                        className="mt-0.5"
                      />
                      <span className={`text-sm leading-relaxed ${done ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                        {challenge.text}
                      </span>
                    </label>
                  );
                })}
              </div>

              <DialogFooter>
                <Button onClick={() => setSelectedNpc(null)} className="w-full gap-2">
                  <Sparkles className="w-4 h-4" /> {t('app.npc.close_button')}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
