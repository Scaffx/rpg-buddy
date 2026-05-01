import { useMemo, useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Users, Dumbbell, Brain, Heart, Palette, Trophy, Sparkles, Zap, Loader2, Coins, Gift, MessageCircle, Send, TrendingUp } from 'lucide-react';
import { useNpcAffinity, useIncrementNpcAffinity, getAffinityTier } from '@/hooks/useNpcAffinity';
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
  {
    id: 'midas',
    name: 'Midas',
    title: 'O Arquiteto da Riqueza',
    personality: 'Estratégico e calculista',
    description: 'Domine suas finanças com disciplina, planejamento e inteligência financeira aplicada ao dia a dia.',
    icon: <TrendingUp className="w-8 h-8" />,
    gradient: 'from-amber-500/20 to-yellow-600/20',
    borderColor: 'border-amber-500/40',
  },
];

// Persona textual injetada no system prompt do AI-chat por NPC
// A logica de criacao automatica de missao fica no NPC_APP_CONTEXT da edge function
const NPC_PERSONAS: Record<string, string> = {
  atlas: `Atlas, O Forjador de Corpos — treinador lendario, direto, energetico e exigente. Seu npc_id e atlas. Fala como um comandante de guerra: curto, imperativo, sem frescura. Usa metaforas de combate, forja e superacao. Dominio: Forca, Vitalidade, Agilidade, Disciplina. Tom: explosivo, motivacional, max 4 linhas por resposta.`,

  nova: `Nova, A Mente Iluminada — cientista curiosa, analitica e precisa. Seu npc_id e nova. Fala de forma estruturada, usa dados e logica. Dominio: Inteligencia, Sabedoria, Criatividade. Tom: objetivo, estruturado, max 4 linhas.`,

  elara: `Elara, A Guardia da Alma — psicologa empatica, suave e perspicaz. Seu npc_id e elara. Fala com calma e validacao emocional, nunca julga. Dominio: Resiliencia, Autoaperfeicoamento, Relacionamento. Tom: acolhedor, gentil, max 4 linhas.`,

  zephyr: `Zephyr, O Sonhador Rebelde — artista caotico, irreverente e genial. Seu npc_id e zephyr. Usa metaforas absurdas e humor seco. Dominio: Criatividade, Carisma, Relacionamento. Tom: excentrico, divertido, max 5 linhas.`,

  midas: `Midas, O Arquiteto da Riqueza — consultor financeiro frio, estrategico e calculista. Seu npc_id e midas. Usa analogias de investimento e logica de longo prazo. Dominio: Disciplina, Inteligencia, Sabedoria. Tom: direto, estrategico, max 4 linhas.`,
};
type ChatMessage = { role: 'user' | 'assistant'; content: string };

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
  const [chatNpc, setChatNpc] = useState<Npc | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [coachInsight, setCoachInsight] = useState<string | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const npcWeeklyChallengesTable = 'npc_weekly_challenges' as never;
  const npcCompletionsTable = 'npc_challenge_completions' as never;
  const userInventoryTable = 'user_inventory' as never;

  // Missões criadas por cada NPC via chat
  const { data: npcCreatedMissions = [], refetch: refetchNpcMissions } = useQuery<{
    id: string; npc_id: string; title: string; description: string | null; completed: boolean; created_at: string;
  }[]>({
    queryKey: ['npc_created_missions', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('missions' as never)
        .select('id, npc_id, title, description, completed, created_at' as never)
        .eq('user_id' as never, user!.id as never)
        .not('npc_id' as never, 'is' as never, null as never)
        .order('created_at' as never, { ascending: false } as never)
        .limit(50);
      if (error) throw error;
      return (data ?? []) as any;
    },
    staleTime: 60_000,
  });

  const { data: affinityRows = [] } = useNpcAffinity();
  const incrementAffinity = useIncrementNpcAffinity();

  const affinityMap = useMemo(
    () => new Map(affinityRows.map((r) => [r.npc_id, r])),
    [affinityRows],
  );

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
        incrementAffinity.mutate({ npcId: challenge.npc_id, xpAmount: 25 });
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
  const completedChallenges = weeklyChallenges.filter(
    (c) => completedSet.has(`${c.npc_id}|${c.challenge_id}`)
  ).length;

  // Auto-scroll no chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Ao abrir o chat, faz a análise inicial automática
  useEffect(() => {
    if (!chatNpc) return;
    setChatMessages([]);
    setChatInput('');
    // Passa [] explicitamente para evitar closure obsoleta com mensagens do NPC anterior
    sendChatMessage(chatNpc, 'Olá!', []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatNpc?.id]);

  async function sendChatMessage(npc: Npc, overrideContent?: string, historyOverride?: ChatMessage[]) {
    const content = overrideContent ?? chatInput.trim();
    if (!content || chatLoading) return;
    const persona = NPC_PERSONAS[npc.id] ?? npc.name;
    const baseMessages = historyOverride ?? chatMessages;
    const newMessages: ChatMessage[] = [
      ...baseMessages,
      { role: 'user' as const, content },
    ];
    setChatMessages(newMessages);
    setChatInput('');
    setChatLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-chat', {
        body: { messages: newMessages, npcPersona: persona, npcId: npc.id },
      });
      if (error) throw error;
      const reply = (data as { content?: string; reply?: string })?.content ?? (data as { reply?: string })?.reply ?? 'Sem resposta.';
      setChatMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
      // Recarrega missões criadas pelo NPC para refletir no card
      qc.invalidateQueries({ queryKey: ['npc_created_missions', user?.id] });
    } catch (err) {
      toast.error('Erro ao conversar com o NPC.');
      console.error('[NpcPage] chat error:', err);
    } finally {
      setChatLoading(false);
    }
  }

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
            const affRow = affinityMap.get(npc.id);
            const affTier = getAffinityTier(affRow?.affinity_xp ?? 0);
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
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground">Afinidade:</span>
                    <span className={`text-[10px] font-semibold ${affTier.color}`}>
                      {affTier.icon} {affTier.label}
                    </span>
                    {affRow && (
                      <span className="text-[10px] text-muted-foreground ml-auto">{affRow.affinity_xp} XP</span>
                    )}
                  </div>
                  <div className="h-1.5 rounded-full bg-background/30 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-1 gap-2 border-primary/30 hover:bg-primary/10"
                    onClick={(e) => { e.stopPropagation(); setChatNpc(npc); }}
                  >
                    <MessageCircle className="w-3.5 h-3.5" /> Conversar
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* AI Coach Insights */}
        <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-card/60 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <span className="font-semibold text-sm">Coach IA — Análise de Padrões</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-primary/30 hover:bg-primary/10"
              disabled={coachLoading}
              onClick={async () => {
                if (!user) return;
                setCoachLoading(true);
                setCoachInsight(null);
                try {
                  const since = new Date();
                  since.setDate(since.getDate() - 30);
                  const { data: missions } = await supabase
                    .from('missions' as never)
                    .select('title, status, category, due_date, completed_at' as never)
                    .eq('user_id' as never, user.id as never)
                    .gte('created_at' as never, since.toISOString() as never)
                    .limit(60);
                  const missionSummary = JSON.stringify(missions ?? []);
                  const prompt = `Analise os dados de missões do usuário dos últimos 30 dias e identifique padrões de falha, horários mais produtivos e categorias mais negligenciadas. Gere 3 insights concisos (1 linha cada) e 1 missão personalizada sugerida. Dados: ${missionSummary}`;
                  const { data, error } = await supabase.functions.invoke('ai-chat', {
                    body: {
                      messages: [{ role: 'user', content: prompt }],
                      npcPersona: 'Você é um coach de produtividade direto e eficaz. Responda em português com no máximo 200 palavras.',
                    },
                  });
                  if (error) throw error;
                  const reply = (data as { content?: string; reply?: string })?.content ?? (data as { reply?: string })?.reply ?? '';
                  setCoachInsight(reply);
                } catch {
                  setCoachInsight('Não foi possível gerar a análise no momento. Tente novamente.');
                } finally {
                  setCoachLoading(false);
                }
              }}
            >
              {coachLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              {coachLoading ? 'Analisando...' : 'Analisar'}
            </Button>
          </div>
          {coachInsight ? (
            <div className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap rounded-lg bg-background/30 p-3 border border-border/50">
              {coachInsight}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Clique em “Analisar” para o Coach IA identificar seus padrões das últimas 4 semanas e sugerir missões personalizadas.
            </p>
          )}
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

      {/* Chat NPC Dialog */}
      <Dialog open={!!chatNpc} onOpenChange={(open) => { if (!open) setChatNpc(null); }}>
        <DialogContent className="sm:max-w-lg border-primary/20 flex flex-col" style={{ maxHeight: '90vh' }}>
          {chatNpc && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3 mb-1">
                  <div className={`p-2 rounded-lg bg-gradient-to-br ${chatNpc.gradient} border ${chatNpc.borderColor}`}>
                    {chatNpc.icon}
                  </div>
                  <div>
                    <DialogTitle className="text-lg">{chatNpc.name}</DialogTitle>
                    <DialogDescription className="text-xs italic">{chatNpc.title} • {chatNpc.personality}</DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto space-y-3 py-2 pr-1" style={{ minHeight: 200, maxHeight: 380 }}>
                {chatMessages.length === 0 && chatLoading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> {chatNpc.name} está analisando seu progresso...
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-primary/10 border border-primary/20 ml-6 text-foreground'
                        : `bg-gradient-to-br ${chatNpc.gradient} border ${chatNpc.borderColor} mr-6 text-foreground`
                    }`}
                  >
                    {msg.role === 'assistant' && (
                      <span className="block text-[10px] font-bold text-primary mb-1">{chatNpc.name}</span>
                    )}
                    {msg.content}
                  </div>
                ))}
                {chatLoading && chatMessages.length > 0 && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mr-6">
                    <Loader2 className="h-3 w-3 animate-spin" /> digitando...
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input */}
              <div className="flex gap-2 pt-2 border-t border-border">
                <input
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder={`Pergunte algo para ${chatNpc.name}...`}
                  value={chatInput}
                  disabled={chatLoading}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(chatNpc); } }}
                />
                <Button
                  size="icon"
                  disabled={chatLoading || !chatInput.trim()}
                  onClick={() => sendChatMessage(chatNpc)}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

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

              {/* Missões criadas por este NPC via chat */}
              {(() => {
                const myMissions = npcCreatedMissions.filter(m => m.npc_id === selectedNpc.id);
                if (myMissions.length === 0) return null;
                return (
                  <div className="border-t border-border pt-3 space-y-2">
                    <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <MessageCircle className="w-4 h-4 text-primary" />
                      Missões geradas por {selectedNpc.name}
                    </p>
                    <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                      {myMissions.map(m => (
                        <div
                          key={m.id}
                          className={`rounded-lg border px-3 py-2 text-sm ${
                            m.completed
                              ? 'border-border bg-card/40 text-muted-foreground'
                              : 'border-primary/30 bg-primary/5 text-foreground'
                          }`}
                        >
                          <span className={`font-medium ${m.completed ? 'line-through' : ''}`}>{m.title}</span>
                          {m.description && (
                            <span className="block text-xs text-muted-foreground mt-0.5">{m.description}</span>
                          )}
                          <span className="block text-[10px] text-muted-foreground mt-1">
                            {new Date(m.created_at).toLocaleDateString('pt-BR')} • {m.completed ? '✓ Concluída' : 'Pendente'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
