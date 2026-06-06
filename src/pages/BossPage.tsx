import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useBosses, useBossBattles, useProfile, useAttributes, useStartActiveCombat, useHealthStats, useWorldEventBosses } from '@/hooks/useProfile';
import { getLevelFromXp } from '@/lib/progression';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Loader2, Skull, Users, Flame, Trophy, Globe, Crown, Eye, EyeOff, AlertTriangle, Copy, Swords, UserPlus, LogIn } from 'lucide-react';
import GuidedTour, { type TourStep } from '@/components/GuidedTour';

import { useToast } from '@/hooks/use-toast';
import { getAttributeLevels, getBossCombatStats, getPlayerCombatStats } from '@/lib/combat';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import CombatArena from '@/components/CombatArena';
import DungeonArena, { type PotionItem, type SessionPlayer } from '@/components/DungeonArena';
import HeroStatusBar from '@/components/HeroStatusBar';
import { useHeroStoryChoices, useSaveSkeletonChoice } from '@/hooks/useHeroStoryChoices';
import { useAdoptSkeletonPup, useSkeletonCompanion, computeLiveMood } from '@/hooks/useCompanion';
import { useAuth } from '@/hooks/useAuth';
import { useInventory, getEquipmentBonuses, type InventoryItem } from '@/hooks/useInventory';

/** Boss name patterns for story events (case-insensitive match) */
const SKELETON_BOSS_PATTERN   = /esquelet/i;
const MANTIROCA_BOSS_PATTERN  = /mantiroca/i;
const IMMORTAL_BOSS_PATTERN   = /guerreiro\s+imortal/i;
// Sphinx do Deserto (lv14): gatilho da fusão Fênix -> Esfinge (roadmap #2).
// Não casa com "Esfinge Guardiã" (lv41), que é outro boss.
const SPHINX_BOSS_PATTERN     = /sphinx\s+do\s+deserto/i;
// Cadeia nórdica (roadmap #5).
const GOLEM_ADAMANTINA_PATTERN = /golem\s+de\s+adamantina/i;
const FENRIR_BOSS_PATTERN      = /fenrir/i;
const ODIN_BOSS_PATTERN        = /\bodin\b/i;

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
      const { data, error } = await supabase.rpc('get_rankings', {
        p_region: region,
      });
      if (error) throw error;
      return data as { user_id: string; display_name: string; level: number; total_xp: number; region: string; avatar_url: string }[];
    },
    refetchInterval: 60000,
  });
}

// ── Eventos Mundiais (teaser) ───────────────────────────────────────────────
// Mostra os bosses de raide-evento em modo "em breve"/"anunciado" (com data).
// A parte jogável (lobby + combate) é ligada quando event_status vira 'live'.
function WorldEventsTeaser() {
  const { t, i18n } = useTranslation();
  const { data: events = [] } = useWorldEventBosses();
  if (!events.length) return null;

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString(i18n.language, { dateStyle: 'short', timeStyle: 'short' });
  const relative = (iso: string) => {
    const diff = new Date(iso).getTime() - Date.now();
    if (diff <= 0) return null;
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    if (days > 0) return t('app.boss.event_in_days', { days, hours });
    return t('app.boss.event_in_hours', { hours: Math.max(1, hours) });
  };

  return (
    <div className="rpg-card-glow border-fuchsia-500/30 bg-gradient-to-br from-fuchsia-500/10 to-slate-900/40 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-2xl">🌍</span>
        <div>
          <h2 className="font-display font-bold text-lg text-fuchsia-300">{t('app.boss.events_title')}</h2>
          <p className="text-[11px] text-muted-foreground">{t('app.boss.events_subtitle')}</p>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {(events as any[]).map((ev) => {
          const announced = ev.event_status === 'announced' && ev.event_starts_at;
          const live = ev.event_status === 'live';
          return (
            <div key={ev.id} className="rounded-xl border border-border/60 bg-card/50 p-3 flex items-center gap-3">
              <span className="text-3xl shrink-0">{ev.icon ?? '🌑'}</span>
              <div className="min-w-0">
                <p className="font-display font-bold text-sm text-foreground truncate">{ev.name}</p>
                {live ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    🟢 {t('app.boss.event_live')}
                  </span>
                ) : announced ? (
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      📅 {fmtDate(ev.event_starts_at)}
                    </span>
                    {relative(ev.event_starts_at) && (
                      <p className="text-[10px] text-amber-300/80">{relative(ev.event_starts_at)}</p>
                    )}
                  </div>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                    🔒 {t('app.boss.event_soon')}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
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
  const [phoenixFusionOpen,    setPhoenixFusionOpen]    = useState(false);
  const [phoenixFusing,        setPhoenixFusing]        = useState(false);
  // ── Cadeia nórdica (roadmap #5) ──
  const [ferreiroRescueOpen,   setFerreiroRescueOpen]   = useState(false);
  const [ferreiroRescuing,     setFerreiroRescuing]     = useState(false);
  const [fenrirChoiceOpen,     setFenrirChoiceOpen]     = useState(false);
  const [fenrirChoosing,       setFenrirChoosing]       = useState(false);
  const [odinIntroBoss,        setOdinIntroBoss]        = useState<any | null>(null);
  const [mantirocaWarningBoss, setMantirocaWarningBoss] = useState<any | null>(null);
  const [boostedMantirocaHp,   setBoostedMantirocaHp]   = useState(0);
  const [deathWarningBoss,     setDeathWarningBoss]     = useState<any | null>(null);
  // ────────────────────────────────────────────────────────────────────────

  const [activeDungeon, setActiveDungeon] = useState<{ id: string; name: string; friendCount: number; sessionId?: string; sessionPlayers?: SessionPlayer[]; isHost?: boolean } | null>(null);
  const [activeCombat, setActiveCombat] = useState<{ id: string; bossId: string; bossName: string; bossIcon: string; bossElement: string | null; bossHp: number; playerHp: number; playerMp: number; playerMaxMp: number; playerFatigue: number } | null>(null);

  // ── Dungeon co-op session state ───────────────────────────────────────────
  type SessionFlow = 'idle' | 'choosing' | 'creating' | 'lobby' | 'joining';
  const [sessionFlow,     setSessionFlow]     = useState<SessionFlow>('idle');
  const [sessionDungeon,  setSessionDungeon]  = useState<{ id: string; name: string } | null>(null);
  const [sessionData,     setSessionData]     = useState<{ id: string; inviteCode: string; layoutIndex: number } | null>(null);
  const [sessionPlayers,  setSessionPlayers]  = useState<SessionPlayer[]>([]);
  const [joinCodeInput,   setJoinCodeInput]   = useState('');
  const [sessionLoading,  setSessionLoading]  = useState(false);
  const sessionChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [arenaVisible, setArenaVisible] = useState<boolean>(() => {
    const stored = localStorage.getItem('rpg_combat_arena_visible');
    return stored === null ? true : stored === 'true';
  });
  const [activeTab, setActiveTab] = useState<"solo" | "coletiva" | "ranking">("solo");
  const [rankingView, setRankingView] = useState<'mundial' | 'regional'>('mundial');
  const effectiveRegion = rankingView === 'mundial' ? null : (profile?.region ?? null);
  const { data: rankings, isLoading: rankingsLoading } = useRankings(effectiveRegion);
  const attrLevels = getAttributeLevels(attributes as any[]);
  const playerStatsBase = getPlayerCombatStats(profile?.level || 1, attrLevels);
  const equipBonuses = getEquipmentBonuses((inventory || []) as InventoryItem[]);

  /** True se o jogador possui Tridente de Poseidon OU Chama Eterna de Ifrit */
  const phoenixCanDie = Boolean(
    inventory?.some((inv) =>
      (inv.game_items as any)?.effect === 'derrota_fenix_permanente' ||
      (inv.game_items as any)?.effect === 'captura_fenix_pet',
    ),
  );
  const playerStats = {
    ...playerStatsBase,
    atk:  playerStatsBase.atk  + equipBonuses.atk,
    matk: playerStatsBase.matk + equipBonuses.matk,
    def:  playerStatsBase.def  + equipBonuses.def,
    agi:  playerStatsBase.agi  + equipBonuses.agi,
    crit: playerStatsBase.crit + equipBonuses.crit,
    hp:   playerStatsBase.hp   + equipBonuses.hp,
    mp:   playerStatsBase.mp + equipBonuses.mp,
  };

  const handleCombatVictory = () => {
    queryClient.invalidateQueries({ queryKey: ['boss_battles'] });
    queryClient.invalidateQueries({ queryKey: ['profile'] });
    queryClient.invalidateQueries({ queryKey: ['health_stats'] });
    queryClient.invalidateQueries({ queryKey: ['gold-balance'] });

    // Skeleton story: fires once after defeating an "Esquelet…" boss
    const bossName = activeCombat?.bossName ?? '';
    if (SKELETON_BOSS_PATTERN.test(bossName) && !storyChoices?.skeleton_champion) {
      setTimeout(() => setSkeletonStoryOpen(true), 1500);
    }

    // Fusão Fênix -> Esfinge (roadmap #2): ao vencer a Sphinx do Deserto, se o
    // herói já enfrentou a Fênix Renascente (que escapou ao menos 1×) e ainda
    // não houve a união, dispara o encadeamento de história uma única vez.
    if (
      SPHINX_BOSS_PATTERN.test(bossName) &&
      (storyChoices?.phoenix_kill_count ?? 0) >= 1 &&
      !storyChoices?.phoenix_fused
    ) {
      setTimeout(() => setPhoenixFusionOpen(true), 1500);
    }

    // ── Cadeia nórdica (roadmap #5) ──────────────────────────────────────────
    // Golem de Adamantina derrotado -> dropa a Picareta e abre o resgate do Ferreiro.
    if (GOLEM_ADAMANTINA_PATTERN.test(bossName) && !storyChoices?.picareta_adamantina) {
      void grantPicaretaAdamantina();
    }
    // Fenrir derrotado -> oferece libertá-lo das correntes (vira aliado contra Odin).
    if (FENRIR_BOSS_PATTERN.test(bossName) && !storyChoices?.fenrir_allied) {
      setTimeout(() => setFenrirChoiceOpen(true), 1500);
    }
  };

  /** Golem de Adamantina: concede a Picareta de Adamantina e dispara o resgate do Ferreiro. */
  const grantPicaretaAdamantina = async () => {
    if (!user) return;
    try {
      const { data: picareta } = await supabase
        .from('game_items')
        .select('id')
        .eq('effect', 'quest_picareta_adamantina')
        .maybeSingle();
      if (picareta) {
        const { data: existing } = await supabase
          .from('user_inventory')
          .select('id')
          .eq('user_id', user.id)
          .eq('item_id', (picareta as any).id)
          .maybeSingle();
        if (!existing) {
          await supabase.from('user_inventory').insert({
            user_id: user.id, item_id: (picareta as any).id, quantity: 1, equipped: false,
          });
        }
      }
      await supabase.from('hero_story_choices').upsert({
        user_id: user.id, picareta_adamantina: true,
      }, { onConflict: 'user_id' });
      queryClient.invalidateQueries({ queryKey: ['hero_story_choices', user.id] });
      queryClient.invalidateQueries({ queryKey: ['inventory', user.id] });
      toast({
        title: t('app.boss.toast_picareta_title'),
        description: t('app.boss.toast_picareta_desc'),
        duration: 6000,
      });
      // Abre o evento de resgate do Ferreiro logo em seguida.
      if (!storyChoices?.ferreiro_rescued) {
        setTimeout(() => setFerreiroRescueOpen(true), 2200);
      }
    } catch {
      // silencioso — UI atualiza via invalidate
    }
  };

  const FERREIRO_RESCUE_XP = 300;
  /** Resgate do Ferreiro (evento de história): liberta o Ferreiro com a Picareta. */
  const handleConfirmFerreiroRescue = async () => {
    if (!user) { setFerreiroRescueOpen(false); return; }
    setFerreiroRescuing(true);
    try {
      await supabase.from('hero_story_choices').upsert({
        user_id: user.id, ferreiro_rescued: true,
      }, { onConflict: 'user_id' });
      await supabase.rpc('add_xp_to_user', { p_user_id: user.id, p_xp: FERREIRO_RESCUE_XP });
      queryClient.invalidateQueries({ queryKey: ['hero_story_choices', user.id] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['xp_history'] });
      toast({
        title: t('app.boss.toast_ferreiro_title'),
        description: t('app.boss.toast_ferreiro_desc', { xp: FERREIRO_RESCUE_XP }),
        duration: 6000,
      });
    } catch (err: any) {
      toast({ title: t('app.boss.toast_ferreiro_error'), description: err?.message, variant: 'destructive' });
    } finally {
      setFerreiroRescuing(false);
      setFerreiroRescueOpen(false);
    }
  };

  /** Fenrir: o jogador decide libertá-lo das correntes divinas (vira aliado) ou não. */
  const handleFenrirChoice = async (ally: boolean) => {
    if (!user) { setFenrirChoiceOpen(false); return; }
    setFenrirChoosing(true);
    try {
      await supabase.from('hero_story_choices').upsert({
        user_id: user.id, fenrir_allied: ally,
      }, { onConflict: 'user_id' });
      queryClient.invalidateQueries({ queryKey: ['hero_story_choices', user.id] });
      toast({
        title: ally ? t('app.boss.toast_fenrir_ally_title') : t('app.boss.toast_fenrir_left_title'),
        description: ally ? t('app.boss.toast_fenrir_ally_desc') : t('app.boss.toast_fenrir_left_desc'),
        duration: 6000,
      });
    } catch (err: any) {
      toast({ title: t('app.boss.toast_fenrir_error'), description: err?.message, variant: 'destructive' });
    } finally {
      setFenrirChoosing(false);
      setFenrirChoiceOpen(false);
    }
  };

  const handleCombatDefeat = async () => {
    // ── Penalidade de morte: -1 nível + fadiga 100 ──────────────────────────
    if (user && profile) {
      const currentLevel = profile.level ?? 1;
      const newLevel = Math.max(1, currentLevel - 1);
      try {
        await Promise.all([
          supabase.from('profiles').update({ level: newLevel }).eq('user_id', user.id),
          supabase.from('user_health_stats').update({ fatigue: 100 }).eq('user_id', user.id),
        ]);
        toast({
          title: t('app.boss.toast_severe_defeat_title'),
          description: t('app.boss.toast_severe_defeat_desc', { level: newLevel }),
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
        await supabase.from('user_inventory').delete().eq('id', basiliscoInv.id);
        queryClient.invalidateQueries({ queryKey: ['inventory', user.id] });
      }

      // 2. Registrar vitória verdadeira em boss_battles
      await supabase.from('boss_battles').insert({
        user_id: user.id,
        boss_id: activeCombat.bossId,
        damage_dealt: 1,
        won: true,
      });

      // 3. Recompensas de XP — usa xp_reward do DB (mesmo valor exibido no card)
      const bossData = (bosses as any[])?.find((b: any) => b.id === activeCombat.bossId);
      if (bossData) {
        const xpReward   = Math.max(50, bossData.xp_reward   || (bossData.level || 10) * 80 + 20);
        const goldReward = Math.max(10, bossData.gold_reward  || (bossData.level || 10) * 15 + 10);
        // 🔒 Server-side: crédito de XP/ouro do combate via RPCs (valores lidos
        // do boss no banco acima). add_xp_to_user usa a XP_TABLE oficial.
        await supabase.rpc('add_xp_to_user', { p_user_id: user.id, p_xp: xpReward });
        await supabase.rpc('add_gold_to_user', { p_user_id: user.id, p_gold: goldReward });
      }

      // 4. Drop Fragmento I do Pergaminho Ancestral
      const { data: fragmentItem } = await supabase
        .from('game_items')
        .select('id')
        .eq('effect', 'quest_scroll_fragment_1')
        .maybeSingle();
      if (fragmentItem) {
        await supabase.from('user_inventory').insert({
          user_id: user.id,
          item_id: (fragmentItem as any).id,
          quantity: 1,
          equipped: false,
        });
      }

      // 5. Marcar como verdadeiramente derrotado
      await supabase.from('hero_story_choices').upsert({
        user_id: user.id,
        guerreiro_imortal_defeated: true,
      }, { onConflict: 'user_id' });

      queryClient.invalidateQueries({ queryKey: ['boss_battles'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['inventory', user.id] });
      queryClient.invalidateQueries({ queryKey: ['hero_story_choices', user.id] });
      queryClient.invalidateQueries({ queryKey: ['gold-balance'] });

      toast({
        title: t('app.boss.toast_immortal_defeated_title'),
        description: t('app.boss.toast_immortal_defeated_desc'),
      });
      setTimeout(() => {
        toast({
          title: t('app.boss.toast_fragment_title'),
          description: t('app.boss.toast_fragment_desc'),
        });
      }, 2200);

      setActiveCombat(null);
    } catch (err: any) {
      toast({ title: t('app.boss.toast_true_defeat_error'), description: err?.message, variant: 'destructive' });
    }
  };

  const handleCombatClose = () => {
    setActiveCombat(null);
  };

  /** Fênix Renascente: escapa — incrementa phoenix_kill_count e fecha o combate.
   *  (Antes gravava em 'phoenix_escape_count', coluna inexistente — bug silencioso.) */
  const handlePhoenixEscaped = async () => {
    if (!user) return;
    try {
      const { data: choices } = await supabase
        .from('hero_story_choices')
        .select('phoenix_kill_count')
        .eq('user_id', user.id)
        .maybeSingle();
      const currentCount = (choices as any)?.phoenix_kill_count ?? 0;
      await supabase.from('hero_story_choices').upsert({
        user_id: user.id,
        phoenix_kill_count: currentCount + 1,
      }, { onConflict: 'user_id' });
      queryClient.invalidateQueries({ queryKey: ['hero_story_choices', user.id] });
      const nextLevel = 10 + (currentCount + 1) * 10;
      toast({
        title: t('app.boss.toast_phoenix_escaped_title'),
        description: t('app.boss.toast_phoenix_escaped_desc', { level: nextLevel }),
        duration: 6000,
      });
    } catch {
      // silencioso — UI atualiza via invalidate
    } finally {
      setActiveCombat(null);
    }
  };

  /** Fusão Fênix -> Esfinge (roadmap #2): marca phoenix_fused e concede o XP
   *  "devido" pela Fênix (que nunca premiou ao escapar). Servidor credita via RPC. */
  const PHOENIX_FUSION_XP = 250;
  const handleConfirmPhoenixFusion = async () => {
    if (!user) { setPhoenixFusionOpen(false); return; }
    setPhoenixFusing(true);
    try {
      await supabase.from('hero_story_choices').upsert({
        user_id: user.id,
        phoenix_fused: true,
      }, { onConflict: 'user_id' });
      // 🔒 XP creditado server-side (XP_TABLE oficial), como nos outros marcos.
      await supabase.rpc('add_xp_to_user', { p_user_id: user.id, p_xp: PHOENIX_FUSION_XP });
      queryClient.invalidateQueries({ queryKey: ['hero_story_choices', user.id] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['xp_history'] });
      toast({
        title: t('app.boss.toast_phoenix_fused_title'),
        description: t('app.boss.toast_phoenix_fused_desc', { xp: PHOENIX_FUSION_XP }),
        duration: 6000,
      });
    } catch (err: any) {
      toast({ title: t('app.boss.toast_phoenix_fused_error'), description: err?.message, variant: 'destructive' });
    } finally {
      setPhoenixFusing(false);
      setPhoenixFusionOpen(false);
    }
  };

  const dungeons = useMemo(() => [
    {
      id: '1',
      name: t('app.boss.dungeon_1_name'),
      difficulty: t('app.boss.diff_medium'),
      difficultyKey: 'medium',
      icon: '🧌',
      minLevel: 3,
      requiredPlayers: 4,
      boss: { name: 'Shagor + Zoth', hp: 300 + 160, icon: '🧌👺' },
      xpReward: 240,
      description: t('app.boss.dungeon_1_desc'),
      uniqueItem: t('app.boss.dungeon_1_unique_item'),
      specialCoin: t('app.boss.dungeon_1_special_coin'),
      titleReward: t('app.boss.dungeon_1_title_reward'),
      theme: 'orc',
      atmosphere: t('app.boss.dungeon_1_atmosphere'),
      minions: t('app.boss.dungeon_1_minions', { returnObjects: true }) as string[],
    },
    {
      id: '2',
      name: t('app.boss.dungeon_2_name'),
      difficulty: t('app.boss.diff_hard'),
      difficultyKey: 'hard',
      icon: '🏺',
      minLevel: 8,
      requiredPlayers: 4,
      boss: { name: 'Esfinge Guardiã + Djinn', hp: 420 + 230, icon: '🦁🌪️' },
      xpReward: 390,
      description: t('app.boss.dungeon_2_desc'),
      uniqueItem: t('app.boss.dungeon_2_unique_item'),
      specialCoin: t('app.boss.dungeon_2_special_coin'),
      titleReward: t('app.boss.dungeon_2_title_reward'),
      theme: 'desert',
      atmosphere: t('app.boss.dungeon_2_atmosphere'),
      minions: t('app.boss.dungeon_2_minions', { returnObjects: true }) as string[],
    },
    {
      id: '3',
      name: t('app.boss.dungeon_3_name'),
      difficulty: t('app.boss.diff_legendary'),
      difficultyKey: 'legendary',
      icon: '🌑',
      minLevel: 15,
      requiredPlayers: 4,
      boss: { name: 'Cavaleiro do Vazio + Wyvern', hp: 520 + 310, icon: '🗡️⚡' },
      xpReward: 580,
      description: t('app.boss.dungeon_3_desc'),
      uniqueItem: t('app.boss.dungeon_3_unique_item'),
      specialCoin: t('app.boss.dungeon_3_special_coin'),
      titleReward: t('app.boss.dungeon_3_title_reward'),
      theme: 'shadow',
      atmosphere: t('app.boss.dungeon_3_atmosphere'),
      minions: t('app.boss.dungeon_3_minions', { returnObjects: true }) as string[],
    },
  ], [t]);

  const bossTourSteps: TourStep[] = [
    { target: 'boss-header', title: t('app.boss.tour_1_title'), description: t('app.boss.tour_1_desc') },
    { target: 'boss-tabs',   title: t('app.boss.tour_2_title'), description: t('app.boss.tour_2_desc') },
    { target: 'boss-keys',   title: t('app.boss.tour_3_title'), description: t('app.boss.tour_3_desc') },
    { target: 'boss-list',   title: t('app.boss.tour_4_title'), description: t('app.boss.tour_4_desc') },
  ];

  // Set of boss IDs already defeated (via boss_battles)
  const defeatedBossIds = new Set(
    battles?.filter((b) => b.won).map((b) => b.boss_id) || []
  );

  // Conjunto "efetivo" de derrotados: inclui o boss de esqueleto se ele foi
  // derrotado permanentemente (hero_story_choices), mesmo após reset de admin.
  // Usado para checar pré-requisitos de sequência (roadmap #1).
  const effectiveDefeatedIds = useMemo(() => {
    const set = new Set<string>(battles?.filter((b) => b.won).map((b) => b.boss_id) || []);
    if (storyChoices?.skeleton_champion) {
      const skeletonBoss = (bosses as any[])?.find((b) => SKELETON_BOSS_PATTERN.test(b.name ?? ''));
      if (skeletonBoss) set.add(skeletonBoss.id);
    }
    return set;
  }, [battles, bosses, storyChoices?.skeleton_champion]);

  // Mapa id -> boss, para resolver o nome do pré-requisito a exibir.
  const bossById = useMemo(
    () => new Map<string, any>(((bosses as any[]) || []).map((b) => [b.id, b])),
    [bosses],
  );

  /** Retorna true se o boss de esqueleto está permanentemente derrotado,
   *  mesmo que boss_battles tenha sido resetado via script de admin.
   *  A escolha na hero_story_choices é o registro definitivo. */
  const isSkeletonPermanentlyDefeated = (bossName: string) =>
    SKELETON_BOSS_PATTERN.test(bossName) && !!storyChoices?.skeleton_champion;

  const handleOpenDungeon = (dungeon: { id: string; name: string }) => {
    setSessionDungeon(dungeon);
    setSessionFlow('choosing');
  };

  const closeDungeonSession = useCallback(() => {
    if (sessionChannelRef.current) {
      supabase.removeChannel(sessionChannelRef.current);
      sessionChannelRef.current = null;
    }
    setSessionFlow('idle');
    setSessionDungeon(null);
    setSessionData(null);
    setSessionPlayers([]);
    setJoinCodeInput('');
  }, []);

  // Subscribe to Realtime for session lobby
  const subscribeLobby = useCallback((sessionId: string) => {
    if (sessionChannelRef.current) supabase.removeChannel(sessionChannelRef.current);

    const channel = supabase.channel(`dungeon_lobby:${sessionId}`);
    sessionChannelRef.current = channel;

    channel
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'dungeon_session_players',
        filter: `session_id=eq.${sessionId}`,
      }, async () => {
        // Re-fetch players
        const { data } = await supabase
          .from('dungeon_session_players')
          .select('user_id,display_name,current_hp,max_hp,player_level,player_atk,player_def,is_host,is_alive')
          .eq('session_id', sessionId);
        if (data) {
          setSessionPlayers(data.map((p: any) => ({
            userId: p.user_id,
            displayName: p.display_name,
            hp: p.current_hp,
            maxHp: p.max_hp,
            level: p.player_level,
            atk: p.player_atk,
            def: p.player_def,
            isHost: p.is_host,
            isAlive: p.is_alive,
          })));
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'dungeon_sessions',
        filter: `id=eq.${sessionId}`,
      }, ({ new: newRow }: any) => {
        if (newRow?.status === 'in_progress') {
          // Host started — launch DungeonArena for everyone
          const dungeon = sessionDungeon;
          if (!dungeon) return;
          const isH = sessionPlayers.find(p => p.userId === user?.id)?.isHost ?? false;
          setSessionFlow('idle');
          setActiveDungeon({
            id: dungeon.id,
            name: dungeon.name,
            friendCount: Math.max(0, sessionPlayers.length - 1),
            sessionId,
            sessionPlayers,
            isHost: isH,
          });
        }
      })
      .subscribe();
  }, [sessionDungeon, sessionPlayers, user?.id]);

  const handleCreateSession = useCallback(async (dungeon: { id: string; name: string }) => {
    if (!user || !profile) return;
    setSessionLoading(true);
    try {
      const attrLevelsLocal = getAttributeLevels(attributes as any[]);
      const statsLocal = getPlayerCombatStats(profile.level || 1, attrLevelsLocal);
      const curHp  = healthStats?.current_hp  != null ? Number(healthStats.current_hp)  : statsLocal.hp ?? 120;
      const maxHp  = healthStats?.max_hp      != null ? Number(healthStats.max_hp)      : statsLocal.hp ?? 120;

      const { data, error } = await supabase.rpc('create_dungeon_session', {
        p_dungeon_id:   dungeon.id,
        p_display_name: profile.display_name || 'Herói',
        p_current_hp:   curHp,
        p_max_hp:       maxHp,
        p_player_level: profile.level || 1,
        p_player_atk:   statsLocal.atk ?? 15,
        p_player_def:   statsLocal.def ?? 8,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      setSessionData({ id: row.session_id, inviteCode: row.invite_code, layoutIndex: row.layout_index });
      setSessionPlayers([{
        userId:      user.id,
        displayName: profile.display_name || 'Herói',
        hp:          curHp,
        maxHp:       maxHp,
        level:       profile.level || 1,
        atk:         statsLocal.atk ?? 15,
        def:         statsLocal.def ?? 8,
        isHost:      true,
        isAlive:     true,
      }]);
      setSessionFlow('lobby');
      subscribeLobby(row.session_id);
    } catch (err: any) {
      toast({ title: t('app.boss.error_create_session'), description: err?.message, variant: 'destructive' });
    } finally {
      setSessionLoading(false);
    }
  }, [user, profile, attributes, healthStats, toast, subscribeLobby]);

  const handleJoinSession = useCallback(async () => {
    if (!user || !profile || !joinCodeInput.trim()) return;
    setSessionLoading(true);
    try {
      const attrLevelsLocal = getAttributeLevels(attributes as any[]);
      const statsLocal = getPlayerCombatStats(profile.level || 1, attrLevelsLocal);
      const curHp  = healthStats?.current_hp  != null ? Number(healthStats.current_hp)  : statsLocal.hp ?? 120;
      const maxHp  = healthStats?.max_hp      != null ? Number(healthStats.max_hp)      : statsLocal.hp ?? 120;

      const { data, error } = await supabase.rpc('join_dungeon_session', {
        p_invite_code:  joinCodeInput.trim().toUpperCase(),
        p_display_name: profile.display_name || 'Herói',
        p_current_hp:   curHp,
        p_max_hp:       maxHp,
        p_player_level: profile.level || 1,
        p_player_atk:   statsLocal.atk ?? 15,
        p_player_def:   statsLocal.def ?? 8,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      // Find dungeon by id
      const dg = dungeons.find(d => d.id === row.dungeon_id) || dungeons[0];
      setSessionDungeon({ id: dg.id, name: dg.name });
      setSessionData({ id: row.session_id, inviteCode: joinCodeInput.trim().toUpperCase(), layoutIndex: row.layout_index });

      // Fetch current players
      const { data: playersData } = await supabase
        .from('dungeon_session_players')
        .select('user_id,display_name,current_hp,max_hp,player_level,player_atk,player_def,is_host,is_alive')
        .eq('session_id', row.session_id);
      if (playersData) {
        setSessionPlayers(playersData.map((p: any) => ({
          userId: p.user_id, displayName: p.display_name, hp: p.current_hp, maxHp: p.max_hp,
          level: p.player_level, atk: p.player_atk, def: p.player_def, isHost: p.is_host, isAlive: p.is_alive,
        })));
      }
      setSessionFlow('lobby');
      subscribeLobby(row.session_id);
      toast({ title: t('app.boss.toast_joined_session', { host: row.host_name }) });
    } catch (err: any) {
      toast({ title: t('app.boss.error_join_session'), description: err?.message, variant: 'destructive' });
    } finally {
      setSessionLoading(false);
    }
  }, [user, profile, attributes, healthStats, joinCodeInput, dungeons, toast, subscribeLobby]);

  const handleStartSession = useCallback(async () => {
    if (!sessionData) return;
    setSessionLoading(true);
    try {
      const { error } = await supabase.rpc('start_dungeon_session', { p_session_id: sessionData.id });
      if (error) throw error;
      // The Realtime listener will fire and open DungeonArena for all
      // But also open it directly for host as fallback
      const dungeon = sessionDungeon;
      if (!dungeon) return;
      setSessionFlow('idle');
      setActiveDungeon({
        id:             dungeon.id,
        name:           dungeon.name,
        friendCount:    Math.max(0, sessionPlayers.length - 1),
        sessionId:      sessionData.id,
        sessionPlayers: sessionPlayers,
        isHost:         true,
      });
    } catch (err: any) {
      toast({ title: t('app.boss.error_start_session'), description: err?.message, variant: 'destructive' });
    } finally {
      setSessionLoading(false);
    }
  }, [sessionData, sessionDungeon, sessionPlayers, toast]);

  // Solo: immediately open DungeonArena without session
  const handleSoloOpen = useCallback((dungeon: { id: string; name: string }) => {
    setActiveDungeon({ id: dungeon.id, name: dungeon.name, friendCount: 0 });
    setSessionFlow('idle');
  }, []);

  const handleDungeonVictory = ({ xpGained, goldGained, loot, rescued }: { xpGained: number; goldGained: number; loot: any[]; rescued: number }) => {
    setActiveDungeon(null);
    const rescuedPart = rescued > 0 ? t('app.boss.toast_rescued', { count: rescued }) : '';
    toast({
      title: t('app.boss.toast_dungeon_victory_title'),
      description: t('app.boss.toast_dungeon_victory_desc', { xp: xpGained, gold: goldGained, rescued: rescuedPart, loot: loot.length }),
    });
    queryClient.invalidateQueries({ queryKey: ['profile'] });
    queryClient.invalidateQueries({ queryKey: ['gold-balance'] });
    queryClient.invalidateQueries({ queryKey: ['inventory'] });
  };

  const handleDungeonDefeat = () => {
    setActiveDungeon(null);
    toast({ title: t('app.boss.toast_dungeon_defeat_title'), description: t('app.boss.toast_dungeon_defeat_desc'), variant: 'destructive' });
  };

  const handleFightButtonClick = (boss: any) => {
    // Odin (roadmap #5): intro do 3v1 (Thor + Loki) antes da luta.
    if (ODIN_BOSS_PATTERN.test(boss?.name ?? '')) {
      setOdinIntroBoss(boss);
      return;
    }
    setDeathWarningBoss(boss);
  };

  /** Inicia a luta contra Odin (3v1). Se Fenrir for aliado, concede Inspiração (vantagem). */
  const handleStartOdinFight = async () => {
    const boss = odinIntroBoss;
    setOdinIntroBoss(null);
    if (!boss) return;
    if (storyChoices?.fenrir_allied && user) {
      try {
        await supabase
          .from('profiles')
          .update({ inspired_available: true, inspired_earned_at: new Date().toISOString() })
          .eq('user_id', user.id);
        queryClient.invalidateQueries({ queryKey: ['profile'] });
      } catch {
        // silencioso — a luta começa de qualquer forma
      }
    }
    handleStartArenaCombat(boss);
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

      // Prioriza o HP/MP retornado diretamente pela mutation (valor fresco gravado no servidor).
      // healthStats pode estar desatualizado no cache entre batalhas, causando HP incorreto.
      const currentHp = combat.hp_atual_personagem != null
        ? Number(combat.hp_atual_personagem)
        : Number(healthStats?.current_hp ?? playerStats.hp ?? 120);
      const currentMp = combat.mp_atual_personagem != null
        ? Number(combat.mp_atual_personagem)
        : Number(healthStats?.current_mp ?? playerStats.mp ?? 40);
      const maxMp = healthStats?.max_mp != null
        ? Number(healthStats.max_mp)
        : Number(playerStats.mp ?? 40);
      const currentFatigue = healthStats?.fatigue != null
        ? Number(healthStats.fatigue)
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
      const msg: string = err?.message || '';
      // Avisos "soft block" — não são bugs, são mecânicas do jogo.
      // Mostra como aviso amarelo, não como erro vermelho.
      const isSoftWarning = /fadiga|short rest|descanse|cooldown|aguarde|sem chaves|sem energia/i.test(msg);
      if (isSoftWarning) {
        toast({
          title: t('app.boss.toast_hero_warning'),
          description: msg,
          // sem variant destructive — usa o estilo padrão (amarelado/info)
        });
      } else {
        toast({
          title: t('app.boss.error_start_combat'),
          description: msg || t('app.boss.error_start_combat_desc'),
          variant: 'destructive',
        });
      }
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
        <div data-tour="boss-header" className="flex items-center gap-2">
          <Skull className="w-6 h-6 text-destructive" />
          <h1 className="text-2xl font-display font-bold text-primary text-glow">
            {t('app.boss.page_title')}
          </h1>
        </div>

        {/* Eventos mundiais (teaser — em breve / anunciado) */}
        <WorldEventsTeaser />

        {/* Abas */}
        <div data-tour="boss-tabs" className="flex gap-2 flex-wrap">
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
              <div data-tour="boss-keys" className="rpg-card space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Poder de ataque: <span className="text-primary font-bold">{profile.level * 15}</span> + bônus aleatório
                  </p>
                  <div className="flex items-center gap-2 bg-primary/10 border border-primary/30 rounded-lg px-3 py-1.5">
                    <span className="text-lg">🔑</span>
                    <span className="font-bold text-primary text-lg">{profile.boss_keys || 0}</span>
                    <span className="text-xs text-muted-foreground">{t('app.boss.keys_label')}</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('app.boss.keys_hint')}
                </p>
                <HeroStatusBar />
              </div>
            )}

            {isLoading ? (
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            ) : (
              <div data-tour="boss-list" className="space-y-6">
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
                        phoenixCanDie={phoenixCanDie}
                        onPhoenixEscaped={handlePhoenixEscaped}
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
                  const isDefeated = defeatedBossIds.has(boss.id) || isSkeletonPermanentlyDefeated(boss.name ?? '');
                  const isLocked = profile && profile.level < boss.level;
                  // Pré-requisito de sequência (roadmap #1): precisa derrotar o boss anterior da cadeia.
                  const prereqBoss = boss.prereq_boss_id ? bossById.get(boss.prereq_boss_id) : null;
                  const prereqMet = !boss.prereq_boss_id || effectiveDefeatedIds.has(boss.prereq_boss_id);

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
                      {boss.is_final_boss && (
                        <span className="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          👑 {t('app.boss.final_boss_badge')}
                        </span>
                      )}
                      <p className={`text-xs font-semibold mt-1 ${elementColors[boss.element] || 'text-muted-foreground'}`}>
                        🔮 {boss.element || 'Neutro'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">{boss.description}</p>
                    </div>

                    {/* Stats row */}
                    <div className="flex gap-3 text-xs flex-wrap justify-center">
                      <span className="text-health font-bold">❤️ {boss.hp} HP</span>
                      <span className="text-primary font-bold">⭐ {t('app.boss.level_abbr', { level: boss.level })}</span>
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
                    ) : !prereqMet ? (
                      <Button disabled className="w-full bg-muted text-muted-foreground cursor-not-allowed" size="sm">
                        🔒 {t('app.boss.requires_prereq', { name: prereqBoss?.name ?? '???' })}
                      </Button>
                    ) : isLocked ? (
                      <Button disabled className="w-full bg-muted text-muted-foreground cursor-not-allowed" size="sm">
                        🔒 {t('app.boss.requires_level', { n: boss.level })}
                      </Button>
                    ) : (profile?.boss_keys || 0) < (boss.keys_cost || 1) ? (
                      <Button disabled className="w-full bg-muted text-muted-foreground cursor-not-allowed" size="sm">
                        🔑 {t('app.boss.needs_keys', { need: boss.keys_cost || 1, have: profile?.boss_keys || 0 })}
                      </Button>
                    ) : (
                      <div className="w-full grid grid-cols-1 gap-2">
                        <Button
                          onClick={() => handleFightButtonClick(boss)}
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
                  {t('app.boss.level_label')}: <span className="text-purple-400 font-bold">{profile.level}</span> &nbsp;•&nbsp; ATK: <span className="text-purple-400 font-bold">{playerStats?.atk ?? '—'}</span>
                </p>
                <p className="text-xs text-purple-300 mt-1">{t('app.boss.coop_explainer')}</p>
              </div>
            )}

            {/* Entrar por código */}
            <div className="rpg-card border-emerald-500/30 space-y-3">
              <p className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
                <LogIn className="w-4 h-4" /> {t('app.boss.join_session')}
              </p>
              <div className="flex gap-2">
                <Input
                  value={joinCodeInput}
                  onChange={e => setJoinCodeInput(e.target.value.toUpperCase())}
                  placeholder={t('app.boss.code_placeholder')}
                  maxLength={6}
                  className="font-mono tracking-widest text-center uppercase"
                />
                <Button
                  onClick={handleJoinSession}
                  disabled={sessionLoading || joinCodeInput.length < 4}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                >
                  {sessionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : t('app.boss.join_button')}
                </Button>
              </div>
            </div>

            <div className="grid gap-4">
              {dungeons.map((dungeon, i) => {
                const canJoin = profile && profile.level >= dungeon.minLevel;
                const diffColor =
                  dungeon.difficultyKey === 'medium'    ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                  dungeon.difficultyKey === 'hard'      ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' :
                  dungeon.difficultyKey === 'legendary' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                                                          'bg-success/20 text-success border-success/30';

                return (
                  <motion.div
                    key={dungeon.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.08 }}
                    className="rpg-card-glow border-purple-500/30 flex flex-col gap-4"
                  >
                    <div className="flex items-start gap-4">
                      <span className="text-5xl">{dungeon.icon}</span>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-display font-bold text-lg text-foreground">{dungeon.name}</h3>
                        <p className="text-xs text-muted-foreground mt-1 italic">"{dungeon.atmosphere}"</p>
                        <p className="text-xs text-muted-foreground mt-1">{dungeon.description}</p>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${diffColor}`}>
                            {dungeon.difficulty}
                          </span>
                          <span className="text-xs text-muted-foreground">⭐ {t('app.boss.min_level', { level: dungeon.minLevel })}</span>
                          <span className="text-xs text-muted-foreground">👥 {t('app.boss.players_range')}</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rpg-card bg-secondary/50 space-y-0.5">
                        <p className="text-muted-foreground font-semibold">{t('app.boss.final_boss')}</p>
                        <p className="font-bold text-foreground">{dungeon.boss.icon} {dungeon.boss.name}</p>
                        <p className="text-muted-foreground">❤️ {t('app.boss.total_hp', { hp: dungeon.boss.hp })}</p>
                      </div>
                      <div className="rpg-card bg-secondary/50 space-y-0.5">
                        <p className="text-muted-foreground font-semibold">{t('app.boss.rewards')}</p>
                        <p className="font-bold text-xp">✨ {dungeon.xpReward} XP</p>
                        <p className="text-muted-foreground">🪙 {dungeon.specialCoin}</p>
                        <p className="text-muted-foreground">🎁 {dungeon.uniqueItem}</p>
                        <p className="text-muted-foreground">🏅 {dungeon.titleReward}</p>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleOpenDungeon({ id: dungeon.id, name: dungeon.name })}
                        disabled={!canJoin}
                        className={`flex-1 font-semibold ${!canJoin ? 'opacity-50 cursor-not-allowed bg-muted text-muted-foreground' : 'bg-purple-600 hover:bg-purple-700 text-white'}`}
                      >
                        {!canJoin ? `🔒 ${t('app.boss.level_required', { level: dungeon.minLevel })}` : <><UserPlus className="w-4 h-4 mr-2" />{t('app.boss.create_coop_session')}</>}
                      </Button>
                      <Button
                        onClick={() => handleSoloOpen({ id: dungeon.id, name: dungeon.name })}
                        disabled={!canJoin}
                        variant="outline"
                        className={`shrink-0 ${!canJoin ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title={t('app.boss.solo_tooltip')}
                      >
                        <Swords className="w-4 h-4" />
                      </Button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Session flow dialogs ─────────────────────────────── */}
        {/* Choosing: create or join */}
        <Dialog open={sessionFlow === 'choosing'} onOpenChange={open => !open && setSessionFlow('idle')}>
          <DialogContent className="max-w-xs">
            <DialogHeader>
              <DialogTitle>🗡️ {sessionDungeon?.name}</DialogTitle>
              <DialogDescription>{t('app.boss.how_to_play')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <Button
                onClick={() => sessionDungeon && handleCreateSession(sessionDungeon)}
                disabled={sessionLoading}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white"
              >
                {sessionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UserPlus className="w-4 h-4 mr-2" />}
                {t('app.boss.create_session_invite')}
              </Button>
              <Button variant="outline" onClick={() => setSessionFlow('idle')} className="w-full">
                {t('app.boss.cancel')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Lobby */}
        <Dialog open={sessionFlow === 'lobby'} onOpenChange={open => !open && closeDungeonSession()}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>🏰 {t('app.boss.lobby')} — {sessionDungeon?.name}</DialogTitle>
              <DialogDescription>
                {sessionPlayers.find(p => p.userId === user?.id)?.isHost
                  ? t('app.boss.lobby_host_desc')
                  : t('app.boss.lobby_guest_desc')}
              </DialogDescription>
            </DialogHeader>

            {sessionData && (
              <div className="space-y-4 my-2">
                {/* Invite code */}
                <div className="flex items-center gap-2 p-3 rounded-xl bg-purple-500/10 border border-purple-500/30">
                  <div className="flex-1">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{t('app.boss.invite_code')}</p>
                    <p className="font-mono font-bold text-2xl tracking-[0.25em] text-purple-300">{sessionData.inviteCode}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      navigator.clipboard?.writeText(sessionData.inviteCode);
                      toast({ title: t('app.boss.code_copied') });
                    }}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>

                {/* Players */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {t('app.boss.players_count', { count: sessionPlayers.length })}
                  </p>
                  {sessionPlayers.map(p => (
                    <div key={p.userId} className="flex items-center gap-3 p-2 rounded-lg bg-secondary/50">
                      <span className="text-lg">{p.isHost ? '👑' : '⚔️'}</span>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-foreground">{p.displayName}{p.isHost ? ` (${t('app.boss.host')})` : ''}</p>
                        <p className="text-xs text-muted-foreground">Lv.{p.level} · ATK {p.atk} · ❤️ {p.hp}</p>
                      </div>
                      <div className={`w-2 h-2 rounded-full ${p.isAlive ? 'bg-emerald-400' : 'bg-red-500'}`} />
                    </div>
                  ))}
                  {sessionPlayers.length < 2 && (
                    <p className="text-xs text-yellow-400 text-center py-1">{t('app.boss.waiting_min_players')}</p>
                  )}
                </div>

                {/* Level gap warning */}
                {(() => {
                  if (sessionPlayers.length < 2) return null;
                  const levels = sessionPlayers.map(p => p.level);
                  const gap = Math.max(...levels) - Math.min(...levels);
                  const minLv = Math.min(...levels);
                  const effLv = Math.min(
                    Math.round(levels.reduce((a, b) => a + b, 0) / levels.length),
                    minLv + 5
                  );
                  if (gap <= 5) return null;
                  return (
                    <div className={`text-xs rounded-lg p-2.5 flex items-start gap-2 ${gap > 15 ? 'bg-red-500/10 border border-red-500/30 text-red-300' : 'bg-amber-500/10 border border-amber-500/30 text-amber-300'}`}>
                      <span className="text-base shrink-0">{gap > 15 ? '🚨' : '⚠️'}</span>
                      <span>
                        <strong>{t('app.boss.gap_levels', { gap })}</strong> {t('app.boss.gap_scales', { effLv })}
                        {gap > 15
                          ? ` ${t('app.boss.gap_high')}`
                          : ` ${t('app.boss.gap_balanced')}`}
                      </span>
                    </div>
                  );
                })()}

                {sessionPlayers.find(p => p.userId === user?.id)?.isHost && (
                  <Button
                    onClick={handleStartSession}
                    disabled={sessionLoading || sessionPlayers.length < 2}
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-bold"
                  >
                    {sessionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : '⚔️ '}
                    {t('app.boss.start_dungeon', { count: sessionPlayers.length })}
                  </Button>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>


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
                <Globe className="w-4 h-4" /> {t('app.boss.world')}
              </button>
              <button
                onClick={() => setRankingView('regional')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-semibold transition-all ${
                  rankingView === 'regional'
                    ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                    : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                🌎 {t('app.boss.my_region')}
                {profile?.region && rankingView === 'regional' && (
                  <span className="text-xs font-normal opacity-75">({t(`app.leaderboard.region_${profile.region}`, { defaultValue: REGION_LABELS[profile.region] ?? profile.region })})</span>
                )}
              </button>
            </div>
            {rankingView === 'regional' && !profile?.region && (
              <div className="rpg-card bg-yellow-500/10 border-yellow-500/30">
                <p className="text-sm text-yellow-400">{t('app.leaderboard.no_region_warning')}</p>
              </div>
            )}

            {/* Power Level Formula */}
            <div className="rpg-card bg-secondary/50 border-border/50">
              <div className="flex items-center gap-2 mb-2">
                <Flame className="w-4 h-4 text-yellow-400" />
                <p className="text-sm font-bold text-foreground">{t('app.boss.power_level_title')}</p>
              </div>
              <div className="bg-muted/60 rounded-lg p-3 border border-border/40 font-mono text-center">
                <p className="text-sm text-primary font-bold">{t('app.boss.power_formula')}</p>
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
                      <span className="text-xs text-muted-foreground">{t('app.boss.level_n', { level: profile.level })}</span>
                      <span className="text-xs font-bold text-primary">⚡ {t('app.boss.power')}: {getPowerLevel(profile.level, profile.total_xp)}</span>
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
                          {player.display_name && player.display_name.trim() !== '' ? player.display_name : t('app.boss.adventurer')}
                          {isCurrentUser && <span className="text-xs text-primary ml-2">({t('app.boss.you')})</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t('app.boss.ranking_line', { level: player.level, xp: player.total_xp, power })}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-lg font-bold text-primary">{power}</p>
                        <p className="text-[10px] text-muted-foreground">⚡ {t('app.boss.power')}</p>
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
              {t('app.boss.skeleton_title')}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 pt-2 text-sm text-muted-foreground leading-relaxed">
                <p>{t('app.boss.skeleton_p1')}</p>
                <p>{t('app.boss.skeleton_p2')}</p>
                <p>{t('app.boss.skeleton_p3')}</p>
                <p className="font-semibold text-foreground">
                  {t('app.boss.skeleton_question')}
                </p>
                <div className="pt-1">
                  <p className="text-xs">{t('app.boss.skeleton_name_prompt')}</p>
                  <Input
                    value={skeletonPupName}
                    onChange={(e) => setSkeletonPupName(e.target.value)}
                    placeholder={t('app.boss.skeleton_name_placeholder')}
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
                  onSuccess: () => toast({ title: t('app.boss.toast_skeleton_left') }),
                });
                setSkeletonStoryOpen(false);
              }}
            >
              {t('app.boss.skeleton_let_go')}
            </Button>
            <Button
              className="w-full sm:w-auto bg-violet-600 hover:bg-violet-700"
              disabled={adoptSkeletonPup.isPending || saveSkeletonChoice.isPending}
              onClick={() => {
                const name = skeletonPupName.trim() || 'Ossinho';
                saveSkeletonChoice.mutate('adopt', {
                  onSuccess: () => {
                    adoptSkeletonPup.mutate(name, {
                      onSuccess: () => toast({ title: t('app.boss.toast_skeleton_adopted', { name }) }),
                      onError: () => toast({ title: t('app.boss.toast_skeleton_adopt_error'), variant: 'destructive' }),
                    });
                  },
                });
                setSkeletonStoryOpen(false);
              }}
            >
              💀 {t('app.boss.skeleton_adopt', { name: skeletonPupName || 'Ossinho' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Fusão Fênix + Esfinge (roadmap #2) ─────────────────────────────── */}
      <Dialog open={phoenixFusionOpen} onOpenChange={(open) => { if (!open && !phoenixFusing) setPhoenixFusionOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              🔥🦁 {t('app.boss.phoenix_fusion_title')}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 pt-2 text-sm text-muted-foreground leading-relaxed">
                <p>{t('app.boss.phoenix_fusion_p1')}</p>
                <p>{t('app.boss.phoenix_fusion_p2')}</p>
                <p className="font-semibold text-foreground">{t('app.boss.phoenix_fusion_p3')}</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              className="w-full bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-700 hover:to-amber-600 text-white font-bold"
              disabled={phoenixFusing}
              onClick={handleConfirmPhoenixFusion}
            >
              {phoenixFusing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : '✨ '}
              {t('app.boss.phoenix_fusion_confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Resgate do Ferreiro (roadmap #5) ───────────────────────────────── */}
      <Dialog open={ferreiroRescueOpen} onOpenChange={(open) => { if (!open && !ferreiroRescuing) setFerreiroRescueOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              ⛏️ {t('app.boss.ferreiro_title')}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 pt-2 text-sm text-muted-foreground leading-relaxed">
                <p>{t('app.boss.ferreiro_p1')}</p>
                <p>{t('app.boss.ferreiro_p2')}</p>
                <p className="font-semibold text-foreground">{t('app.boss.ferreiro_p3')}</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              className="w-full bg-gradient-to-r from-amber-600 to-yellow-500 hover:from-amber-700 hover:to-yellow-600 text-white font-bold"
              disabled={ferreiroRescuing}
              onClick={handleConfirmFerreiroRescue}
            >
              {ferreiroRescuing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : '⛓️‍💥 '}
              {t('app.boss.ferreiro_confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Escolha do Fenrir (roadmap #5) ─────────────────────────────────── */}
      <Dialog open={fenrirChoiceOpen} onOpenChange={(open) => { if (!open && !fenrirChoosing) setFenrirChoiceOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              🐺 {t('app.boss.fenrir_title')}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 pt-2 text-sm text-muted-foreground leading-relaxed">
                <p>{t('app.boss.fenrir_p1')}</p>
                <p>{t('app.boss.fenrir_p2')}</p>
                <p className="font-semibold text-foreground">{t('app.boss.fenrir_question')}</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              disabled={fenrirChoosing}
              onClick={() => handleFenrirChoice(false)}
            >
              {t('app.boss.fenrir_leave')}
            </Button>
            <Button
              className="w-full sm:w-auto bg-slate-700 hover:bg-slate-600 text-white font-bold"
              disabled={fenrirChoosing}
              onClick={() => handleFenrirChoice(true)}
            >
              {fenrirChoosing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : '⛓️‍💥 '}
              {t('app.boss.fenrir_free')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Intro do Odin 3v1 (roadmap #5) ─────────────────────────────────── */}
      <Dialog open={!!odinIntroBoss} onOpenChange={(open) => { if (!open) setOdinIntroBoss(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              ⚡ {t('app.boss.odin_title')}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 pt-2 text-sm text-muted-foreground leading-relaxed">
                <p>{t('app.boss.odin_p1')}</p>
                <p>{t('app.boss.odin_p2')}</p>
                {storyChoices?.fenrir_allied ? (
                  <p className="font-semibold text-emerald-400">🐺 {t('app.boss.odin_fenrir_ally')}</p>
                ) : (
                  <p className="font-semibold text-amber-400">{t('app.boss.odin_no_ally')}</p>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setOdinIntroBoss(null)}>
              {t('app.boss.back')}
            </Button>
            <Button
              className="w-full sm:w-auto bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white font-bold"
              disabled={startActiveCombat.isPending}
              onClick={handleStartOdinFight}
            >
              {startActiveCombat.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Swords className="w-4 h-4 mr-1" />}
              {t('app.boss.odin_confirm')}
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
              {t('app.boss.mantiroca_title')}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 pt-2 text-sm text-muted-foreground leading-relaxed">
                <p>{t('app.boss.mantiroca_p1')}</p>
                <p>{t('app.boss.mantiroca_p2')}</p>
                <p>
                  {t('app.boss.mantiroca_p3')}{' '}
                  <span className="font-semibold text-red-400">{t('app.boss.mantiroca_hp_warning')}</span>
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
              {t('app.boss.back')}
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
              {t('app.boss.face_anyway')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: aviso de penalidade de morte ───────────────────────── */}
      <Dialog open={!!deathWarningBoss} onOpenChange={(open) => { if (!open) setDeathWarningBoss(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              {t('app.boss.death_title')}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-4 pt-2 text-left">
                <p className="text-foreground font-medium">
                  {t('app.boss.death_about_to_challenge')}{' '}
                  <span className="text-primary font-bold">{deathWarningBoss?.name}</span>.
                </p>
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 space-y-2">
                  <p className="text-sm font-bold text-destructive uppercase tracking-wide">
                    {t('app.boss.death_if_lose')}
                  </p>
                  <ul className="space-y-1.5 text-sm text-foreground">
                    <li className="flex items-start gap-2">
                      <span className="text-destructive font-bold mt-0.5">▼</span>
                      <span><strong>{t('app.boss.death_penalty_1_bold')}</strong> {t('app.boss.death_penalty_1_rest')}</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-destructive font-bold mt-0.5">▼</span>
                      <span><strong>{t('app.boss.death_penalty_2_bold')}</strong> {t('app.boss.death_penalty_2_rest')}</span>
                    </li>
                  </ul>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('app.boss.death_advice')}
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setDeathWarningBoss(null)}
            >
              {t('app.boss.death_back')}
            </Button>
            <Button
              variant="destructive"
              className="w-full sm:w-auto"
              disabled={startActiveCombat.isPending}
              onClick={() => {
                const boss = deathWarningBoss;
                setDeathWarningBoss(null);
                handleStartArenaCombat(boss);
              }}
            >
              {startActiveCombat.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              ) : (
                <Skull className="w-4 h-4 mr-1" />
              )}
              {t('app.boss.enter_arena')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DungeonArena overlay ───────────────────────────────────────── */}
      {activeDungeon && (() => {
        const hpPotions = (inventory || []).filter(inv =>
          inv.game_items?.is_consumable &&
          (String(inv.game_items?.effect || '').startsWith('heal_') ||
           String(inv.game_items?.effect || '').startsWith('mana_') ||
           String(inv.game_items?.effect || '') === 'full_rest')
        ).map<PotionItem>(inv => ({
          invId: inv.id,
          name: String(inv.game_items?.name || 'Poção'),
          effect: String(inv.game_items?.effect || 'heal_hp_small'),
          icon: String(inv.game_items?.icon || '🧪'),
          qty: inv.quantity,
        }));

        const curHp  = healthStats?.current_hp  != null ? Number(healthStats.current_hp)  : playerStats.hp ?? 120;
        const curMp  = healthStats?.current_mp  != null ? Number(healthStats.current_mp)  : playerStats.mp ?? 40;
        const maxHp  = healthStats?.max_hp      != null ? Number(healthStats.max_hp)      : playerStats.hp ?? 120;
        const maxMp  = healthStats?.max_mp      != null ? Number(healthStats.max_mp)      : playerStats.mp ?? 40;

        return (
          <DungeonArena
            dungeonId={activeDungeon.id}
            dungeonName={activeDungeon.name}
            initialPlayerHp={curHp}
            initialPlayerMaxHp={maxHp}
            initialPlayerMp={curMp}
            initialPlayerMaxMp={maxMp}
            playerLevel={profile?.level || 1}
            playerAtk={playerStats.atk ?? 15}
            playerDef={playerStats.def ?? 8}
            potions={hpPotions}
            friendCount={activeDungeon.friendCount}
            sessionId={activeDungeon.sessionId}
            sessionPlayers={activeDungeon.sessionPlayers}
            isHost={activeDungeon.isHost ?? true}
            onVictory={handleDungeonVictory}
            onDefeat={handleDungeonDefeat}
            onFlee={() => setActiveDungeon(null)}
          />
        );
      })()}
      <GuidedTour tourKey="boss" steps={bossTourSteps} />
    </AppLayout>
  );
}

