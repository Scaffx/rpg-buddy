import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { Shield, Users, Globe, Lock, Copy, CheckCheck, Zap, Clock } from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { useProfile, useAttributes, useHealthStats } from '@/hooks/useProfile';
import { useInventory, getEquipmentBonuses, type InventoryItem } from '@/hooks/useInventory';
import { useToast } from '@/hooks/use-toast';
import { getPlayerCombatStats, getAttributeLevels } from '@/lib/combat';
import { supabase } from '@/integrations/supabase/client';

import DungeonArena, { type SessionPlayer, type PotionItem } from '@/components/DungeonArena';
import FragmentDungeonArena, { type FragmentVictoryResult } from '@/components/FragmentDungeonArena';
import {
  usePortalEvent,
  useMyFragments,
  useCompletePortalRun,
  usePublicFragmentDungeons,
  useCreateFragmentDungeon,
  useJoinFragmentDungeon,
  PORTAL_COLORS,
  FRAGMENT_TIERS,
  FRAGMENT_COST,
  type PortalColor,
  type FragmentTier,
} from '@/hooks/usePortalEvent';

// ── helpers ──────────────────────────────────────────────────────────────
function formatTimeLeft(endsAt: string): string {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return 'Encerrado';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return `${h}h ${m}m`;
}

// ── Fragment fill bar ─────────────────────────────────────────────────────
function FragmentBar({ count }: { count: number }) {
  const filled = Math.min(count, FRAGMENT_COST);
  const pct    = (filled / FRAGMENT_COST) * 100;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Fragmentos de Portal</span>
        <span className="font-bold text-purple-400">{filled} / {FRAGMENT_COST}</span>
      </div>
      <div className="h-3 rounded-full bg-muted/40 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="h-full bg-gradient-to-r from-purple-600 to-violet-400 rounded-full"
        />
      </div>
    </div>
  );
}

// ── Portal color card ─────────────────────────────────────────────────────
function PortalCard({
  color,
  completed,
  onEnter,
}: {
  color: PortalColor;
  completed: boolean;
  onEnter: (color: PortalColor) => void;
}) {
  const meta = PORTAL_COLORS[color];
  return (
    <motion.div
      whileHover={{ scale: completed ? 1 : 1.02 }}
      className={`rpg-card border ${meta.bg} relative overflow-hidden`}
    >
      {completed && (
        <div className="absolute top-2 right-2 bg-green-500/20 border border-green-500/40 rounded-full px-2 py-0.5 text-xs text-green-400 font-semibold">
          ✓ Concluído
        </div>
      )}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{meta.emoji}</span>
          <div>
            <p className={`font-bold ${meta.colorClass}`}>{meta.label}</p>
            <p className="text-xs text-muted-foreground">{meta.difficulty} · {meta.levelRange}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs text-center">
          <div className="rpg-card bg-muted/20 py-1">
            <p className="font-bold text-yellow-400">+{meta.xp}</p>
            <p className="text-muted-foreground">XP</p>
          </div>
          <div className="rpg-card bg-muted/20 py-1">
            <p className="font-bold text-amber-400">+{meta.gold}🪙</p>
            <p className="text-muted-foreground">Ouro</p>
          </div>
          <div className="rpg-card bg-muted/20 py-1">
            <p className={`font-bold ${meta.colorClass}`}>{meta.fragmentChance}%</p>
            <p className="text-muted-foreground">Fragmento</p>
          </div>
        </div>
        <button
          disabled={completed}
          onClick={() => onEnter(color)}
          className={`w-full py-2 rounded-xl font-semibold text-sm transition-colors text-white disabled:opacity-40 disabled:cursor-not-allowed ${meta.btnClass}`}
        >
          {completed ? 'Já concluído esta semana' : `Entrar no ${meta.label}`}
        </button>
      </div>
    </motion.div>
  );
}

// ── Fragment tier card ────────────────────────────────────────────────────
function FragmentTierCard({
  tier,
  canInvoke,
  onInvoke,
}: {
  tier: FragmentTier;
  canInvoke: boolean;
  onInvoke: (tier: FragmentTier) => void;
}) {
  const meta = FRAGMENT_TIERS[tier];
  return (
    <motion.div
      whileHover={{ scale: canInvoke ? 1.02 : 1 }}
      className={`rpg-card border ${meta.bg}`}
    >
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{meta.emoji}</span>
          <div>
            <p className={`font-bold ${meta.colorClass}`}>{meta.label}</p>
            <p className="text-xs text-muted-foreground">{meta.recommendedLevel}</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{meta.description}</p>
        <button
          disabled={!canInvoke}
          onClick={() => onInvoke(tier)}
          className={`w-full py-2 rounded-xl font-semibold text-sm transition-colors text-white disabled:opacity-40 disabled:cursor-not-allowed ${meta.btnClass}`}
        >
          {canInvoke ? `Invocar (${FRAGMENT_COST} ⬡)` : `Requer ${FRAGMENT_COST} fragmentos`}
        </button>
      </div>
    </motion.div>
  );
}

// ── Lobby dialog ──────────────────────────────────────────────────────────
type LobbyMode = 'choose' | 'create' | 'join';

function FragmentLobbyDialog({
  tier,
  onSessionReady,
  onClose,
  playerName,
  playerLevel,
  playerAtk,
  playerDef,
  playerHp,
  playerMaxHp,
  playerMp,
  playerMaxMp,
  playerClass,
}: {
  tier: FragmentTier;
  onSessionReady: (sessionId: string, isHost: boolean, players: SessionPlayer[]) => void;
  onClose: () => void;
  playerName: string;
  playerLevel: number;
  playerAtk: number;
  playerDef: number;
  playerHp: number;
  playerMaxHp: number;
  playerMp: number;
  playerMaxMp: number;
  playerClass: string;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [mode, setMode]           = useState<LobbyMode>('choose');
  const [isPublic, setIsPublic]   = useState(true);
  const [joinCode, setJoinCode]   = useState('');
  const [copied, setCopied]       = useState(false);
  const [createdCode, setCreatedCode] = useState('');
  const [createdId, setCreatedId] = useState('');
  const [players, setPlayers]     = useState<SessionPlayer[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const { data: publicDungeons = [] } = usePublicFragmentDungeons();
  const createDungeon = useCreateFragmentDungeon();
  const joinDungeon   = useJoinFragmentDungeon();
  const tierMeta = FRAGMENT_TIERS[tier];

  // Subscribe to realtime player updates after creating/joining
  useEffect(() => {
    if (!createdId) return;
    const ch = supabase.channel(`fragment_dungeon:${createdId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'fragment_dungeon_players',
        filter: `session_id=eq.${createdId}`,
      }, async () => {
        const { data } = await supabase
          .from('fragment_dungeon_players')
          .select('*')
          .eq('session_id', createdId);
        if (!data) return;
        setPlayers(data.map(p => ({
          userId:      p.user_id,
          displayName: p.display_name,
          hp:          p.hp,
          maxHp:       p.max_hp,
          level:       p.level,
          atk:         p.atk,
          def:         p.def,
          isHost:      p.is_host,
          isAlive:     p.hp > 0,
        })));
      })
      .subscribe();
    channelRef.current = ch;
    return () => { ch.unsubscribe(); };
  }, [createdId]);

  async function handleCreate() {
    const result = await createDungeon.mutateAsync({
      tier, isPublic,
      displayName: playerName, level: playerLevel, atk: playerAtk,
      def: playerDef, hp: playerHp, maxHp: playerMaxHp, playerClass,
    });
    if (result.error) { toast({ title: 'Erro', description: result.error, variant: 'destructive' }); return; }
    setCreatedId(result.session_id);
    setCreatedCode(result.invite_code);
    setMode('create');
  }

  async function handleJoin() {
    const result = await joinDungeon.mutateAsync({
      inviteCode: joinCode.toUpperCase(),
      displayName: playerName, level: playerLevel, atk: playerAtk,
      def: playerDef, hp: playerHp, maxHp: playerMaxHp, playerClass,
    });
    if (result.error) { toast({ title: 'Erro', description: result.error, variant: 'destructive' }); return; }
    setCreatedId(result.session_id);
    setMode('join');
  }

  function copyCode() {
    navigator.clipboard.writeText(createdCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function startDungeon() {
    onSessionReady(createdId, mode === 'create', players);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rpg-card w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h2 className={`font-bold text-lg ${tierMeta.colorClass}`}>
            {tierMeta.emoji} {tierMeta.label}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl">×</button>
        </div>

        {mode === 'choose' && (
          <div className="space-y-3">
            <button
              onClick={handleCreate}
              disabled={createDungeon.isPending}
              className={`w-full py-3 rounded-xl font-semibold text-white ${tierMeta.btnClass} disabled:opacity-50`}
            >
              <div className="flex items-center justify-center gap-2">
                <Shield className="w-4 h-4" />
                Criar Sala
              </div>
            </button>

            <button
              onClick={() => setMode('join')}
              className="w-full py-3 rounded-xl font-semibold text-white bg-muted/40 hover:bg-muted/60 border border-border"
            >
              <div className="flex items-center justify-center gap-2">
                <Users className="w-4 h-4" />
                Entrar com Código
              </div>
            </button>

            {publicDungeons.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Salas Públicas</p>
                {publicDungeons.filter(d => d.dungeon_tier === tier).map(d => (
                  <div key={d.session_id} className="rpg-card bg-muted/20 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{d.host_name}</p>
                      <p className="text-xs text-muted-foreground">{d.player_count}/{d.max_players} jogadores</p>
                    </div>
                    <button
                      onClick={async () => {
                        const result = await joinDungeon.mutateAsync({
                          inviteCode: d.invite_code,
                          displayName: playerName, level: playerLevel, atk: playerAtk,
                          def: playerDef, hp: playerHp, maxHp: playerMaxHp, playerClass,
                        });
                        if (!result.error) {
                          setCreatedId(result.session_id);
                          setMode('join');
                        }
                      }}
                      className="text-xs px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      Entrar
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsPublic(true)}
                className={`flex-1 py-2 rounded-lg text-xs flex items-center justify-center gap-1 border ${isPublic ? 'bg-purple-600/20 border-purple-500/40 text-purple-300' : 'border-border text-muted-foreground'}`}
              >
                <Globe className="w-3 h-3" /> Pública
              </button>
              <button
                onClick={() => setIsPublic(false)}
                className={`flex-1 py-2 rounded-lg text-xs flex items-center justify-center gap-1 border ${!isPublic ? 'bg-purple-600/20 border-purple-500/40 text-purple-300' : 'border-border text-muted-foreground'}`}
              >
                <Lock className="w-3 h-3" /> Privada
              </button>
            </div>
          </div>
        )}

        {mode === 'join' && !createdId && (
          <div className="space-y-3">
            <input
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Código de convite (ex: AB12CD)"
              className="w-full rpg-card bg-muted/20 text-center text-lg font-mono tracking-widest uppercase"
              maxLength={8}
            />
            <button
              onClick={handleJoin}
              disabled={joinCode.length < 6 || joinDungeon.isPending}
              className={`w-full py-3 rounded-xl font-semibold text-white ${tierMeta.btnClass} disabled:opacity-50`}
            >
              Entrar
            </button>
            <button onClick={() => setMode('choose')} className="w-full text-xs text-muted-foreground hover:text-foreground">
              ← Voltar
            </button>
          </div>
        )}

        {createdId && (
          <div className="space-y-4">
            {createdCode && (
              <div className="rpg-card bg-purple-500/10 border-purple-500/30 text-center space-y-2">
                <p className="text-xs text-muted-foreground">Código de Convite</p>
                <div className="flex items-center justify-center gap-2">
                  <span className="text-2xl font-mono font-bold text-purple-300 tracking-widest">{createdCode}</span>
                  <button onClick={copyCode} className="text-muted-foreground hover:text-foreground">
                    {copied ? <CheckCheck className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Jogadores ({players.length}/8)
              </p>
              {players.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3 animate-pulse">
                  Aguardando jogadores...
                </p>
              ) : (
                players.map(p => (
                  <div key={p.userId} className="flex items-center gap-2 rpg-card bg-muted/20 text-sm">
                    {p.isHost && <span className="text-amber-400">👑</span>}
                    <span className="flex-1 font-medium">{p.displayName}</span>
                    <span className="text-xs text-muted-foreground">Lv.{p.level}</span>
                  </div>
                ))
              )}
            </div>

            {mode === 'create' && (
              <button
                onClick={startDungeon}
                disabled={players.length < 1}
                className={`w-full py-3 rounded-xl font-bold text-white ${tierMeta.btnClass} disabled:opacity-50`}
              >
                ▶ Iniciar Dungeon ({players.length} jogador{players.length !== 1 ? 'es' : ''})
              </button>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function PortalEventPage() {
  const { user }     = useAuth();
  const { toast }    = useToast();
  const queryClient  = useQueryClient();
  const { data: profile }     = useProfile();
  const { data: attributes }  = useAttributes();
  const { data: healthStats } = useHealthStats();
  const { data: inventory }   = useInventory();
  const { data: portalEvent, isLoading: eventLoading } = usePortalEvent();
  const { data: fragments }    = useMyFragments();
  const completeRun            = useCompletePortalRun();

  const [activePortalColor, setActivePortalColor]   = useState<PortalColor | null>(null);
  const [fragmentLobbyTier, setFragmentLobbyTier]   = useState<FragmentTier | null>(null);
  const [activeFragSession, setActiveFragSession]   = useState<{
    sessionId: string; isHost: boolean; players: SessionPlayer[];
  } | null>(null);
  const [activeFragTier, setActiveFragTier] = useState<FragmentTier | null>(null);
  const [timeLeft, setTimeLeft] = useState('');

  // Compute player stats
  const attrLevels       = getAttributeLevels((attributes as any[]) ?? []);
  const playerStatsBase  = getPlayerCombatStats(profile?.level || 1, attrLevels);
  const equipBonuses     = getEquipmentBonuses((inventory || []) as InventoryItem[]);
  const playerStats = {
    ...playerStatsBase,
    atk:  playerStatsBase.atk  + equipBonuses.atk,
    def:  playerStatsBase.def  + equipBonuses.def,
    hp:   playerStatsBase.hp   + equipBonuses.hp,
    mp:   (playerStatsBase as any).mp + equipBonuses.mp,
  };
  const curHp  = healthStats?.current_hp  != null ? Number(healthStats.current_hp)  : playerStats.hp  ?? 120;
  const curMp  = healthStats?.current_mp  != null ? Number(healthStats.current_mp)  : (playerStats as any).mp ?? 40;
  const maxHp  = healthStats?.max_hp      != null ? Number(healthStats.max_hp)      : playerStats.hp  ?? 120;
  const maxMp  = healthStats?.max_mp      != null ? Number(healthStats.max_mp)      : (playerStats as any).mp ?? 40;

  const potions: PotionItem[] = (inventory || [])
    .filter(inv =>
      inv.game_items?.is_consumable &&
      (String(inv.game_items?.effect || '').startsWith('heal_') ||
       String(inv.game_items?.effect || '').startsWith('mana_') ||
       String(inv.game_items?.effect || '') === 'full_rest')
    )
    .map<PotionItem>(inv => ({
      invId:  inv.id,
      name:   String(inv.game_items?.name   || 'Poção'),
      effect: String(inv.game_items?.effect || 'heal_hp_small'),
      icon:   String(inv.game_items?.icon   || '🧪'),
      qty:    inv.quantity,
    }));

  const completedColors = new Set(
    (portalEvent?.runs_this_week || [])
      .filter(r => r.xp > 0)
      .map(r => r.color),
  );
  const fragmentCount = fragments?.fragments ?? 0;
  const canInvokeFragmentDungeon = fragmentCount >= FRAGMENT_COST;

  // Update time left every minute
  useEffect(() => {
    if (!portalEvent?.ends_at) return;
    const update = () => setTimeLeft(formatTimeLeft(portalEvent.ends_at));
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, [portalEvent?.ends_at]);

  // ── Handlers ─────────────────────────────────────────────────────────
  function handleEnterPortal(color: PortalColor) {
    if (!portalEvent) return;
    setActivePortalColor(color);
  }

  function handlePortalVictory(result: { xpGained: number; goldGained: number }) {
    if (!portalEvent || !activePortalColor) return;
    const fragmentEarned = Math.random() < PORTAL_COLORS[activePortalColor].fragmentChance / 100;
    completeRun.mutate({
      eventId:        portalEvent.event_id,
      color:          activePortalColor,
      xpEarned:       result.xpGained,
      goldEarned:     result.goldGained,
      fragmentEarned,
    });
    toast({
      title: fragmentEarned ? '⬡ Fragmento obtido!' : '✅ Portal concluído!',
      description: fragmentEarned
        ? `+1 Fragmento de Portal · +${result.xpGained} XP · +${result.goldGained} ouro`
        : `+${result.xpGained} XP · +${result.goldGained} ouro`,
    });
    setActivePortalColor(null);
  }

  function handleInvokeTier(tier: FragmentTier) {
    setFragmentLobbyTier(tier);
  }

  function handleLobbyReady(sessionId: string, isHost: boolean, players: SessionPlayer[]) {
    setFragmentLobbyTier(null);
    setActiveFragSession({ sessionId, isHost, players });
    setActiveFragTier(fragmentLobbyTier);
  }

  function handleFragmentVictory(result: FragmentVictoryResult) {
    queryClient.invalidateQueries({ queryKey: ['profile'] });
    queryClient.invalidateQueries({ queryKey: ['gold-balance'] });
    toast({
      title: '🏆 Dungeon de Fragmento concluída!',
      description: `+${result.totalXp} XP · +${result.totalGold} ouro${result.classDiversityBonus ? ' · Bônus de diversidade!' : ''}`,
    });
    setActiveFragSession(null);
    setActiveFragTier(null);
  }

  // ── Full-screen DungeonArena for portal runs ──────────────────────────
  if (activePortalColor && portalEvent) {
    const meta = PORTAL_COLORS[activePortalColor];
    return (
      <div className="p-4">
        <DungeonArena
          dungeonId={meta.dungeonId}
          dungeonName={meta.label}
          initialPlayerHp={curHp}
          initialPlayerMaxHp={maxHp}
          initialPlayerMp={curMp}
          initialPlayerMaxMp={maxMp}
          playerLevel={profile?.level || 1}
          playerAtk={playerStats.atk ?? 15}
          playerDef={playerStats.def ?? 8}
          potions={potions}
          friendCount={0}
          isPortalDungeon
          onVictory={handlePortalVictory}
          onDefeat={() => setActivePortalColor(null)}
          onFlee={() => setActivePortalColor(null)}
        />
      </div>
    );
  }

  // ── Full-screen FragmentDungeonArena ──────────────────────────────────
  if (activeFragSession && activeFragTier) {
    return (
      <div className="p-4">
        <FragmentDungeonArena
          sessionId={activeFragSession.sessionId}
          sessionPlayers={activeFragSession.players}
          dungeonTier={activeFragTier}
          isHost={activeFragSession.isHost}
          playerLevel={profile?.level || 1}
          playerAtk={playerStats.atk ?? 15}
          playerDef={playerStats.def ?? 8}
          initialPlayerHp={curHp}
          initialPlayerMaxHp={maxHp}
          initialPlayerMp={curMp}
          initialPlayerMaxMp={maxMp}
          potions={potions}
          friendCount={0}
          onVictory={handleFragmentVictory}
          onDefeat={() => { setActiveFragSession(null); setActiveFragTier(null); }}
        />
      </div>
    );
  }

  // ── Portal hub ────────────────────────────────────────────────────────
  return (
    <div className="p-4 space-y-6 max-w-xl mx-auto">
      {/* Header */}
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold flex items-center justify-center gap-2">
          <Zap className="w-6 h-6 text-purple-400" />
          Evento Semanal — Portal
        </h1>
        <p className="text-sm text-muted-foreground">
          Explore portais, colete fragmentos e invoque dungeons épicas!
        </p>
      </div>

      {/* Event status */}
      {eventLoading ? (
        <div className="rpg-card animate-pulse h-16" />
      ) : portalEvent ? (
        <div className="rpg-card bg-purple-500/10 border-purple-500/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="font-semibold text-green-400">Portal Aberto</span>
          </div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Clock className="w-4 h-4" />
            <span>{timeLeft || formatTimeLeft(portalEvent.ends_at)}</span>
          </div>
        </div>
      ) : (
        <div className="rpg-card bg-muted/20 text-center text-muted-foreground py-6">
          <p className="text-lg">🚪 Nenhum portal ativo no momento.</p>
          <p className="text-sm mt-1">Volte na próxima semana!</p>
        </div>
      )}

      {/* Fragment bar */}
      <div className="rpg-card space-y-3">
        <FragmentBar count={fragmentCount} />
        {fragments?.lifetime_fragments != null && fragments.lifetime_fragments > 0 && (
          <p className="text-xs text-muted-foreground text-right">
            Total histórico: {fragments.lifetime_fragments} ⬡
          </p>
        )}
      </div>

      {/* Portal color cards */}
      {portalEvent && (
        <div className="space-y-3">
          <h2 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">
            Sub-Portais desta semana
          </h2>
          <div className="grid gap-3">
            {(Object.keys(PORTAL_COLORS) as PortalColor[]).map(color => (
              <PortalCard
                key={color}
                color={color}
                completed={completedColors.has(color)}
                onEnter={handleEnterPortal}
              />
            ))}
          </div>
        </div>
      )}

      {/* Fragment dungeon section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">
            Dungeons de Fragmento
          </h2>
          {!canInvokeFragmentDungeon && (
            <span className="text-xs text-muted-foreground">
              Precisa de {FRAGMENT_COST - fragmentCount} ⬡ mais
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground bg-muted/20 border border-border/40 rounded-lg px-3 py-2">
          ⚠️ Pets não são permitidos nessas dungeons. Apenas jogadores e suas habilidades.
          Cada ação tem um cooldown de <strong className="text-foreground">45 segundos</strong>.
        </p>
        <div className="grid gap-3">
          {(Object.keys(FRAGMENT_TIERS) as FragmentTier[]).map(tier => (
            <FragmentTierCard
              key={tier}
              tier={tier}
              canInvoke={canInvokeFragmentDungeon}
              onInvoke={handleInvokeTier}
            />
          ))}
        </div>
      </div>

      {/* Lobby dialog */}
      <AnimatePresence>
        {fragmentLobbyTier && (
          <FragmentLobbyDialog
            tier={fragmentLobbyTier}
            onSessionReady={handleLobbyReady}
            onClose={() => setFragmentLobbyTier(null)}
            playerName={profile?.display_name || user?.email || 'Herói'}
            playerLevel={profile?.level || 1}
            playerAtk={playerStats.atk ?? 15}
            playerDef={playerStats.def ?? 8}
            playerHp={curHp}
            playerMaxHp={maxHp}
            playerMp={curMp}
            playerMaxMp={maxMp}
            playerClass={profile?.class_type || 'guerreiro'}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
