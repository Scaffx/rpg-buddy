import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBosses, useBossBattles, useFightBoss, useProfile } from '@/hooks/useProfile';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Loader2, Skull, Swords } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function BossPage() {
  const { data: bosses, isLoading } = useBosses();
  const { data: battles } = useBossBattles();
  const { data: profile } = useProfile();
  const fightBoss = useFightBoss();
  const { toast } = useToast();
  const [battleResult, setBattleResult] = useState<{ won: boolean; damage: number } | null>(null);

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

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Skull className="w-6 h-6 text-destructive" />
          <h1 className="text-2xl font-display font-bold text-primary text-glow">
            Boss Arena
          </h1>
        </div>

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
      </div>
    </AppLayout>
  );
}
