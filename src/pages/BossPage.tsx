import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBosses, useBossBattles, useFightBoss, useProfile } from '@/hooks/useProfile';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Loader2, Skull, Swords, Users, Flame } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function BossPage() {
  const { data: bosses, isLoading } = useBosses();
  const { data: battles } = useBossBattles();
  const { data: profile } = useProfile();
  const fightBoss = useFightBoss();
  const { toast } = useToast();
  const [battleResult, setBattleResult] = useState<{ won: boolean; damage: number } | null>(null);
  const [activeTab, setActiveTab] = useState<"solo" | "coletiva">("solo");

  // ✅ Masmorras coletivas mock (dados fictícios por enquanto)
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

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Skull className="w-6 h-6 text-destructive" />
          <h1 className="text-2xl font-display font-bold text-primary text-glow">
            Ir para aventura
          </h1>
        </div>

        {/* ✅ Abas: Aventura Solo vs Masmorra Coletiva */}
        <div className="flex gap-2">
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
        </div>

        {/* ========== ABA: AVENTURA SOLO ========== */}
        {activeTab === "solo" && (
          <>
            {profile && (
              <div className="rpg-card">
                <p className="text-sm text-muted-foreground">
                  Seu poder de ataque: <span className="text-primary font-bold">{profile.level * 15}</span> + bônus aleatório
                </p>
              </div>
            )}

            {isLoading ? (
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {bosses?.map((boss, i) => (
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
                ))}
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

                    {/* Progress bar de jogadores */}
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

                    {/* Botão */}
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
      </div>
    </AppLayout>
  );
}
