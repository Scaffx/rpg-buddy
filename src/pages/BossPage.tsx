import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useProfile, useAttributes, useHealthStats, useWorldEventBosses } from '@/hooks/useProfile';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Loader2, Skull, Flame, Trophy, Globe, Crown, Copy, Swords, UserPlus, LogIn } from 'lucide-react';
import GuidedTour, { type TourStep } from '@/components/GuidedTour';

import { useToast } from '@/hooks/use-toast';
import { getAttributeLevels, getPlayerCombatStats } from '@/lib/combat';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import DungeonArena, { type PotionItem, type SessionPlayer } from '@/components/DungeonArena';
import { useAuth } from '@/hooks/useAuth';
import { useInventory, getEquipmentBonuses, type InventoryItem } from '@/hooks/useInventory';
import AutoAdventure from '@/components/AutoAdventure';

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
  const { data: profile } = useProfile();
  const { data: attributes } = useAttributes();
  const { data: healthStats } = useHealthStats();
  const { data: inventory } = useInventory();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeDungeon, setActiveDungeon] = useState<{ id: string; name: string; friendCount: number; sessionId?: string; sessionPlayers?: SessionPlayer[]; isHost?: boolean } | null>(null);
  // ── Dungeon co-op session state ───────────────────────────────────────────
  type SessionFlow = 'idle' | 'choosing' | 'creating' | 'lobby' | 'joining';
  const [sessionFlow,     setSessionFlow]     = useState<SessionFlow>('idle');
  const [sessionDungeon,  setSessionDungeon]  = useState<{ id: string; name: string } | null>(null);
  const [sessionData,     setSessionData]     = useState<{ id: string; inviteCode: string; layoutIndex: number } | null>(null);
  const [sessionPlayers,  setSessionPlayers]  = useState<SessionPlayer[]>([]);
  const [joinCodeInput,   setJoinCodeInput]   = useState('');
  const [sessionLoading,  setSessionLoading]  = useState(false);
  const sessionChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [activeTab, setActiveTab] = useState<"aventura" | "coletiva" | "ranking">("aventura");
  const [rankingView, setRankingView] = useState<'mundial' | 'regional'>('mundial');
  const effectiveRegion = rankingView === 'mundial' ? null : (profile?.region ?? null);
  const { data: rankings, isLoading: rankingsLoading } = useRankings(effectiveRegion);
  const attrLevels = getAttributeLevels(attributes as any[]);
  const playerStatsBase = getPlayerCombatStats(profile?.level || 1, attrLevels);
  const equipBonuses = getEquipmentBonuses((inventory || []) as InventoryItem[]);

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
      description: t('app.boss.dungeon_1_desc'),
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
      description: t('app.boss.dungeon_2_desc'),
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
      description: t('app.boss.dungeon_3_desc'),
      theme: 'shadow',
      atmosphere: t('app.boss.dungeon_3_atmosphere'),
      minions: t('app.boss.dungeon_3_minions', { returnObjects: true }) as string[],
    },
  ], [t]);

  const bossTourSteps: TourStep[] = [
    { target: 'boss-header', title: t('app.boss.tour_1_title'), description: t('app.boss.tour_1_desc') },
    { target: 'boss-tabs', title: t('app.boss.tour_2_title'), description: t('app.boss.tour_2_desc') },
  ];

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

  const handleDungeonVictory = () => {
    setActiveDungeon(null);
    toast({ title: t('app.boss.toast_dungeon_victory_title'), description: 'Confronto concluído. Apenas itens presentes no inventário foram creditados.' });
    queryClient.invalidateQueries({ queryKey: ['inventory'] });
  };

  const handleDungeonDefeat = () => {
    setActiveDungeon(null);
    toast({ title: t('app.boss.toast_dungeon_defeat_title'), description: t('app.boss.toast_dungeon_defeat_desc'), variant: 'destructive' });
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
            onClick={() => setActiveTab("aventura")}
            className={`px-4 py-2 rounded-lg border font-semibold transition-all ${
              activeTab === "aventura"
                ? "bg-primary/20 border-primary/50 text-primary"
                : "bg-secondary border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            ⚔️ Aventura
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

        {/* Aventura solo automatica; modos coletivo e ranking continuam abaixo. */}
        {activeTab === "aventura" && <AutoAdventure />}
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

                    <div className="text-xs">
                      <div className="rpg-card bg-secondary/50 space-y-0.5">
                        <p className="text-muted-foreground font-semibold">{t('app.boss.final_boss')}</p>
                        <p className="font-bold text-foreground">{dungeon.boss.icon} {dungeon.boss.name}</p>
                        <p className="text-muted-foreground">❤️ {t('app.boss.total_hp', { hp: dungeon.boss.hp })}</p>
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

