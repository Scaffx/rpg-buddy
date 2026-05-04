import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useBosses, useBossBattles, useProfile, useAttributes, useStartActiveCombat, useHealthStats } from '@/hooks/useProfile';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Loader2, Skull, Users, Flame, Trophy, Globe, Crown, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getAttributeLevels, getBossCombatStats, getPlayerCombatStats } from '@/lib/combat';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import CombatArena from '@/components/CombatArena';
import HeroStatusBar from '@/components/HeroStatusBar';
import { useHeroStoryChoices, useSaveSkeletonChoice } from '@/hooks/useHeroStoryChoices';
import { useAdoptSkeletonPup, useSkeletonCompanion, computeLiveMood } from '@/hooks/useCompanion';
import { useAuth } from '@/hooks/useAuth';
import { useInventory } from '@/hooks/useInventory';

/** Boss name patterns for story events (case-insensitive match) */
const SKELETON_BOSS_PATTERN   = /esquelet/i;
const MANTIROCA_BOSS_PATTERN  = /mantiroca/i;
const IMMORTAL_BOSS_PATTERN   = /guerreiro\s+imortal/i;

const REGION_LABELS: Record<string, string> = {
  south_america: 'América do Sul',
  north_america: 'América do Norte',
  europe: 'Europa',
  africa: 'África',
  asia: 'Ásia',
  oceania: 'Oceania',
};

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
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: bosses, isLoading } = useBosses();
  const { data: battles } = useBossBattles();
  const { data: profile } = useProfile();
  const { data: attributes } = useAttributes();
  const { data: healthStats } = useHealthStats();
  const { data: inventory } = useInventory();
  const startActiveCombat = useStartActiveCombat();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── Story hooks ─────────────────────────────────────────────────────────
  const { data: storyChoices }    = useHeroStoryChoices();
  const saveSkeletonChoice        = useSaveSkeletonChoice();
  const adoptSkeletonPup          = useAdoptSkeletonPup();
  const { data: skeletonCompanion } = useSkeletonCompanion();

  const [skeletonStoryOpen,    setSkeletonStoryOpen]    = useState(false);
  const [skeletonPupName,      setSkeletonPupName]      = useState('Ossinho');
  const [mantirocaWarningBoss, setMantirocaWarningBoss] = useState<any | null>(null);
  const [boostedMantirocaHp,   setBoostedMantirocaHp]   = useState(0);
  // ────────────────────────────────────────────────────────────────────────

  const [activeCombat, setActiveCombat] = useState<{ id: string; bossId: string; bossName: string; bossIcon: string; bossElement: string | null; bossHp: number; playerHp: number; playerMp: number; playerMaxMp: number; playerFatigue: number } | null>(null);
  const [arenaVisible, setArenaVisible] = useState<boolean>(() => {
    const stored = localStorage.getItem('rpg_combat_arena_visible');
    return stored === null ? true : stored === 'true';
  });
  const [activeTab, setActiveTab] = useState<"solo" | "coletiva" | "ranking">("solo");
  const [rankingView, setRankingView] = useState<'mundial' | 'regional'>('mundial');
  const effectiveRegion = rankingView === 'mundial' ? null : (profile?.region ?? null);
  const { data: rankings, isLoading: rankingsLoading } = useRankings(effectiveRegion);
  const attrLevels = getAttributeLevels(attributes as any[]);
  const playerStats = getPlayerCombatStats(profile?.level || 1, attrLevels);

  const handleCombatVictory = () => {
    queryClient.invalidateQueries({ queryKey: ['boss_battles'] });
    queryClient.invalidateQueries({ queryKey: ['profile'] });
    queryClient.invalidateQueries({ queryKey: ['health_stats'] });
    queryClient.invalidateQueries({ queryKey: ['gold-balance'] });

    // Skeleton story: fires once after defeating an "Esquelet…" boss
    const bossName = activeCombat?.bossName?.toLowerCase() ?? '';
    if (SKELETON_BOSS_PATTERN.test(bossName) && !storyChoices?.skeleton_champion) {
      setTimeout(() => setSkeletonStoryOpen(true), 1500);
    }
  };

  const handleCombatDefeat = async () => {
    // ── Penalidade de morte: -1 nível + fadiga 100 ──────────────────────────
    if (user && profile) {
      const currentLevel = (profile as any).level ?? 1;
      const newLevel = Math.max(1, currentLevel - 1);
      try {
        await Promise.all([
          supabase.from('profiles' as never).update({ level: newLevel } as never).eq('user_id' as never, user.id as never),
          supabase.from('user_health_stats' as never).update({ fatigue: 100 } as never).eq('user_id' as never, user.id as never),
        ]);
        toast({
          title: '💀 Derrota Severa',
          description: `Você perdeu 1 nível! Agora está no nível ${newLevel}. Fadiga máxima pelo resto do dia.`,
          variant: 'destructive',
        });
      } catch {
        // silent — UI still updates via invalidate
      }
    }
    queryClient.invalidateQueries({ queryKey: ['profile'] });
    queryClient.invalidateQueries({ queryKey: ['health_stats'] });
  };

  /** Guerreiro Imortal: player usa a Cabeça de Basilisco → derrota verdadeira */
  const handleImmortalTrueDefeat = async () => {
    if (!user || !activeCombat) return;
    try {
      // 1. Remover Cabeça de Basilisco do inventário
      const basiliscoInv = inventory?.find(
        (inv) => (inv.game_items as any)?.effect === 'derrota_guerreiro_imortal',
      );
      if (basiliscoInv) {
        await supabase.from('user_inventory' as never).delete().eq('id' as never, basiliscoInv.id as never);
        queryClient.invalidateQueries({ queryKey: ['inventory', user.id] });
      }

      // 2. Registrar vitória verdadeira em boss_battles
      await supabase.from('boss_battles' as never).insert({
        user_id: user.id,
        boss_id: activeCombat.bossId,
        damage_dealt: 1,
        won: true,
      } as never);

      // 3. Recompensas de XP (boss lv * 50 + 200 bônus)
      const bossData = (bosses as any[])?.find((b: any) => b.id === activeCombat.bossId);
      if (bossData) {
        const xpReward = Math.max(200, (bossData.level || 10) * 50);
        const goldReward = Math.max(50, (bossData.gold_reward || (bossData.level || 10) * 10));
        const { data: profileRow } = await supabase
          .from('profiles' as never)
          .select('total_xp, level' as never)
          .eq('user_id' as never, user.id as never)
          .maybeSingle();
        if (profileRow) {
          const newXp = ((profileRow as any).total_xp || 0) + xpReward;
          const newLevel = Math.max((profileRow as any).level || 1, Math.floor(newXp / 200) + 1);
          await supabase.from('profiles' as never).update({ total_xp: newXp, level: newLevel } as never).eq('user_id' as never, user.id as never);
        }
        const { data: balRow } = await supabase.from('user_balance' as never).select('gold' as never).eq('user_id' as never, user.id as never).maybeSingle();
        if (balRow) {
          await supabase.from('user_balance' as never).update({ gold: ((balRow as any).gold || 0) + goldReward } as never).eq('user_id' as never, user.id as never);
        }
      }

      // 4. Drop Fragmento I do Pergaminho Ancestral
      const { data: fragmentItem } = await supabase
        .from('game_items' as never)
        .select('id' as never)
        .eq('effect' as never, 'quest_scroll_fragment_1' as never)
        .maybeSingle();
      if (fragmentItem) {
        await supabase.from('user_inventory' as never).insert({
          user_id: user.id,
          item_id: (fragmentItem as any).id,
          quantity: 1,
          equipped: false,
        } as never);
      }

      // 5. Marcar como verdadeiramente derrotado
      await supabase.from('hero_story_choices' as never).upsert({
        user_id: user.id,
        guerreiro_imortal_defeated: true,
      } as never, { onConflict: 'user_id' });

      queryClient.invalidateQueries({ queryKey: ['boss_battles'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['inventory', user.id] });
      queryClient.invalidateQueries({ queryKey: ['hero_story_choices', user.id] });
      queryClient.invalidateQueries({ queryKey: ['gold-balance'] });

      toast({
        title: '💀 O Guerreiro Imortal foi derrotado!',
        description: '🗿 A Cabeça de Basilisco o petrificou. Ele se transformou em pedra e desmoronou!',
      });
      setTimeout(() => {
        toast({
          title: '📜 Fragmento obtido!',
          description: '"Fragmento I — A Arma Proibida" adicionado ao inventário.',
        });
      }, 2200);

      setActiveCombat(null);
    } catch (err: any) {
      toast({ title: 'Erro ao aplicar derrota verdadeira', description: err?.message, variant: 'destructive' });
    }
  };

  const handleCombatClose = () => {
    setActiveCombat(null);
  };

  const dungeons = useMemo(() => [
    {
      id: '1',
      name: t('app.boss.dungeon_1_name'),
      difficulty: t('app.boss.difficulty_medium'),
      icon: '🗿',
      minLevel: 5,
      requiredPlayers: 3,
      currentPlayers: 2,
      boss: { name: t('app.boss.dungeon_1_boss'), hp: 150, icon: '👹' },
      xpReward: 200,
      description: t('app.boss.dungeon_1_desc'),
      uniqueItem: t('app.boss.dungeon_1_item'),
      specialCoin: t('app.boss.dungeon_1_coin'),
      titleReward: t('app.boss.dungeon_1_title'),
    },
    {
      id: '2',
      name: t('app.boss.dungeon_2_name'),
      difficulty: t('app.boss.difficulty_hard'),
      icon: '🏰',
      minLevel: 10,
      requiredPlayers: 4,
      currentPlayers: 3,
      boss: { name: t('app.boss.dungeon_2_boss'), hp: 200, icon: '🧙' },
      xpReward: 300,
      description: t('app.boss.dungeon_2_desc'),
      uniqueItem: t('app.boss.dungeon_2_item'),
      specialCoin: t('app.boss.dungeon_2_coin'),
      titleReward: t('app.boss.dungeon_2_title'),
    },
    {
      id: '3',
      name: t('app.boss.dungeon_3_name'),
      difficulty: t('app.boss.difficulty_easy'),
      icon: '🌲',
      minLevel: 2,
      requiredPlayers: 2,
      currentPlayers: 1,
      boss: { name: t('app.boss.dungeon_3_boss'), hp: 100, icon: '🐺' },
      xpReward: 150,
      description: t('app.boss.dungeon_3_desc'),
      uniqueItem: t('app.boss.dungeon_3_item'),
      specialCoin: t('app.boss.dungeon_3_coin'),
      titleReward: t('app.boss.dungeon_3_title'),
    },
  ], [t]);

  // Set of boss IDs already defeated
  const defeatedBossIds = new Set(
    battles?.filter((b) => b.won).map((b) => b.boss_id) || []
  );

  const handleJoinDungeon = (dungeonName: string) => {
      toast({ title: `✨ ${t('app.boss.joined_dungeon', { name: dungeonName })}`, description: t('app.boss.waiting_players') });
  };

  const handleStartArenaCombat = async (boss: any, overrideBossHp?: number) => {
    // Mantiroca + skeleton rejection = skeleton rides it and boss gets +40% HP
    if (MANTIROCA_BOSS_PATTERN.test(boss.name ?? '') && storyChoices?.skeleton_champion === 'reject' && !overrideBossHp) {
      const baseBossHp = boss.hp_max ?? boss.hp ?? 100;
      setBoostedMantirocaHp(Math.round(baseBossHp * 1.4));
      setMantirocaWarningBoss(boss);
      return;
    }

    try {
      const combat = await startActiveCombat.mutateAsync({ bossId: boss.id });

      // Usa HP/MP atuais do banco (refletindo hidratação, short rest, etc.)
      // Fallback para os valores calculados por nível/atributos se o banco não tiver registro.
      const currentHp = healthStats?.current_hp != null
        ? Number(healthStats.current_hp)
        : Number(combat.hp_atual_personagem ?? playerStats.hp ?? 120);
      const currentMp = healthStats?.current_mp != null
        ? Number(healthStats.current_mp)
        : Number((playerStats as any).mp ?? 40);
      const maxMp = healthStats?.max_mp != null
        ? Number(healthStats.max_mp)
        : Number((playerStats as any).mp ?? 40);
      const currentFatigue = healthStats?.fatigue != null
        ? Number((healthStats as any).fatigue)
        : 0;

      setActiveCombat({
        id: combat.id,
        bossId: boss.id,
        bossName: boss.name,
        bossIcon: boss.icon,
        bossElement: boss.element ?? null,
        bossHp: overrideBossHp ?? Number(combat.hp_atual_boss ?? boss.hp_max ?? boss.hp ?? 100),
        playerHp: currentHp,
        playerMp: currentMp,
        playerMaxMp: maxMp,
        playerFatigue: currentFatigue,
      });
      toast({ title: `⚔️ ${t('app.boss.combat_started')}`, description: t('app.boss.arena_opened', { name: boss.name }) });
    } catch (err: any) {
      toast({
        title: t('app.boss.error_start_combat'),
        description: err?.message || t('app.boss.error_start_combat_desc'),
        variant: 'destructive',
      });
    }
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
            {t('app.boss.page_title')}
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
            ⚔️ {t('app.boss.tab_solo')}
          </button>
          <button
            onClick={() => setActiveTab("coletiva")}
            className={`px-4 py-2 rounded-lg border font-semibold transition-all ${
              activeTab === "coletiva"
                ? "bg-purple-500/20 border-purple-500/50 text-purple-400"
                : "bg-secondary border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            👥 {t('app.boss.tab_dungeon')}
          </button>
          <button
            onClick={() => setActiveTab("ranking")}
            className={`px-4 py-2 rounded-lg border font-semibold transition-all ${
              activeTab === "ranking"
                ? "bg-yellow-500/20 border-yellow-500/50 text-yellow-400"
                : "bg-secondary border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            🏆 {t('app.boss.tab_ranking')}
          </button>
        </div>

        {/* ========== ABA: AVENTURA SOLO ========== */}
        {activeTab === "solo" && (
          <>
            {profile && (
              <div className="rpg-card space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Poder de ataque: <span className="text-primary font-bold">{profile.level * 15}</span> + bônus aleatório
                  </p>
                  <div className="flex items-center gap-2 bg-primary/10 border border-primary/30 rounded-lg px-3 py-1.5">
                    <span className="text-lg">🔑</span>
                    <span className="font-bold text-primary text-lg">{(profile as any).boss_keys || 0}</span>
                    <span className="text-xs text-muted-foreground">{t('app.boss.keys_label')}</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  💡 Complete missões da rotina para ganhar 🔑 Chaves de Boss. Cada boss custa chaves para ser enfrentado!
                </p>
                <HeroStatusBar />
              </div>
            )}

            {isLoading ? (
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            ) : (
              <div className="space-y-6">
                {activeCombat && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        Arena ativa: {activeCombat.bossIcon} {activeCombat.bossName}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          const next = !arenaVisible;
                          setArenaVisible(next);
                          localStorage.setItem('rpg_combat_arena_visible', String(next));
                        }}
                        className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-secondary px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        title={arenaVisible ? 'Ocultar arena de combate' : 'Mostrar arena de combate'}
                      >
                        {arenaVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        {arenaVisible ? 'Ocultar arena' : 'Mostrar arena'}
                      </button>
                    </div>
                    {arenaVisible ? (
                      <CombatArena
                        combateId={activeCombat.id}
                        initialBossHp={activeCombat.bossHp}
                        initialPlayerHp={activeCombat.playerHp}
                        initialPlayerMp={activeCombat.playerMp}
                        initialPlayerMaxMp={activeCombat.playerMaxMp}
                        initialPlayerFatigue={activeCombat.playerFatigue}
                        bossName={activeCombat.bossName}
                        bossElement={activeCombat.bossElement}
                        onVictory={handleCombatVictory}
                        onDefeat={handleCombatDefeat}
                        onClose={handleCombatClose}
                        hasBasiliscoHead={Boolean(
                          inventory?.some((inv) => (inv.game_items as any)?.effect === 'derrota_guerreiro_imortal'),
                        )}
                        onImmortalFlee={handleCombatClose}
                        onImmortalTrueDefeat={handleImmortalTrueDefeat}
                        companionData={skeletonCompanion ? {
                          name: skeletonCompanion.name,
                          level: skeletonCompanion.level,
                          mood: computeLiveMood(skeletonCompanion),
                        } : undefined}
                      />
                    ) : (
                      <div className="rpg-card flex items-center justify-between gap-4 py-4">
                        <div className="flex items-center gap-3">
                          <span className="text-3xl">{activeCombat.bossIcon}</span>
                          <div>
                            <p className="font-semibold text-foreground">Combate em andamento</p>
                            <p className="text-xs text-muted-foreground">Arena oculta — o combate continua normalmente</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setArenaVisible(true);
                            localStorage.setItem('rpg_combat_arena_visible', 'true');
                          }}
                          className="flex items-center gap-1.5 rounded-lg bg-primary/20 border border-primary/40 px-3 py-1.5 text-xs text-primary font-semibold hover:bg-primary/30 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Abrir arena
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {bosses?.map((boss: any, i: number) => {
                  const b = getBossCombatStats(boss);
                  const skills = (boss.skills || []) as { name: string; desc: string }[];
                  const elementColors: Record<string, string> = {
                    'Fogo': 'text-orange-400', 'Terra': 'text-amber-600', 'Gelo': 'text-cyan-400',
                    'Escuridão': 'text-purple-400', 'Morto-Vivo': 'text-gray-400', 'Sagrado': 'text-yellow-300',
                    'Natureza': 'text-green-400', 'Veneno': 'text-lime-400', 'Demônio': 'text-red-500',
                    'Água': 'text-blue-400', 'Neutro': 'text-muted-foreground',
                  };
                  const difficultyStars = (boss.difficulty || '+P').split('+P').length - 1;
                  const isDefeated = defeatedBossIds.has(boss.id);
                  const isLocked = profile && profile.level < boss.level;

                  return (
                  <motion.div
                    key={boss.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: Math.min(i * 0.05, 0.5) }}
                    className={`rpg-card-glow flex flex-col items-center text-center gap-3 ${isLocked ? 'opacity-50' : ''}`}
                  >
                    <span className="text-5xl animate-float">{boss.icon}</span>
                    <div>
                      <h3 className="font-display font-bold text-foreground">{boss.name}</h3>
                      <p className={`text-xs font-semibold mt-1 ${elementColors[boss.element] || 'text-muted-foreground'}`}>
                        🔮 {boss.element || 'Neutro'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">{boss.description}</p>
                    </div>

                    {/* Stats row */}
                    <div className="flex gap-3 text-xs flex-wrap justify-center">
                      <span className="text-health font-bold">❤️ {boss.hp} HP</span>
                      <span className="text-primary font-bold">⭐ Nv.{boss.level}</span>
                      <span className="text-xp font-bold">🏆 {boss.xp_reward} XP</span>
                      <span className="font-bold text-accent">🪙 {boss.gold_reward || 10}</span>
                      <span className="font-bold text-primary">🔑 {boss.keys_cost || 1}</span>
                    </div>

                    {/* Difficulty */}
                    <div className="flex items-center gap-1 text-xs">
                      <span className="text-muted-foreground">{t('app.boss.difficulty_label')}:</span>
                      {Array.from({ length: difficultyStars }).map((_, idx) => (
                        <span key={idx} className="text-yellow-400">⭐</span>
                      ))}
                    </div>

                    {/* Skills */}
                    {skills.length > 0 && (
                      <div className="w-full rounded-lg border border-border/60 bg-muted/30 p-2 text-xs text-left space-y-1">
                        <p className="font-semibold text-foreground mb-1">⚡ {t('app.boss.skills_label')}:</p>
                        {skills.map((skill, idx) => (
                          <div key={idx}>
                            <span className="font-semibold text-primary">{skill.name}</span>
                            <span className="text-muted-foreground"> — {skill.desc}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Mechanic */}
                    {boss.mechanic && (
                      <div className="w-full text-xs text-left bg-primary/10 rounded-lg p-2 border border-primary/20">
                        <span className="font-semibold text-primary">🎯 {t('app.boss.mechanic_label')}:</span>{' '}
                        <span className="text-foreground">{boss.mechanic}</span>
                      </div>
                    )}

                    {/* Combat stats */}
                    <div className="w-full rounded-lg border border-border/60 bg-muted/30 p-2 text-xs">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div><p className="text-muted-foreground">ATK</p><p className="font-bold text-foreground">{b.atk}</p></div>
                        <div><p className="text-muted-foreground">MATK</p><p className="font-bold text-foreground">{b.matk}</p></div>
                        <div><p className="text-muted-foreground">DEF</p><p className="font-bold text-foreground">{b.def}</p></div>
                        <div><p className="text-muted-foreground">AGI</p><p className="font-bold text-foreground">{b.agi}</p></div>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-2">
                        {t('app.boss.weakness_label')}: <span className="font-semibold text-primary">{b.weakness}</span> • {t('app.boss.threat_label')}: <span className="font-semibold text-destructive">{b.threat}</span>
                      </p>
                    </div>

                    {isDefeated ? (
                      <Button disabled className="w-full bg-muted text-muted-foreground cursor-not-allowed" size="sm">
                        ✅ {t('app.boss.boss_defeated')}
                      </Button>
                    ) : isLocked ? (
                      <Button disabled className="w-full bg-muted text-muted-foreground cursor-not-allowed" size="sm">
                        🔒 {t('app.boss.requires_level', { n: boss.level })}
                      </Button>
                    ) : ((profile as any)?.boss_keys || 0) < (boss.keys_cost || 1) ? (
                      <Button disabled className="w-full bg-muted text-muted-foreground cursor-not-allowed" size="sm">
                        🔑 {t('app.boss.needs_keys', { need: boss.keys_cost || 1, have: (profile as any)?.boss_keys || 0 })}
                      </Button>
                    ) : (
                      <div className="w-full grid grid-cols-1 gap-2">
                        <Button
                          onClick={() => handleStartArenaCombat(boss)}
                          disabled={startActiveCombat.isPending}
                          className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                          size="sm"
                        >
                          {startActiveCombat.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin mr-1" />
                          ) : (
                            <Skull className="w-4 h-4 mr-1" />
                          )}
                          {t('app.boss.fight_boss', { keys: boss.keys_cost || 1 })}
                        </Button>
                      </div>
                    )}
                  </motion.div>
                  );
                })}
                </div>
              </div>
            )}

            {/* Battle history */}
            {battles && battles.length > 0 && (
              <div>
                <h2 className="text-lg font-display font-semibold text-foreground mb-3">{t('app.boss.battle_history')}</h2>
                <div className="space-y-2">
                  {battles.slice(0, 10).map((b) => (
                    <div key={b.id} className="rpg-card flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span>{(b as any).bosses?.icon}</span>
                        <div>
                          <p className="text-sm text-foreground">{(b as any).bosses?.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {t('app.boss.damage_dealt')}: {b.damage_dealt} • {new Date(b.created_at).toLocaleString('pt-BR')}
                          </p>
                        </div>
                      </div>
                      <span className={`text-sm font-bold ${b.won ? 'text-success' : 'text-destructive'}`}>
                        {b.won ? `✅ ${t('app.boss.victory')}` : `❌ ${t('app.boss.defeat')}`}
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
                        <p className="text-muted-foreground">Recompensas</p>
                        <p className="font-bold text-xp mt-1">✨ {dungeon.xpReward} XP</p>
                        <p className="text-muted-foreground">🪙 {dungeon.specialCoin}</p>
                        <p className="text-muted-foreground">🎁 {dungeon.uniqueItem}</p>
                        <p className="text-muted-foreground">🏅 {dungeon.titleReward}</p>
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
            {/* Sub-tabs: Mundial / Minha Região */}
            <div className="flex gap-2">
              <button
                onClick={() => setRankingView('mundial')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-semibold transition-all ${
                  rankingView === 'mundial'
                    ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400'
                    : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                <Globe className="w-4 h-4" /> Mundial
              </button>
              <button
                onClick={() => setRankingView('regional')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-semibold transition-all ${
                  rankingView === 'regional'
                    ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                    : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                🌎 Minha Região
                {profile?.region && rankingView === 'regional' && (
                  <span className="text-xs font-normal opacity-75">({REGION_LABELS[profile.region] ?? profile.region})</span>
                )}
              </button>
            </div>
            {rankingView === 'regional' && !profile?.region && (
              <div className="rpg-card bg-yellow-500/10 border-yellow-500/30">
                <p className="text-sm text-yellow-400">⚠️ Você ainda não definiu sua região. Configure no seu perfil para ver o ranking regional.</p>
              </div>
            )}

            {/* Power Level Formula */}
            <div className="rpg-card bg-secondary/50 border-border/50">
              <div className="flex items-center gap-2 mb-2">
                <Flame className="w-4 h-4 text-yellow-400" />
                <p className="text-sm font-bold text-foreground">{t('app.boss.power_level_title')}</p>
              </div>
              <div className="bg-muted/60 rounded-lg p-3 border border-border/40 font-mono text-center">
                <p className="text-sm text-primary font-bold">Poder = (Nível × 100) + (XP Total ÷ 10)</p>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                {t('app.boss.power_level_desc')}
              </p>
            </div>

            {/* Your position */}
            {profile && rankings && (
              <div className="rpg-card bg-primary/5 border-primary/30">
                <div className="flex items-center gap-3">
                  <Crown className="w-5 h-5 text-primary" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">{t('app.boss.your_position')}</p>
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
                          {isCurrentUser && <span className="text-xs text-primary ml-2">({t('app.boss.you')})</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Nível {player.level} • {player.total_xp} XP • ⚡ Poder: {power}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-lg font-bold text-primary">{power}</p>
                        <p className="text-[10px] text-muted-foreground">⚡ Poder</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="rpg-card text-center py-8">
                <Trophy className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground">{t('app.boss.no_players')}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Skeleton Story Dialog ──────────────────────────────────────────── */}
      <Dialog open={skeletonStoryOpen} onOpenChange={setSkeletonStoryOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              💀 Um Último Segredo…
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 pt-2 text-sm text-muted-foreground leading-relaxed">
                <p>
                  Enquanto o Esqueletão Campeão desmorona, algo se mexe entre os ossos espalhados
                  no chão…
                </p>
                <p>
                  Um <span className="text-violet-400 font-semibold">filhote de esqueleto</span> —
                  pequeno, confuso, olhos-de-fogo piscando — emerge da névoa.
                  Era o filho do campeão. Agora está sozinho.
                </p>
                <p>
                  Ele olha para você. Não com raiva. Com curiosidade.
                </p>
                <p className="font-semibold text-foreground">
                  Você deseja treinar esse filhote e levá-lo como companheiro?
                </p>
                <div className="pt-1">
                  <p className="text-xs">Que nome você daria a ele?</p>
                  <Input
                    value={skeletonPupName}
                    onChange={(e) => setSkeletonPupName(e.target.value)}
                    placeholder="Ex: Ossinho, Fang, Sombra…"
                    className="mt-1.5"
                    maxLength={32}
                  />
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => {
                saveSkeletonChoice.mutate('reject', {
                  onSuccess: () => toast({ title: 'O filhote desapareceu na escuridão… Por ora. 💀' }),
                });
                setSkeletonStoryOpen(false);
              }}
            >
              Deixar partir
            </Button>
            <Button
              className="w-full sm:w-auto bg-violet-600 hover:bg-violet-700"
              disabled={adoptSkeletonPup.isPending || saveSkeletonChoice.isPending}
              onClick={() => {
                const name = skeletonPupName.trim() || 'Ossinho';
                saveSkeletonChoice.mutate('adopt', {
                  onSuccess: () => {
                    adoptSkeletonPup.mutate(name, {
                      onSuccess: () => toast({ title: `💀 ${name} decidiu seguir você! Cuide bem dele.` }),
                      onError: () => toast({ title: 'Erro ao adotar o filhote. Tente novamente.', variant: 'destructive' }),
                    });
                  },
                });
                setSkeletonStoryOpen(false);
              }}
            >
              💀 Adotar {skeletonPupName || 'Ossinho'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Mantiroca Warning Dialog ───────────────────────────────────────── */}
      <Dialog open={!!mantirocaWarningBoss} onOpenChange={(open) => { if (!open) setMantirocaWarningBoss(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              Aliança Inesperada!
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 pt-2 text-sm text-muted-foreground leading-relaxed">
                <p>
                  Quando você se aproxima da <span className="font-semibold text-foreground">Mantiroca Venenosa</span>,
                  uma figura familiar surge montada em seu dorso…
                </p>
                <p>
                  É o <span className="text-violet-400 font-semibold">filhote do Esqueletão</span> —
                  o mesmo que você recusou acolher. Ele encontrou um novo lar… e um novo propósito.
                </p>
                <p>
                  Juntos, eles são mais perigosos.{' '}
                  <span className="font-semibold text-red-400">A Mantiroca tem +40% de HP!</span>
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setMantirocaWarningBoss(null)}
            >
              Voltar
            </Button>
            <Button
              variant="destructive"
              className="w-full sm:w-auto"
              disabled={startActiveCombat.isPending}
              onClick={() => {
                const boss = mantirocaWarningBoss;
                setMantirocaWarningBoss(null);
                handleStartArenaCombat(boss, boostedMantirocaHp);
              }}
            >
              Enfrentar assim mesmo ⚔️
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

