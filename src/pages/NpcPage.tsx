import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Users, Dumbbell, Brain, Heart, Palette, Trophy, Sparkles, Zap, Loader2, Coins, Gift } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { currentWeekToken } from '@/lib/dateUtils';
import { getLevelFromXp } from '@/lib/progression';

interface NpcChallenge {
  id: string;
  npc_id: string;
  challenge_id: string;
  title: string;
  description: string;
  xp_reward: number;
  gold_reward: number;
  reward_item_id: string | null;
  reward_item_quantity: number;
  reward_item: {
    id: string;
    name: string;
    icon: string | null;
  } | null;
}

type NpcCompletion = {
  npc_id: string;
  challenge_id: string;
};

type InventoryRow = {
  id: string;
  quantity: number;
};

interface Npc {
  id: string;
  name: string;
  title: string;
  personality: string;
  description: string;
  icon: React.ReactNode;
  gradient: string;
  borderColor: string;
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
  },
];

function normalizeChallenge(value: unknown): NpcChallenge | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || typeof record.npc_id !== 'string' || typeof record.challenge_id !== 'string') {
    return null;
  }

  const rewardItem = record.reward_item && typeof record.reward_item === 'object'
    ? record.reward_item as Record<string, unknown>
    : null;

  return {
    id: record.id,
    npc_id: record.npc_id,
    challenge_id: record.challenge_id,
    title: typeof record.title === 'string' ? record.title : 'Missão de NPC',
    description: typeof record.description === 'string' ? record.description : '',
    xp_reward: Number(record.xp_reward ?? 0),
    gold_reward: Number(record.gold_reward ?? 0),
    reward_item_id: typeof record.reward_item_id === 'string' ? record.reward_item_id : null,
    reward_item_quantity: Number(record.reward_item_quantity ?? 0),
    reward_item: rewardItem && typeof rewardItem.id === 'string'
      ? {
          id: rewardItem.id,
          name: typeof rewardItem.name === 'string' ? rewardItem.name : 'Item',
          icon: typeof rewardItem.icon === 'string' ? rewardItem.icon : null,
        }
      : null,
  };
}

function buildRewardText(challenge: NpcChallenge) {
  const parts = [`+${challenge.xp_reward} XP`, `+${challenge.gold_reward} 🪙`];

  if (challenge.reward_item && challenge.reward_item_quantity > 0) {
    parts.push(`+${challenge.reward_item_quantity}x ${challenge.reward_item.icon ?? '🎁'} ${challenge.reward_item.name}`);
  }

  return parts.join(' • ');
}

export default function NpcPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const weekToken = currentWeekToken();
  const [selectedNpc, setSelectedNpc] = useState<Npc | null>(null);
  const npcWeeklyChallengesTable = 'npc_weekly_challenges' as never;
  const npcCompletionsTable = 'npc_challenge_completions' as never;
  const userInventoryTable = 'user_inventory' as never;

  const { data: weeklyChallenges = [], isLoading: loadingChallenges, refetch: refetchChallenges } = useQuery<NpcChallenge[]>({
    queryKey: ['npc_weekly_challenges', user?.id, weekToken],
    enabled: !!user,
    queryFn: async () => {
      try {
        const { data: existing, error: existingError } = await supabase
          .from(npcWeeklyChallengesTable)
          .select('id, npc_id, challenge_id, title, description, xp_reward, gold_reward, reward_item_id, reward_item_quantity, reward_item:game_items(id, name, icon)')
          .eq('user_id', user!.id)
          .eq('week_token', weekToken)
          .order('npc_id', { ascending: true })
          .order('challenge_id', { ascending: true });

        if (!existingError) {
          const normalizedExisting = ((existing ?? []) as unknown[])
            .map(normalizeChallenge)
            .filter((challenge): challenge is NpcChallenge => challenge !== null);

          if (normalizedExisting.length > 0) {
            return normalizedExisting;
          }
        }
      } catch (error) {
        console.error('[NpcPage] erro ao buscar desafios semanais existentes:', error);
      }

      const { data: generated, error: generationError } = await supabase.functions.invoke('generate-npc-challenges', {
        body: { weekToken },
      });

      if (generationError) {
        throw generationError;
      }

      return (((generated as { challenges?: unknown[] } | null)?.challenges ?? []) as unknown[])
        .map(normalizeChallenge)
        .filter((challenge): challenge is NpcChallenge => challenge !== null);
    },
  });

  const challengesByNpc = useMemo(
    () => new Map(INITIAL_NPCS.map((npc) => [npc.id, weeklyChallenges.filter((challenge) => challenge.npc_id === npc.id)])),
    [weeklyChallenges],
  );

  const selectedNpcChallenges = selectedNpc ? (challengesByNpc.get(selectedNpc.id) ?? []) : [];

  // Completions this week from Supabase
  const { data: completions = [], isLoading: loadingCompletions } = useQuery<NpcCompletion[]>({
    queryKey: ['npc_completions', user?.id, weekToken],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(npcCompletionsTable)
        .select('npc_id, challenge_id')
        .eq('user_id', user!.id)
        .eq('week_token', weekToken);
      if (error) throw error;
      return ((data || []) as unknown) as NpcCompletion[];
    },
  });

  const completedSet = new Set(completions.map((c) => `${c.npc_id}|${c.challenge_id}`));

  const isCompleted = (npcId: string, challengeId: string) =>
    completedSet.has(`${npcId}|${challengeId}`);

  // Toggle (complete or uncomplete) a challenge via Supabase
  const toggleChallenge = useMutation({
    mutationFn: async (challenge: NpcChallenge) => {
      if (!user) throw new Error('Não autenticado');
      const key = `${challenge.npc_id}|${challenge.challenge_id}`;
      const alreadyDone = completedSet.has(key);

      if (alreadyDone) {
        const { error } = await supabase
          .from(npcCompletionsTable)
          .delete()
          .eq('user_id', user.id)
          .eq('npc_id', challenge.npc_id)
          .eq('challenge_id', challenge.challenge_id)
          .eq('week_token', weekToken);
        if (error) throw error;

        const { data: profile } = await supabase
          .from('profiles')
          .select('total_xp, level')
          .eq('user_id', user.id)
          .single();

        if (profile) {
          const newTotalXp = Math.max(0, profile.total_xp - challenge.xp_reward);
          const newLevel = Math.max(getLevelFromXp(newTotalXp), profile.level);

          await supabase
            .from('profiles')
            .update({ total_xp: newTotalXp, level: newLevel })
            .eq('user_id', user.id);
        }

        const { data: balance } = await supabase
          .from('user_balance')
          .select('gold')
          .eq('user_id', user.id)
          .maybeSingle();

        if (balance) {
          await supabase
            .from('user_balance')
            .update({ gold: Math.max(0, Number(balance.gold ?? 0) - challenge.gold_reward), updated_at: new Date().toISOString() })
            .eq('user_id', user.id);
        }

        if (challenge.reward_item_id && challenge.reward_item_quantity > 0) {
          const { data: inventoryRow } = await supabase
            .from(userInventoryTable)
            .select('id, quantity')
            .eq('user_id', user.id)
            .eq('item_id', challenge.reward_item_id)
            .maybeSingle();

          if (inventoryRow) {
            const typedInventoryRow = inventoryRow as unknown as InventoryRow;
            const nextQuantity = Number(typedInventoryRow.quantity ?? 0) - challenge.reward_item_quantity;
            if (nextQuantity > 0) {
              await supabase
                .from(userInventoryTable)
                .update({ quantity: nextQuantity } as never)
                .eq('id', typedInventoryRow.id);
            } else {
              await supabase
                .from(userInventoryTable)
                .delete()
                .eq('id', typedInventoryRow.id);
            }
          }
        }
      } else {
        const { error } = await supabase
          .from(npcCompletionsTable)
          .insert({
            user_id: user.id,
            npc_id: challenge.npc_id,
            challenge_id: challenge.challenge_id,
            week_token: weekToken,
            xp_earned: challenge.xp_reward,
            gold_earned: challenge.gold_reward,
          } as never);
        if (error) {
          if (error.code === '23505') throw new Error('Desafio já concluído esta semana.');
          throw error;
        }

        await supabase.rpc('add_xp_to_user' as never, { p_user_id: user.id, p_xp: challenge.xp_reward } as never);
        await supabase.rpc('add_gold_to_user' as never, { p_user_id: user.id, p_gold: challenge.gold_reward } as never);

        if (challenge.reward_item_id && challenge.reward_item_quantity > 0) {
          const { data: inventoryRow } = await supabase
            .from(userInventoryTable)
            .select('id, quantity')
            .eq('user_id', user.id)
            .eq('item_id', challenge.reward_item_id)
            .maybeSingle();

          if (inventoryRow) {
            const typedInventoryRow = inventoryRow as unknown as InventoryRow;
            await supabase
              .from(userInventoryTable)
              .update({ quantity: Number(typedInventoryRow.quantity ?? 0) + challenge.reward_item_quantity } as never)
              .eq('id', typedInventoryRow.id);
          } else {
            await supabase.from(userInventoryTable).insert({
              user_id: user.id,
              item_id: challenge.reward_item_id,
              quantity: challenge.reward_item_quantity,
              equipped: false,
            } as never);
          }
        }
      }

      return { wasCompleted: alreadyDone, challenge };
    },
    onSuccess: ({ wasCompleted, challenge }) => {
      qc.invalidateQueries({ queryKey: ['npc_completions', user?.id, weekToken] });
      qc.invalidateQueries({ queryKey: ['npc_weekly_challenges', user?.id, weekToken] });
      qc.invalidateQueries({ queryKey: ['profile'] });
      qc.invalidateQueries({ queryKey: ['gold-balance'] });
      qc.invalidateQueries({ queryKey: ['inventory', user?.id] });

      if (!wasCompleted) {
        toast.success(t('app.npc.challenge_done'), {
          description: buildRewardText(challenge),
        });
      } else {
        toast('Desafio desfeito', {
          description: buildRewardText(challenge),
        });
      }
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : t('app.npc.error_challenge')),
  });

  const totalChallenges = weeklyChallenges.length;
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

        {(loadingChallenges || loadingCompletions) && (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card/50 px-4 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Gerando desafios semanais dos NPCs...
          </div>
        )}

        {/* NPC Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {INITIAL_NPCS.map((npc) => {
            const npcChallenges = challengesByNpc.get(npc.id) ?? [];
            const done = npcChallenges.filter((challenge) => isCompleted(npc.id, challenge.challenge_id)).length;
            const total = npcChallenges.length;
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
                      style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
                    />
                  </div>
                  <Button variant="outline" size="sm" className="w-full mt-1 gap-2 border-primary/30 hover:bg-primary/10" disabled={total === 0}>
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
              {t('app.npc.stats_completed', { n: completedChallenges })}: <span className="font-bold text-foreground">{completedChallenges}/{totalChallenges}</span>
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
                {selectedNpcChallenges.length === 0 && !loadingChallenges && (
                  <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                    Nenhum desafio semanal gerado ainda para este NPC.
                    <Button variant="ghost" size="sm" className="mt-2" onClick={() => refetchChallenges()}>
                      Tentar novamente
                    </Button>
                  </div>
                )}
                {selectedNpcChallenges.map((challenge) => {
                  const done = isCompleted(selectedNpc.id, challenge.challenge_id);
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
                          toggleChallenge.mutate(challenge)
                        }
                        disabled={isLoading}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <span className={`block text-sm font-medium leading-relaxed ${done ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                          {challenge.title}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {challenge.description}
                        </span>
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                          <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-primary">
                            <Zap className="h-3 w-3" /> {challenge.xp_reward} XP
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2 py-1 text-yellow-300">
                            <Coins className="h-3 w-3" /> {challenge.gold_reward} 🪙
                          </span>
                          {challenge.reward_item && challenge.reward_item_quantity > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-emerald-300">
                              <Gift className="h-3 w-3" /> {challenge.reward_item_quantity}x {challenge.reward_item.icon ?? '🎁'} {challenge.reward_item.name}
                            </span>
                          )}
                        </div>
                      </div>
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
