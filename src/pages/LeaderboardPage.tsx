import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Flame, Swords, Crown, Medal, Loader2, Globe, MapPin } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import {
  useGlobalLeaderboard,
  useWeeklyLeaderboard,
  useClassLeaderboard,
  useRegionalLeaderboard,
  useRegionalWeeklyLeaderboard,
  useRegionalClassLeaderboard,
  type LeaderboardEntry,
  type WeeklyLeaderboardEntry,
} from '@/hooks/useLeaderboard';

const REGION_LABELS: Record<string, string> = {
  south_america: 'América do Sul',
  north_america: 'América do Norte',
  europe: 'Europa',
  africa: 'África',
  asia: 'Ásia',
  oceania: 'Oceania',
};

const CLASS_OPTIONS = [
  { value: 'guerreiro', label: 'Guerreiro / Espadachim', icon: '⚔️' },
  { value: 'mago',      label: 'Mago / Bruxo',           icon: '🔮' },
  { value: 'gatuno',   label: 'Gatuno / Mercenário',     icon: '🌙' },
  { value: 'ferreiro', label: 'Ferreiro / Mecânico',     icon: '🔨' },
  { value: 'clerico',  label: 'Noviço / Monge',          icon: '✝️' },
  { value: 'arqueiro', label: 'Arqueiro / Caçador',      icon: '🏹' },
];

const CLASS_ICONS: Record<string, string> = {
  guerreiro: '⚔️',
  mago:      '🔮',
  gatuno:    '🌙',
  ferreiro:  '🔨',
  clerico:   '✝️',
  arqueiro:  '🏹',
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
  const displayClass = entry.current_class_name ?? entry.starter_class ?? 'Sem classe';
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
          Nv. {entry.level} · {displayClass}
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
  const { data: profile } = useProfile();
  const [scope, setScope] = useState<'global' | 'regional'>('global');
  const [selectedClass, setSelectedClass] = useState<string>(CLASS_OPTIONS[0].value);

  const userRegion = (profile as any)?.region as string | null ?? null;
  const regionLabel = userRegion ? (REGION_LABELS[userRegion] ?? userRegion) : null;

  // Global data
  const { data: global = [],  isLoading: loadingGlobal  } = useGlobalLeaderboard();
  const { data: weekly = [],  isLoading: loadingWeekly  } = useWeeklyLeaderboard();
  const { data: byClass = [], isLoading: loadingClass   } = useClassLeaderboard(selectedClass);

  // Regional data
  const { data: regional = [],       isLoading: loadingRegional       } = useRegionalLeaderboard(userRegion);
  const { data: weeklyRegional = [], isLoading: loadingWeeklyRegional } = useRegionalWeeklyLeaderboard(userRegion);
  const { data: byClassRegional = [],isLoading: loadingClassRegional  } = useRegionalClassLeaderboard(userRegion, selectedClass);

  // Pick active data set based on scope
  const activeGlobal  = scope === 'global' ? global        : regional;
  const activeWeekly  = scope === 'global' ? weekly        : weeklyRegional;
  const activeClass   = scope === 'global' ? byClass       : byClassRegional;
  const loadingG      = scope === 'global' ? loadingGlobal : loadingRegional;
  const loadingW      = scope === 'global' ? loadingWeekly : loadingWeeklyRegional;
  const loadingC      = scope === 'global' ? loadingClass  : loadingClassRegional;

  const myRankGlobal = useMemo(
    () => global.findIndex((e) => e.user_id === user?.id) + 1,
    [global, user],
  );

  const noRegion = scope === 'regional' && !userRegion;

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

        {/* Quick stats banner */}
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

        {/* ── Scope switcher: Global | Regional ── */}
        <div className="flex gap-2">
          <button
            onClick={() => setScope('global')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-semibold transition-all ${
              scope === 'global'
                ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400'
                : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            <Globe className="w-4 h-4" /> Global
          </button>
          <button
            onClick={() => setScope('regional')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-semibold transition-all ${
              scope === 'regional'
                ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            <MapPin className="w-4 h-4" />
            Regional
            {regionLabel && scope === 'regional' && (
              <span className="text-xs font-normal opacity-75">({regionLabel})</span>
            )}
          </button>
        </div>

        {/* No-region warning */}
        {noRegion && (
          <div className="rpg-card bg-yellow-500/10 border-yellow-500/30">
            <p className="text-sm text-yellow-400">⚠️ Você ainda não definiu sua região. Configure no seu perfil para ver o ranking regional.</p>
          </div>
        )}

        {/* ── Inner tabs: Geral | Semanal | Por Classe ── */}
        <Tabs defaultValue="geral">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="geral"    className="gap-1.5"><Trophy  className="w-4 h-4" />Geral</TabsTrigger>
            <TabsTrigger value="semanal"  className="gap-1.5"><Flame   className="w-4 h-4" />Semanal</TabsTrigger>
            <TabsTrigger value="porclasse" className="gap-1.5"><Swords  className="w-4 h-4" />Por Classe</TabsTrigger>
          </TabsList>

          {/* ── Geral ── */}
          <TabsContent value="geral" className="mt-4 space-y-2">
            {noRegion ? null : loadingG ? (
              <LoadingState />
            ) : activeGlobal.length === 0 ? (
              <EmptyState text="Nenhum aventureiro encontrado." />
            ) : (
              activeGlobal.map((entry, i) => (
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

          {/* ── Semanal ── */}
          <TabsContent value="semanal" className="mt-4 space-y-2">
            <p className="text-xs text-muted-foreground mb-3 px-1">
              Missões concluídas nos últimos 7 dias
            </p>
            {noRegion ? null : loadingW ? (
              <LoadingState />
            ) : activeWeekly.length === 0 ? (
              <EmptyState text="Nenhuma atividade semanal registrada ainda." />
            ) : (
              (activeWeekly as WeeklyLeaderboardEntry[]).map((entry, i) => (
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

          {/* ── Por Classe ── */}
          <TabsContent value="porclasse" className="mt-4 space-y-3">
            <Select value={selectedClass} onValueChange={setSelectedClass}>
              <SelectTrigger className="w-full sm:w-52">
                <SelectValue placeholder="Escolha uma classe" />
              </SelectTrigger>
              <SelectContent>
                {CLASS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.icon} {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="space-y-2">
              {noRegion ? null : loadingC ? (
                <LoadingState />
              ) : activeClass.length === 0 ? (
                <EmptyState text={`Nenhum aventureiro de ${CLASS_OPTIONS.find(o => o.value === selectedClass)?.label ?? selectedClass} encontrado${scope === 'regional' ? ' nesta região' : ''}.`} />
              ) : (
                activeClass.map((entry, i) => (
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

