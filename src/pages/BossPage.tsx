import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBosses, useBossBattles, useFightBoss, useProfile, useAttributes } from '@/hooks/useProfile';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Loader2, Skull, Swords, Users, Flame, Trophy, Globe, Crown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getAttributeLevels, getBossCombatStats, getPlayerCombatStats } from '@/lib/combat';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

const RANKING_REGIONS = [
  { id: null, name: 'Ranking Mundial', icon: '🌐' },
  { id: 'south_america', name: 'América do Sul', icon: '🌎' },
  { id: 'north_america', name: 'América do Norte', icon: '🌎' },
  { id: 'europe', name: 'Europa', icon: '🌍' },
  { id: 'africa', name: 'África', icon: '🌍' },
  { id: 'asia', name: 'Ásia', icon: '🌏' },
];

function useRankings(region: string | null) {
  return useQuery({
    queryKey: ['rankings', region],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('get_rankings', {
        p_region: region,
      });
      if (error) throw error;
      return data as { user_id: string; display_name: string; level: number; total_xp: number; region: string; avatar_url: string }[];
    },
    refetchInterval: 60000,
  });
}

export default function BossPage() {
  const { data: bosses, isLoading } = useBosses();
  const { data: battles } = useBossBattles();
  const { data: profile } = useProfile();
  const { data: attributes } = useAttributes();
  const fightBoss = useFightBoss();
  const { toast } = useToast();
  const [battleResult, setBattleResult] = useState<{ won: boolean; damage: number } | null>(null);
  const [activeTab, setActiveTab] = useState<"solo" | "coletiva" | "ranking">("solo");
  const [rankingRegion, setRankingRegion] = useState<string | null>(null);
  const { data: rankings, isLoading: rankingsLoading } = useRankings(rankingRegion);
  const attrLevels = getAttributeLevels(attributes as any[]);
  const playerStats = getPlayerCombatStats(profile?.level || 1, attrLevels);

  const dungeons = [
    {
      id: '1',
      name: 'Catacumbas Perdidas',
      difficulty: 'Médio',
      icon: '🗿',
      minLevel: 5,
      requiredPlayers: 3,
      currentPlayers: 2,
      boss: { name: 'Guardião das Sombras', hp: 150, icon: '👹' },
      xpReward: 200,
      description: 'Uma masmorra antiga repleta de mistérios',
    },
    {
      id: '2',
      name: 'Torre da Perdição',
      difficulty: 'Difícil',
      icon: '🏰',
      minLevel: 10,
      requiredPlayers: 4,
      currentPlayers: 3,
      boss: { name: 'Feiticeiro Arcano', hp: 200, icon: '🧙' },
      xpReward: 300,
      description: 'Um desafio épico para os bravos aventureiros',
    },
    {
      id: '3',
      name: 'Floresta Maldita',
      difficulty: 'Fácil',
      icon: '🌲',
      minLevel: 2,
      requiredPlayers: 2,
      currentPlayers: 1,
      boss: { name: 'Besta Selvagem', hp: 100, icon: '🐺' },
      xpReward: 150,
      description: 'Uma masmorra para iniciantes',
    },
  ];

  const handleFight = async (boss: any) => {
    setBattleResult(null);
    try {
      const result = await fightBoss.mutateAsync({
        bossId: boss.id,
        bossHp: boss.hp,
        xpReward: boss.xp_reward,
      });
      setBattleResult(result);
      if (result.won) {
        toast({ title: `🎉 ${boss.name} derrotado!`, description: `+${boss.xp_reward} XP!` });
      } else {
        toast({ title: '💀 Derrota!', description: `Dano causado: ${result.damage}. Fique mais forte!`, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Erro na batalha', variant: 'destructive' });
    }
  };

  const handleJoinDungeon = (dungeonName: string) => {
    toast({ title: `✨ Você se juntou a ${dungeonName}!`, description: 'Aguardando outros jogadores...' });
  };

  const getRankMedal = (position: number) => {
    if (position === 0) return '🥇';
    if (position === 1) return '🥈';
    if (position === 2) return '🥉';
    return `#${position + 1}`;
  };

  const getPowerLevel = (level: number, totalXp: number) => {
    return level * 100 + Math.floor(totalXp / 10);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Skull className="w-6 h-6 text-destructive" />
          <h1 className="text-2xl font-display font-bold text-primary text-glow">
            Ir para aventura
          </h1>
        </div>

        {/* Abas */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setActiveTab("solo")}
            className={`px-4 py-2 rounded-lg border font-semibold transition-all ${
              activeTab === "solo"
                ? "bg-primary/20 border-primary/50 text-primary"
                : "bg-secondary border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            ⚔️ Aventura Solo
          </button>
          <button
            onClick={() => setActiveTab("coletiva")}
            className={`px-4 py-2 rounded-lg border font-semibold transition-all ${
              activeTab === "coletiva"
                ? "bg-purple-500/20 border-purple-500/50 text-purple-400"
                : "bg-secondary border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            👥 Masmorra Coletiva
          </button>
          <button
            onClick={() => setActiveTab("ranking")}
            className={`px-4 py-2 rounded-lg border font-semibold transition-all ${
              activeTab === "ranking"
                ? "bg-yellow-500/20 border-yellow-500/50 text-yellow-400"
                : "bg-secondary border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            🏆 Ranking
          </button>
        </div>

        {/* ========== ABA: AVENTURA SOLO ========== */}
        {activeTab === "solo" && (
          <>
            {profile && (
              <div className="rpg-card">
                <p className="text-sm text-muted-foreground">
                  Seu poder de ataque: <span className="text-primary font-bold">{profile.level * 15}</span> + bônus aleatório
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 mt-3 text-xs">
                  <div className="bg-muted/40 rounded p-2 border border-border/40"><p className="text-muted-foreground">ATK</p><p className="font-bold">{playerStats.atk}</p></div>
                  <div className="bg-muted/40 rounded p-2 border border-border/40"><p className="text-muted-foreground">MATK</p><p className="font-bold">{playerStats.matk}</p></div>
                  <div className="bg-muted/40 rounded p-2 border border-border/40"><p className="text-muted-foreground">DEF</p><p className="font-bold">{playerStats.def}</p></div>
                  <div className="bg-muted/40 rounded p-2 border border-border/40"><p className="text-muted-foreground">AGI</p><p className="font-bold">{playerStats.agi}</p></div>
                  <div className="bg-muted/40 rounded p-2 border border-border/40"><p className="text-muted-foreground">CRIT</p><p className="font-bold">{playerStats.crit}%</p></div>
                  <div className="bg-muted/40 rounded p-2 border border-border/40"><p className="text-muted-foreground">HP</p><p className="font-bold">{playerStats.hp}</p></div>
                </div>
              </div>
            )}

            {isLoading ? (
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {bosses?.map((boss, i) => {
                  const b = getBossCombatStats(boss);
                  return (
                  <motion.div
                    key={boss.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.1 }}
                    className="rpg-card-glow flex flex-col items-center text-center gap-3"
                  >
                    <span className="text-5xl animate-float">{boss.icon}</span>
                    <div>
                      <h3 className="font-display font-bold text-foreground">{boss.name}</h3>
                      <p className="text-xs text-muted-foreground mt-1">{boss.description}</p>
                    </div>
                    <div className="flex gap-4 text-xs">
                      <span className="text-health font-bold">❤️ {boss.hp} HP</span>
                      <span className="text-primary font-bold">⭐ Nv.{boss.level}</span>
                      <span className="text-xp font-bold">🏆 {boss.xp_reward} XP</span>
                    </div>

                    <div className="w-full rounded-lg border border-border/60 bg-muted/30 p-2 text-xs">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div><p className="text-muted-foreground">ATK</p><p className="font-bold text-foreground">{b.atk}</p></div>
                        <div><p className="text-muted-foreground">MATK</p><p className="font-bold text-foreground">{b.matk}</p></div>
                        <div><p className="text-muted-foreground">DEF</p><p className="font-bold text-foreground">{b.def}</p></div>
                        <div><p className="text-muted-foreground">AGI</p><p className="font-bold text-foreground">{b.agi}</p></div>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-2">
                        Fraqueza tática: <span className="font-semibold text-primary">{b.weakness}</span> • Ameaça: <span className="font-semibold text-destructive">{b.threat}</span>
                      </p>
                    </div>

                    <Button
                      onClick={() => handleFight(boss)}
                      disabled={fightBoss.isPending}
                      className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      size="sm"
                    >
                      {fightBoss.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-1" />
                      ) : (
                        <Swords className="w-4 h-4 mr-1" />
                      )}
                      Enfrentar
                    </Button>
                  </motion.div>
                  );
                })}
              </div>
            )}

            {/* Battle result */}
            <AnimatePresence>
              {battleResult && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className={`rpg-card-glow text-center p-6 ${battleResult.won ? 'border-success' : 'border-destructive'}`}
                  style={{ borderColor: battleResult.won ? 'hsl(142 70% 45%)' : 'hsl(0 72% 51%)' }}
                >
                  <span className="text-4xl">{battleResult.won ? '🎉' : '💀'}</span>
                  <h3 className="font-display font-bold text-lg mt-2 text-foreground">
                    {battleResult.won ? 'VITÓRIA!' : 'DERROTA!'}
                  </h3>
                  <p className="text-sm text-muted-foreground">Dano causado: {battleResult.damage}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Battle history */}
            {battles && battles.length > 0 && (
              <div>
                <h2 className="text-lg font-display font-semibold text-foreground mb-3">Histórico de Batalhas</h2>
                <div className="space-y-2">
                  {battles.slice(0, 10).map((b) => (
                    <div key={b.id} className="rpg-card flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span>{(b as any).bosses?.icon}</span>
                        <div>
                          <p className="text-sm text-foreground">{(b as any).bosses?.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Dano: {b.damage_dealt} • {new Date(b.created_at).toLocaleString('pt-BR')}
                          </p>
                        </div>
                      </div>
                      <span className={`text-sm font-bold ${b.won ? 'text-success' : 'text-destructive'}`}>
                        {b.won ? '✅ Vitória' : '❌ Derrota'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ========== ABA: MASMORRA COLETIVA ========== */}
        {activeTab === "coletiva" && (
          <div className="space-y-6">
            {profile && (
              <div className="rpg-card bg-purple-500/10 border-purple-500/30">
                <p className="text-sm text-muted-foreground">
                  Seu nível: <span className="text-purple-400 font-bold">{profile.level}</span> • Seu poder: <span className="text-purple-400 font-bold">{profile.level * 15}</span>
                </p>
              </div>
            )}

            <div className="grid gap-4">
              {dungeons.map((dungeon, i) => {
                const canJoin = profile && profile.level >= dungeon.minLevel;
                const isFull = dungeon.currentPlayers >= dungeon.requiredPlayers;

                return (
                  <motion.div
                    key={dungeon.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="rpg-card-glow border-purple-500/30 flex flex-col gap-4"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex gap-4 flex-1">
                        <span className="text-5xl">{dungeon.icon}</span>
                        <div className="flex-1">
                          <h3 className="font-display font-bold text-lg text-foreground">{dungeon.name}</h3>
                          <p className="text-xs text-muted-foreground mt-1">{dungeon.description}</p>
                          <div className="flex items-center gap-3 mt-2 flex-wrap">
                            <span className={`text-xs font-semibold px-2 py-1 rounded ${
                              dungeon.difficulty === 'Fácil'
                                ? 'bg-success/20 text-success'
                                : dungeon.difficulty === 'Médio'
                                ? 'bg-yellow-500/20 text-yellow-400'
                                : 'bg-destructive/20 text-destructive'
                            }`}>
                              {dungeon.difficulty}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              ⭐ Nível mín: {dungeon.minLevel}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rpg-card bg-secondary/50">
                        <p className="text-muted-foreground">Boss Final</p>
                        <p className="font-bold text-foreground mt-1">{dungeon.boss.icon} {dungeon.boss.name}</p>
                        <p className="text-muted-foreground">❤️ {dungeon.boss.hp} HP</p>
                      </div>
                      <div className="rpg-card bg-secondary/50">
                        <p className="text-muted-foreground">Recompensa</p>
                        <p className="font-bold text-xp mt-1">✨ {dungeon.xpReward} XP</p>
                        <p className="text-muted-foreground">👥 {dungeon.currentPlayers}/{dungeon.requiredPlayers}</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          Grupo ({dungeon.currentPlayers}/{dungeon.requiredPlayers})
                        </span>
                        <div className="flex gap-1">
                          {Array.from({ length: dungeon.requiredPlayers }).map((_, idx) => (
                            <div
                              key={idx}
                              className={`h-2 flex-1 rounded-full ${
                                idx < dungeon.currentPlayers ? 'bg-purple-500' : 'bg-muted'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    <Button
                      onClick={() => handleJoinDungeon(dungeon.name)}
                      disabled={!canJoin || isFull}
                      className={`w-full font-semibold ${
                        !canJoin
                          ? 'opacity-50 cursor-not-allowed'
                          : isFull
                          ? 'bg-muted text-muted-foreground'
                          : 'bg-purple-600 hover:bg-purple-700 text-white'
                      }`}
                    >
                      {!canJoin ? (
                        `❌ Nível insuficiente (${dungeon.minLevel} req)`
                      ) : isFull ? (
                        '🔒 Grupo cheio'
                      ) : (
                        <>
                          <Users className="w-4 h-4 mr-2" />
                          Entrar no grupo
                        </>
                      )}
                    </Button>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {/* ========== ABA: RANKING ========== */}
        {activeTab === "ranking" && (
          <div className="space-y-6">
            {/* Region selector */}
            <div className="flex gap-2 flex-wrap">
              {RANKING_REGIONS.map((r) => (
                <button
                  key={r.id ?? 'mundial'}
                  onClick={() => setRankingRegion(r.id)}
                  className={`px-3 py-1.5 rounded-lg border text-sm font-semibold transition-all ${
                    rankingRegion === r.id
                      ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400'
                      : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {r.icon} {r.name}
                </button>
              ))}
            </div>

            {/* Power Level Formula */}
            <div className="rpg-card bg-secondary/50 border-border/50">
              <div className="flex items-center gap-2 mb-2">
                <Flame className="w-4 h-4 text-yellow-400" />
                <p className="text-sm font-bold text-foreground">Nível de Poder — Como é calculado?</p>
              </div>
              <div className="bg-muted/60 rounded-lg p-3 border border-border/40 font-mono text-center">
                <p className="text-sm text-primary font-bold">Poder = (Nível × 100) + (XP Total ÷ 10)</p>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                Quanto maior seu nível e XP acumulado, mais alto será seu Nível de Poder no ranking.
              </p>
            </div>

            {/* Your position */}
            {profile && rankings && (
              <div className="rpg-card bg-primary/5 border-primary/30">
                <div className="flex items-center gap-3">
                  <Crown className="w-5 h-5 text-primary" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">Sua posição</p>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-xs text-muted-foreground">Nível {profile.level}</span>
                      <span className="text-xs font-bold text-primary">⚡ Poder: {getPowerLevel(profile.level, profile.total_xp)}</span>
                      {(() => {
                        const pos = rankings.findIndex((r: any) => r.user_id === profile.user_id);
                        return pos >= 0 ? <span className="text-xs text-yellow-400 font-semibold">🏅 #{pos + 1}</span> : null;
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Rankings list */}
            {rankingsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : Array.isArray(rankings) && rankings.length > 0 ? (
              <div className="space-y-2">
                {rankings.map((player: any, idx: number) => {
                  const isCurrentUser = player.user_id === profile?.user_id;
                  const power = getPowerLevel(player.level, player.total_xp);
                  return (
                    <motion.div
                      key={player.user_id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.03 }}
                      className={`rpg-card flex items-center gap-4 ${
                        isCurrentUser ? 'border-primary/50 bg-primary/5' : ''
                      } ${idx < 3 ? 'border-yellow-500/30' : ''}`}
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg shrink-0 ${
                        idx === 0 ? 'bg-yellow-500/20 text-yellow-400' :
                        idx === 1 ? 'bg-gray-400/20 text-gray-300' :
                        idx === 2 ? 'bg-amber-700/20 text-amber-600' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {getRankMedal(idx)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`font-semibold truncate ${isCurrentUser ? 'text-primary' : 'text-foreground'}`}>
                          {player.display_name && player.display_name.trim() !== '' ? player.display_name : 'Aventureiro'}
                          {isCurrentUser && <span className="text-xs text-primary ml-2">(Você)</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Nível {player.level} • {player.total_xp} XP
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-primary">{power}</p>
                        <p className="text-[10px] text-muted-foreground">Poder</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="rpg-card text-center py-8">
                <Trophy className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground">Nenhum jogador encontrado nesta região.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
