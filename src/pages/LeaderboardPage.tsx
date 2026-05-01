import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Flame, Swords, Crown, Medal, Loader2 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import {
  useGlobalLeaderboard,
  useWeeklyLeaderboard,
  useClassLeaderboard,
  type LeaderboardEntry,
  type WeeklyLeaderboardEntry,
} from '@/hooks/useLeaderboard';

const CLASS_OPTIONS = [
  'Guerreiro', 'Mago', 'Assassino', 'Paladino', 'Arqueiro',
  'Druida', 'Monge', 'Bardo', 'Necromante', 'Clérigo',
];

const CLASS_ICONS: Record<string, string> = {
  Guerreiro: '⚔️', Mago: '🧙', Assassino: '🗡️', Paladino: '🛡️',
  Arqueiro: '🏹', Druida: '🌿', Monge: '👊', Bardo: '🎶',
  Necromante: '💀', Clérigo: '✝️',
};

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="w-5 h-5 text-yellow-400" />;
  if (rank === 2) return <Medal className="w-5 h-5 text-slate-300" />;
  if (rank === 3) return <Medal className="w-5 h-5 text-amber-600" />;
  return <span className="text-sm font-bold text-muted-foreground w-5 text-center">{rank}</span>;
}

function LeaderboardRow({
  rank,
  entry,
  score,
  scoreLabel,
  isCurrentUser,
}: {
  rank: number;
  entry: LeaderboardEntry;
  score: number | string;
  scoreLabel: string;
  isCurrentUser: boolean;
}) {
  const name = entry.display_name ?? 'Aventureiro';
  const classIcon = (entry.starter_class && CLASS_ICONS[entry.starter_class]) ?? '🗡️';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: rank * 0.03, duration: 0.25 }}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
        isCurrentUser
          ? 'border-primary/60 bg-primary/10'
          : 'border-border bg-card/50 hover:bg-card'
      }`}
    >
      <div className="flex items-center justify-center w-7 shrink-0">
        <RankBadge rank={rank} />
      </div>

      <div className="flex items-center justify-center w-9 h-9 rounded-full bg-muted text-lg shrink-0">
        {classIcon}
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate">
          {name}
          {isCurrentUser && (
            <Badge variant="outline" className="ml-2 text-[10px] px-1 py-0 border-primary/40 text-primary">
              Você
            </Badge>
          )}
        </p>
        <p className="text-[11px] text-muted-foreground">
          Nv. {entry.level} · {entry.starter_class ?? 'Sem classe'}
        </p>
      </div>

      <div className="text-right shrink-0">
        <p className="text-sm font-bold text-primary">{typeof score === 'number' ? score.toLocaleString('pt-BR') : score}</p>
        <p className="text-[10px] text-muted-foreground">{scoreLabel}</p>
      </div>
    </motion.div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-muted-foreground gap-3">
      <Trophy className="w-10 h-10 opacity-30" />
      <p className="text-sm">{text}</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-14 text-muted-foreground gap-2">
      <Loader2 className="w-5 h-5 animate-spin" />
      <span className="text-sm">Carregando ranking…</span>
    </div>
  );
}

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [selectedClass, setSelectedClass] = useState<string>(CLASS_OPTIONS[0]);

  const { data: global = [],  isLoading: loadingGlobal  } = useGlobalLeaderboard();
  const { data: weekly = [],  isLoading: loadingWeekly  } = useWeeklyLeaderboard();
  const { data: byClass = [], isLoading: loadingClass   } = useClassLeaderboard(selectedClass);

  const myRankGlobal = useMemo(
    () => global.findIndex((e) => e.user_id === user?.id) + 1,
    [global, user],
  );

  return (
    <AppLayout>
      <div className="min-h-screen p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Trophy className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Ranking</h1>
            <p className="text-sm text-muted-foreground">Compare seu poder com aventureiros do mundo</p>
          </div>
        </div>

        {/* Quick stats banner (only if user is in global ranking) */}
        {myRankGlobal > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-4 px-5 py-4 rounded-xl border border-primary/30 bg-primary/5"
          >
            <Crown className="w-8 h-8 text-primary shrink-0" />
            <div>
              <p className="text-sm font-semibold">Sua posição global</p>
              <p className="text-2xl font-bold text-primary">#{myRankGlobal}</p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-xs text-muted-foreground">de {global.length} aventureiros</p>
              <p className="text-sm font-semibold">
                {global.find((e) => e.user_id === user?.id)?.total_xp?.toLocaleString('pt-BR') ?? '—'} XP
              </p>
            </div>
          </motion.div>
        )}

        <Tabs defaultValue="global">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="global"    className="gap-1.5"><Trophy  className="w-4 h-4" />Global</TabsTrigger>
            <TabsTrigger value="weekly"    className="gap-1.5"><Flame   className="w-4 h-4" />Semanal</TabsTrigger>
            <TabsTrigger value="byclass"   className="gap-1.5"><Swords  className="w-4 h-4" />Por Classe</TabsTrigger>
          </TabsList>

          {/* ── Global tab ── */}
          <TabsContent value="global" className="mt-4 space-y-2">
            {loadingGlobal ? (
              <LoadingState />
            ) : global.length === 0 ? (
              <EmptyState text="Nenhum aventureiro encontrado." />
            ) : (
              global.map((entry, i) => (
                <LeaderboardRow
                  key={entry.user_id}
                  rank={i + 1}
                  entry={entry}
                  score={entry.total_xp}
                  scoreLabel="XP total"
                  isCurrentUser={entry.user_id === user?.id}
                />
              ))
            )}
          </TabsContent>

          {/* ── Weekly tab ── */}
          <TabsContent value="weekly" className="mt-4 space-y-2">
            <p className="text-xs text-muted-foreground mb-3 px-1">
              Missões concluídas nos últimos 7 dias
            </p>
            {loadingWeekly ? (
              <LoadingState />
            ) : weekly.length === 0 ? (
              <EmptyState text="Nenhuma atividade semanal registrada ainda." />
            ) : (
              (weekly as WeeklyLeaderboardEntry[]).map((entry, i) => (
                <LeaderboardRow
                  key={entry.user_id}
                  rank={i + 1}
                  entry={entry}
                  score={`${entry.weekly_count} missões`}
                  scoreLabel="esta semana"
                  isCurrentUser={entry.user_id === user?.id}
                />
              ))
            )}
          </TabsContent>

          {/* ── By class tab ── */}
          <TabsContent value="byclass" className="mt-4 space-y-3">
            <Select value={selectedClass} onValueChange={setSelectedClass}>
              <SelectTrigger className="w-full sm:w-52">
                <SelectValue placeholder="Escolha uma classe" />
              </SelectTrigger>
              <SelectContent>
                {CLASS_OPTIONS.map((cls) => (
                  <SelectItem key={cls} value={cls}>
                    {CLASS_ICONS[cls]} {cls}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="space-y-2">
              {loadingClass ? (
                <LoadingState />
              ) : byClass.length === 0 ? (
                <EmptyState text={`Nenhum aventureiro da classe ${selectedClass} encontrado.`} />
              ) : (
                byClass.map((entry, i) => (
                  <LeaderboardRow
                    key={entry.user_id}
                    rank={i + 1}
                    entry={entry}
                    score={entry.total_xp}
                    scoreLabel="XP total"
                    isCurrentUser={entry.user_id === user?.id}
                  />
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
