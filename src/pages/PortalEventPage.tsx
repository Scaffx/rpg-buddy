import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import {
  Shield, Users, Globe, Lock, Copy, CheckCheck, Zap, Clock,
  Search, AlertTriangle, Sparkles, Timer, Gem,
  Swords, ArrowRight, ArrowLeft,
} from 'lucide-react';

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
  useScanPortal,
  useClaimPendingDungeon,
  usePublicFragmentDungeons,
  useCreateFragmentDungeon,
  useJoinFragmentDungeon,
  PORTAL_COLORS,
  FRAGMENT_TIERS,
  FRAGMENT_COST,
  type PortalColor,
  type FragmentTier,
} from '@/hooks/usePortalEvent';

// ── helpers ───────────────────────────────────────────────────────────────
function formatTimeLeft(endsAt: string): string {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return 'Encerrado';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return `${h}h ${m}m`;
}

function formatDungeonExpiry(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Expirado';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `Expira em ${h}h ${m}m`;
  return `Expira em ${m}m`;
}

// ── Animated portal glyph ─────────────────────────────────────────────────
function PortalGlyph({ color, size = 'md' }: { color?: PortalColor | null; size?: 'sm' | 'md' | 'lg' }) {
  const hexColors: Record<string, string> = {
    blue: '#38bdf8', yellow: '#facc15', red: '#f87171', legendary: '#a78bfa', unknown: '#818cf8',
  };
  const ringColor = color ? hexColors[color] : hexColors.unknown;
  const sizeMap = { sm: 48, md: 72, lg: 96 };
  const s = sizeMap[size];
  return (
    <div className="relative flex items-center justify-center" style={{ width: s, height: s }}>
      <motion.div
        className="absolute inset-0 rounded-full border-2 opacity-30"
        style={{ borderColor: ringColor }}
        animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.1, 0.3] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute rounded-full border"
        style={{ inset: s * 0.12, borderColor: ringColor, opacity: 0.6 }}
        animate={{ rotate: 360 }}
        transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
      />
      <motion.div
        className="absolute rounded-full"
        style={{ inset: s * 0.25, background: `radial-gradient(circle, ${ringColor}40 0%, ${ringColor}10 70%)` }}
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.span
        className="relative z-10 select-none"
        style={{ fontSize: s * 0.38 }}
        animate={!color ? { rotate: [0, 8, -8, 0] } : {}}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        {color ? PORTAL_COLORS[color].emoji : '🌀'}
      </motion.span>
    </div>
  );
}

// ── Fragment bar ──────────────────────────────────────────────────────────
function FragmentBar({ count }: { count: number }) {
  const filled = Math.min(count, FRAGMENT_COST);
  const segments = Array.from({ length: FRAGMENT_COST }, (_, i) => i < filled);
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          <Gem className="w-3 h-3 text-purple-400" /> Fragmentos de Portal
        </span>
        <span className="text-sm font-bold text-purple-300">{filled} / {FRAGMENT_COST}</span>
      </div>
      <div className="flex gap-1">
        {segments.map((active, i) => (
          <motion.div
            key={i}
            className="flex-1 h-3 rounded-sm"
            style={{ background: active ? 'linear-gradient(90deg,#7c3aed,#a78bfa)' : 'rgba(255,255,255,0.07)' }}
            animate={active ? { opacity: [0.8, 1, 0.8] } : { opacity: 1 }}
            transition={active ? { duration: 2, repeat: Infinity, ease: 'easeInOut', delay: i * 0.1 } : {}}
          />
        ))}
      </div>
      {filled < FRAGMENT_COST ? (
        <p className="text-xs text-muted-foreground text-right">Faltam {FRAGMENT_COST - filled} para invocar</p>
      ) : (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-center font-semibold text-purple-300 bg-purple-500/10 rounded-lg py-1">
          ✨ Pronto para invocar uma dungeon!
        </motion.p>
      )}
    </div>
  );
}

// ── Daily portal card ─────────────────────────────────────────────────────
function DailyPortalCard({
  portalColor, colorRevealed, alreadyCompleted, participantCount,
  hasScannerItem, isScanning, onScan, onEnter,
}: {
  portalColor: PortalColor | null; colorRevealed: boolean; alreadyCompleted: boolean;
  participantCount: number; hasScannerItem: boolean; isScanning: boolean;
  onScan: () => void; onEnter: () => void;
}) {
  const meta = portalColor ? PORTAL_COLORS[portalColor] : null;
  const diffColor: Record<string, string> = { 'Fácil': 'text-emerald-400', 'Médio': 'text-yellow-400', 'Difícil': 'text-red-400', 'Lendário': 'text-purple-300' };
  const glowHex: Record<string, string> = { blue: '#38bdf8', yellow: '#facc15', red: '#f87171', legendary: '#a78bfa' };
  const glow = portalColor ? glowHex[portalColor] : '#7c3aed';

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl border border-white/[0.1] bg-black/40 backdrop-blur-sm"
    >
      <div className="absolute inset-0 opacity-10 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at 50% 0%, ${glow} 0%, transparent 70%)` }}
      />
      <div className="relative p-5 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <PortalGlyph color={portalColor} size="md" />
            <div>
              <p className={`font-bold text-xl ${meta ? meta.colorClass : 'text-purple-300'}`}>
                {meta ? meta.label : 'Portal Dimensional'}
              </p>
              {meta ? (
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-xs font-semibold ${diffColor[meta.difficulty] ?? 'text-muted-foreground'}`}>{meta.difficulty}</span>
                  <span className="text-muted-foreground text-xs">·</span>
                  <span className="text-xs text-muted-foreground">{meta.levelRange}</span>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Raridade ainda desconhecida</p>
              )}
            </div>
          </div>
          {alreadyCompleted && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
              className="flex items-center gap-1.5 bg-emerald-500/15 border border-emerald-500/30 rounded-full px-3 py-1"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-xs font-semibold text-emerald-400">Concluído</span>
            </motion.div>
          )}
        </div>

        <AnimatePresence>
          {colorRevealed && meta && (
            <motion.div key="rewards" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="grid grid-cols-3 gap-2">
              {[
                { label: 'XP', value: `+${meta.xp}`, color: 'text-sky-300', bg: 'bg-sky-500/10 border-sky-500/20' },
                { label: 'Ouro', value: `${meta.gold}🪙`, color: 'text-yellow-300', bg: 'bg-yellow-500/10 border-yellow-500/20' },
                { label: 'Frag.', value: `${meta.fragmentChance}%`, color: meta.colorClass, bg: 'bg-purple-500/10 border-purple-500/20' },
              ].map(r => (
                <div key={r.label} className={`${r.bg} border rounded-xl py-2 text-center`}>
                  <p className={`text-sm font-bold ${r.color}`}>{r.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{r.label}</p>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {participantCount > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="w-3.5 h-3.5" />
            <span>{participantCount} herói{participantCount !== 1 ? 's' : ''} já fechou este portal hoje</span>
          </div>
        )}

        {!alreadyCompleted && (
          <div className="flex gap-2 pt-1">
            {!colorRevealed && (
              <button onClick={onScan} disabled={!hasScannerItem || isScanning}
                title={!hasScannerItem ? 'Compre o "Escaner de Portal" na loja (120🪙)' : ''}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-purple-500/40 text-purple-300 hover:bg-purple-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <Search className="w-4 h-4" />
                {isScanning ? 'Escaneando...' : 'Escanear'}
              </button>
            )}
            <button onClick={onEnter}
              className={`flex-1 py-2.5 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all shadow-lg ${meta ? meta.btnClass : 'bg-purple-600 hover:bg-purple-700'}`}
            >
              <Zap className="w-4 h-4" />
              {colorRevealed && meta ? `Entrar no ${meta.label}` : 'Entrar às Cegas'}
              <ArrowRight className="w-3.5 h-3.5 opacity-70" />
            </button>
          </div>
        )}
        {!colorRevealed && !alreadyCompleted && (
          <p className="text-xs text-center text-muted-foreground/70">Sem o escaner, a raridade só será revelada ao entrar</p>
        )}
      </div>
    </motion.div>
  );
}

// ── Pending dungeon card ───────────────────────────────────────────────────
function PendingDungeonCard({
  tier, expiresAt, fragmentCount, onClaim, isClaiming,
}: {
  tier: FragmentTier; expiresAt: string; fragmentCount: number; onClaim: () => void; isClaiming: boolean;
}) {
  const meta = FRAGMENT_TIERS[tier];
  const canAfford = fragmentCount >= FRAGMENT_COST;
  const [timeStr, setTimeStr] = useState(() => formatDungeonExpiry(expiresAt));
  useEffect(() => {
    const id = setInterval(() => setTimeStr(formatDungeonExpiry(expiresAt)), 60_000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
      className={`relative overflow-hidden rounded-2xl border ${meta.bg} p-5 space-y-4`}
    >
      <motion.div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-2xl bg-current opacity-60"
        animate={{ opacity: [0.3, 0.7, 0.3] }} transition={{ duration: 2, repeat: Infinity }}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{meta.emoji}</span>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Dungeon Sorteada!</p>
            <p className={`font-bold text-lg ${meta.colorClass}`}>{meta.label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{meta.recommendedLevel}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground bg-black/30 rounded-lg px-2.5 py-1.5 shrink-0">
          <Timer className="w-3.5 h-3.5" /> <span>{timeStr}</span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{meta.description}</p>
      {!canAfford && (
        <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2 text-xs text-amber-300">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>Você precisa de {FRAGMENT_COST} fragmentos. Você tem {fragmentCount}.</span>
        </div>
      )}
      <button onClick={onClaim} disabled={!canAfford || isClaiming}
        className={`w-full py-3 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all ${meta.btnClass} disabled:opacity-40 disabled:cursor-not-allowed shadow-lg`}
      >
        <Gem className="w-4 h-4" />
        {isClaiming ? 'Confirmando...' : `Confirmar Entrada (${FRAGMENT_COST} ⬡)`}
      </button>
    </motion.div>
  );
}

// ── Weekly history ─────────────────────────────────────────────────────────
function WeeklyHistory({ runs }: { runs: Array<{ color: PortalColor; xp: number; fragments_received: number }> }) {
  if (runs.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
        Histórico desta semana
      </h3>
      <div className="flex flex-col gap-1.5">
        {runs.map((run, i) => {
          const m = PORTAL_COLORS[run.color];
          return (
            <div key={i} className="flex items-center justify-between bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">{m.emoji}</span>
                <span className={`text-sm font-medium ${m.colorClass}`}>{m.label}</span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-sky-300 font-semibold">+{run.xp} XP</span>
                {run.fragments_received > 0 && <span className="text-purple-300 font-semibold">+{run.fragments_received} ⬡</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Fragment tier card ─────────────────────────────────────────────────────
function FragmentTierCard({ tier, canInvoke, onInvoke }: { tier: FragmentTier; canInvoke: boolean; onInvoke: (t: FragmentTier) => void }) {
  const meta = FRAGMENT_TIERS[tier];
  return (
    <motion.div whileHover={{ scale: canInvoke ? 1.01 : 1, y: canInvoke ? -1 : 0 }}
      className={`relative overflow-hidden rounded-2xl border ${meta.bg} p-4 transition-shadow ${canInvoke ? 'hover:shadow-lg' : 'opacity-60'}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{meta.emoji}</span>
          <div>
            <div className="flex items-center gap-2">
              <p className={`font-bold ${meta.colorClass}`}>{meta.label}</p>
              <span className="text-xs text-muted-foreground bg-black/30 rounded-md px-1.5 py-0.5">{meta.recommendedLevel}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>
          </div>
        </div>
        <button disabled={!canInvoke} onClick={() => onInvoke(tier)}
          className={`shrink-0 px-4 py-2 rounded-xl font-semibold text-sm transition-all text-white disabled:opacity-40 disabled:cursor-not-allowed ${meta.btnClass}`}
        >
          {canInvoke ? 'Invocar' : `${FRAGMENT_COST} ⬡`}
        </button>
      </div>
    </motion.div>
  );
}

// ── Lobby dialog ───────────────────────────────────────────────────────────
type LobbyMode = 'choose' | 'create' | 'join';

function FragmentLobbyDialog({
  tier, onSessionReady, onClose,
  playerName, playerLevel, playerAtk, playerDef,
  playerHp, playerMaxHp, playerMp, playerMaxMp, playerClass,
}: {
  tier: FragmentTier; onSessionReady: (sessionId: string, isHost: boolean, players: SessionPlayer[]) => void;
  onClose: () => void; playerName: string; playerLevel: number; playerAtk: number; playerDef: number;
  playerHp: number; playerMaxHp: number; playerMp: number; playerMaxMp: number; playerClass: string;
}) {
  const { toast } = useToast();
  const [mode, setMode]               = useState<LobbyMode>('choose');
  const [isPublic, setIsPublic]       = useState(true);
  const [joinCode, setJoinCode]       = useState('');
  const [copied, setCopied]           = useState(false);
  const [createdCode, setCreatedCode] = useState('');
  const [createdId, setCreatedId]     = useState('');
  const [players, setPlayers]         = useState<SessionPlayer[]>([]);
  const channelRef                    = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const { data: publicDungeons = [] }  = usePublicFragmentDungeons();
  const createDungeon = useCreateFragmentDungeon();
  const joinDungeon   = useJoinFragmentDungeon();
  const tm = FRAGMENT_TIERS[tier];

  useEffect(() => {
    if (!createdId) return;
    const ch = supabase.channel(`fragment_dungeon:${createdId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fragment_dungeon_players', filter: `session_id=eq.${createdId}` },
        async () => {
          const { data } = await supabase.from('fragment_dungeon_players').select('*').eq('session_id', createdId);
          if (!data) return;
          setPlayers(data.map(p => ({ userId: p.user_id, displayName: p.display_name, hp: p.hp, maxHp: p.max_hp, level: p.level, atk: p.atk, def: p.def, isHost: p.is_host, isAlive: p.hp > 0 })));
        })
      .subscribe();
    channelRef.current = ch;
    return () => { ch.unsubscribe(); };
  }, [createdId]);

  async function handleCreate() {
    const r = await createDungeon.mutateAsync({ tier, isPublic, displayName: playerName, level: playerLevel, atk: playerAtk, def: playerDef, hp: playerHp, maxHp: playerMaxHp, playerClass });
    if (r.error) { toast({ title: 'Erro', description: r.error, variant: 'destructive' }); return; }
    setCreatedId(r.session_id); setCreatedCode(r.invite_code); setMode('create');
  }

  async function handleJoinByCode() {
    const r = await joinDungeon.mutateAsync({ inviteCode: joinCode.toUpperCase(), displayName: playerName, level: playerLevel, atk: playerAtk, def: playerDef, hp: playerHp, maxHp: playerMaxHp, playerClass });
    if (r.error) { toast({ title: 'Erro', description: r.error, variant: 'destructive' }); return; }
    setCreatedId(r.session_id); setMode('join');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <motion.div initial={{ opacity: 0, scale: 0.92, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
        className={`w-full max-w-md rounded-2xl border ${tm.bg} bg-[#0d0d1a] p-5 space-y-4 max-h-[90vh] overflow-y-auto`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{tm.emoji}</span>
            <h2 className={`font-bold text-lg ${tm.colorClass}`}>{tm.label}</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-muted-foreground transition-colors">×</button>
        </div>

        {mode === 'choose' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <button onClick={() => setIsPublic(true)} className={`flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition-colors ${isPublic ? `${tm.btnClass} border-transparent text-white` : 'border-border text-muted-foreground hover:bg-white/5'}`}>
                <Globe className="w-3.5 h-3.5" /> Pública
              </button>
              <button onClick={() => setIsPublic(false)} className={`flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition-colors ${!isPublic ? `${tm.btnClass} border-transparent text-white` : 'border-border text-muted-foreground hover:bg-white/5'}`}>
                <Lock className="w-3.5 h-3.5" /> Privada
              </button>
            </div>
            <button onClick={handleCreate} disabled={createDungeon.isPending} className={`w-full py-3 rounded-xl font-semibold text-white flex items-center justify-center gap-2 ${tm.btnClass} disabled:opacity-50`}>
              <Shield className="w-4 h-4" /> Criar Sala
            </button>
            <button onClick={() => setMode('join')} className="w-full py-3 rounded-xl font-semibold text-sm text-muted-foreground hover:text-foreground border border-border hover:bg-white/5 flex items-center justify-center gap-2 transition-colors">
              <Users className="w-4 h-4" /> Entrar com Código
            </button>
            {publicDungeons.filter(d => d.dungeon_tier === tier).map(d => (
              <div key={d.session_id} className="flex items-center justify-between bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">{d.host_name}</p>
                  <p className="text-xs text-muted-foreground">{d.player_count}/{d.max_players} jogadores</p>
                </div>
                <button onClick={async () => { const r = await joinDungeon.mutateAsync({ inviteCode: d.invite_code, displayName: playerName, level: playerLevel, atk: playerAtk, def: playerDef, hp: playerHp, maxHp: playerMaxHp, playerClass }); if (!r.error) { setCreatedId(r.session_id); setMode('join'); } }} className={`text-xs px-3 py-1.5 rounded-lg ${tm.btnClass} text-white`}>Entrar</button>
              </div>
            ))}
          </div>
        )}

        {mode === 'join' && !createdId && (
          <div className="space-y-3">
            <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} placeholder="Código (ex: AB12CD)"
              className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-4 py-3 text-center text-lg font-mono tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-purple-500/50"
              maxLength={8}
            />
            <button onClick={handleJoinByCode} disabled={joinCode.length < 6 || joinDungeon.isPending} className={`w-full py-3 rounded-xl font-semibold text-white ${tm.btnClass} disabled:opacity-50`}>Entrar</button>
            <button onClick={() => setMode('choose')} className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1">← Voltar</button>
          </div>
        )}

        {createdId && (
          <div className="space-y-4">
            {createdCode && (
              <div className="bg-white/[0.05] border border-white/[0.1] rounded-xl p-4 text-center space-y-2">
                <p className="text-xs text-muted-foreground">Código de Convite</p>
                <div className="flex items-center justify-center gap-3">
                  <span className="text-2xl font-mono font-bold tracking-widest text-white">{createdCode}</span>
                  <button onClick={() => { navigator.clipboard.writeText(createdCode); }} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                    <Copy className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Jogadores ({players.length}/8)</p>
              {players.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4 animate-pulse">Aguardando jogadores...</p>
              ) : (
                players.map(p => (
                  <div key={p.userId} className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm">
                    {p.isHost && <span className="text-amber-400">👑</span>}
                    <span className="flex-1 font-medium">{p.displayName}</span>
                    <span className="text-xs text-muted-foreground">Lv.{p.level}</span>
                  </div>
                ))
              )}
            </div>
            {mode === 'create' && (
              <button onClick={() => onSessionReady(createdId, true, players)} disabled={players.length < 1}
                className={`w-full py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2 ${tm.btnClass} disabled:opacity-50`}
              >
                <Swords className="w-4 h-4" /> Iniciar ({players.length} jogador{players.length !== 1 ? 'es' : ''})
              </button>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function PortalEventPage() {
  const { user }      = useAuth();
  const { toast }     = useToast();
  const queryClient   = useQueryClient();
  const navigate      = useNavigate();
  const { data: profile }     = useProfile();
  const { data: attributes }  = useAttributes();
  const { data: healthStats } = useHealthStats();
  const { data: inventory }   = useInventory();
  const { data: portalEvent, isLoading: eventLoading } = usePortalEvent();
  const { data: fragments }   = useMyFragments();

  const completeRun  = useCompletePortalRun();
  const scanPortal   = useScanPortal();
  const claimDungeon = useClaimPendingDungeon();

  const [isEnteringPortal, setIsEnteringPortal]   = useState(false);
  const [fragmentLobbyTier, setFragmentLobbyTier] = useState<FragmentTier | null>(null);
  const [activeFragSession, setActiveFragSession] = useState<{ sessionId: string; isHost: boolean; players: SessionPlayer[] } | null>(null);
  const [activeFragTier, setActiveFragTier]       = useState<FragmentTier | null>(null);
  const [timeLeft, setTimeLeft]                   = useState('');

  const attrLevels      = getAttributeLevels((attributes as any[]) ?? []);
  const playerStatsBase = getPlayerCombatStats(profile?.level || 1, attrLevels);
  const equipBonuses    = getEquipmentBonuses((inventory || []) as InventoryItem[]);
  const playerStats = {
    ...playerStatsBase,
    atk: playerStatsBase.atk + equipBonuses.atk,
    def: playerStatsBase.def + equipBonuses.def,
    hp:  playerStatsBase.hp  + equipBonuses.hp,
    mp:  (playerStatsBase as any).mp + equipBonuses.mp,
  };
  const curHp = healthStats?.current_hp != null ? Number(healthStats.current_hp) : playerStats.hp  ?? 120;
  const curMp = healthStats?.current_mp != null ? Number(healthStats.current_mp) : (playerStats as any).mp ?? 40;
  const maxHp = healthStats?.max_hp     != null ? Number(healthStats.max_hp)     : playerStats.hp  ?? 120;
  const maxMp = healthStats?.max_mp     != null ? Number(healthStats.max_mp)     : (playerStats as any).mp ?? 40;

  const potions: PotionItem[] = (inventory || [])
    .filter(inv => inv.game_items?.is_consumable && (
      String(inv.game_items?.effect || '').startsWith('heal_') ||
      String(inv.game_items?.effect || '').startsWith('mana_') ||
      String(inv.game_items?.effect || '') === 'full_rest'
    ))
    .map<PotionItem>(inv => ({
      invId:  inv.id,
      name:   String(inv.game_items?.name   || 'Poção'),
      effect: String(inv.game_items?.effect || 'heal_hp_small'),
      icon:   String(inv.game_items?.icon   || '🧪'),
      qty:    inv.quantity,
    }));

  const fragmentCount        = fragments?.fragments ?? 0;
  const canInvokeFragDungeon = fragmentCount >= FRAGMENT_COST;
  const hasScannerItem       = (inventory || []).some(inv => inv.game_items?.effect === 'portal_scan');
  const pendingDungeon       = portalEvent?.pending_dungeon   ?? fragments?.pending_dungeon   ?? null;
  const dungeonExpiresAt     = portalEvent?.dungeon_expires_at ?? fragments?.dungeon_expires_at ?? null;

  useEffect(() => {
    if (!portalEvent?.ends_at) return;
    const update = () => setTimeLeft(formatTimeLeft(portalEvent.ends_at));
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, [portalEvent?.ends_at]);

  function handleEnterPortal() {
    if (!portalEvent) return;
    setIsEnteringPortal(true);
  }

  async function handleScanPortal() {
    if (!portalEvent) return;
    const result = await scanPortal.mutateAsync(portalEvent.event_id);
    if ((result as any).error) {
      toast({ title: 'Erro ao escanear', description: (result as any).error, variant: 'destructive' });
    } else {
      toast({ title: '🔍 Portal escaneado!', description: 'Raridade revelada.' });
    }
  }

  async function handlePortalVictory(result: { xpGained: number; goldGained: number }) {
    if (!portalEvent) return;
    try {
      const data = await completeRun.mutateAsync({ eventId: portalEvent.event_id, xpEarned: result.xpGained, goldEarned: result.goldGained });
      const fragsMsg   = (data.frags_dropped ?? 0) > 0 ? ` · +${data.frags_dropped} ⬡` : '';
      const dungeonMsg = data.dungeon_tier ? ` · Dungeon ${FRAGMENT_TIERS[data.dungeon_tier]?.label ?? ''} sorteada!` : '';
      toast({ title: '✅ Portal concluído!', description: `+${result.xpGained} XP · +${result.goldGained} 🪙${fragsMsg}${dungeonMsg}` });
    } catch { /* ignore */ }
    setIsEnteringPortal(false);
  }

  async function handleClaimDungeon() {
    const result = await claimDungeon.mutateAsync();
    if ((result as any).error) { toast({ title: 'Erro', description: (result as any).error, variant: 'destructive' }); return; }
    const tier = result.tier as FragmentTier | undefined;
    if (tier) { setFragmentLobbyTier(tier); toast({ title: `${FRAGMENT_TIERS[tier]?.emoji} Dungeon liberada!`, description: 'Prepare sua equipe.' }); }
  }

  function handleLobbyReady(sessionId: string, isHost: boolean, players: SessionPlayer[]) {
    setFragmentLobbyTier(null);
    setActiveFragSession({ sessionId, isHost, players });
    setActiveFragTier(fragmentLobbyTier);
  }

  function handleFragmentVictory(result: FragmentVictoryResult) {
    queryClient.invalidateQueries({ queryKey: ['profile'] });
    queryClient.invalidateQueries({ queryKey: ['gold-balance'] });
    toast({ title: '🏆 Dungeon concluída!', description: `+${result.totalXp} XP · +${result.totalGold} 🪙${result.classDiversityBonus ? ' · Bônus de diversidade!' : ''}` });
    setActiveFragSession(null); setActiveFragTier(null);
  }

  // full-screen: portal dungeon
  if (isEnteringPortal && portalEvent) {
    const color = portalEvent.portal_color;
    const meta  = color ? PORTAL_COLORS[color] : PORTAL_COLORS.blue;
    return (
      <div className="p-4">
        <DungeonArena
          dungeonId={meta.dungeonId} dungeonName={meta.label}
          initialPlayerHp={curHp} initialPlayerMaxHp={maxHp}
          initialPlayerMp={curMp} initialPlayerMaxMp={maxMp}
          playerLevel={profile?.level || 1} playerAtk={playerStats.atk ?? 15} playerDef={playerStats.def ?? 8}
          potions={potions} friendCount={0} isPortalDungeon
          onVictory={handlePortalVictory}
          onDefeat={() => setIsEnteringPortal(false)}
          onFlee={() => setIsEnteringPortal(false)}
        />
      </div>
    );
  }

  // full-screen: fragment dungeon
  if (activeFragSession && activeFragTier) {
    return (
      <div className="p-4">
        <FragmentDungeonArena
          sessionId={activeFragSession.sessionId} sessionPlayers={activeFragSession.players}
          dungeonTier={activeFragTier} isHost={activeFragSession.isHost}
          playerLevel={profile?.level || 1} playerAtk={playerStats.atk ?? 15} playerDef={playerStats.def ?? 8}
          initialPlayerHp={curHp} initialPlayerMaxHp={maxHp} initialPlayerMp={curMp} initialPlayerMaxMp={maxMp}
          potions={potions} friendCount={0}
          onVictory={handleFragmentVictory}
          onDefeat={() => { setActiveFragSession(null); setActiveFragTier(null); }}
        />
      </div>
    );
  }

  // portal hub
  return (
    <div className="min-h-screen bg-[#08080f]">
      <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-purple-950/40 to-transparent pointer-events-none" />
      <div className="relative p-4 space-y-5 max-w-xl mx-auto pb-10">

        {/* botão voltar */}
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </button>

        {/* header */}
        <div className="text-center pt-2 space-y-1">
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span className="text-xs font-semibold text-purple-400 uppercase tracking-widest">Evento Semanal</span>
            <Sparkles className="w-4 h-4 text-purple-400" />
          </motion.div>
          <motion.h1 initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            className="text-3xl font-bold tracking-tight bg-gradient-to-r from-violet-300 via-purple-200 to-indigo-300 bg-clip-text text-transparent"
          >
            Portais Dimensionais
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="text-sm text-muted-foreground">
            Explore portais, colete fragmentos e conquiste dungeons épicas
          </motion.p>
        </div>

        {/* event timer */}
        {eventLoading ? (
          <div className="h-12 rounded-2xl bg-white/[0.04] animate-pulse" />
        ) : portalEvent ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between bg-white/[0.04] border border-white/[0.08] rounded-2xl px-4 py-3"
          >
            <div className="flex items-center gap-2">
              <motion.div className="w-2 h-2 rounded-full bg-emerald-400" animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.5, repeat: Infinity }} />
              <span className="text-sm font-semibold text-emerald-400">Portal Ativo</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              <span className="tabular-nums">{timeLeft || formatTimeLeft(portalEvent.ends_at)}</span>
            </div>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="rounded-2xl border border-white/[0.07] bg-white/[0.03] text-center py-10 space-y-2"
          >
            <p className="text-4xl">🚪</p>
            <p className="font-semibold text-muted-foreground">Nenhum portal ativo no momento</p>
            <p className="text-sm text-muted-foreground/60">Volte na próxima semana!</p>
          </motion.div>
        )}

        {/* daily portal */}
        {portalEvent && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Portal do Dia</p>
            <DailyPortalCard
              portalColor={portalEvent.portal_color}
              colorRevealed={portalEvent.color_revealed}
              alreadyCompleted={portalEvent.already_completed}
              participantCount={portalEvent.participant_count}
              hasScannerItem={hasScannerItem}
              isScanning={scanPortal.isPending}
              onScan={handleScanPortal}
              onEnter={handleEnterPortal}
            />
          </div>
        )}

        {/* pending dungeon */}
        <AnimatePresence>
          {pendingDungeon && dungeonExpiresAt && (
            <motion.div key="pending" initial={{ opacity: 0, scale: 0.95, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-2">
              <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider px-1 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Dungeon Aguardando
              </p>
              <PendingDungeonCard tier={pendingDungeon} expiresAt={dungeonExpiresAt} fragmentCount={fragmentCount} onClaim={handleClaimDungeon} isClaiming={claimDungeon.isPending} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* fragments */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-4 space-y-3"
        >
          <FragmentBar count={fragmentCount} />
          {(fragments?.lifetime_fragments ?? 0) > 0 && (
            <p className="text-xs text-muted-foreground/60 text-right">{fragments!.lifetime_fragments} ⬡ coletados no total</p>
          )}
        </motion.div>

        {/* weekly history */}
        {(portalEvent?.runs_this_week?.length ?? 0) > 0 && (
          <WeeklyHistory runs={portalEvent!.runs_this_week} />
        )}

        {/* fragment dungeons */}
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                <Swords className="w-4 h-4 text-purple-400" /> Dungeons de Fragmento
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">Invoque com {FRAGMENT_COST} fragmentos</p>
            </div>
            {!canInvokeFragDungeon && (
              <span className="text-xs text-muted-foreground bg-white/[0.04] rounded-lg px-2.5 py-1 shrink-0 border border-white/[0.08]">{fragmentCount}/{FRAGMENT_COST} ⬡</span>
            )}
          </div>

          <div className="flex items-start gap-2.5 bg-amber-500/5 border border-amber-500/20 rounded-xl px-3.5 py-3">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
            <div className="text-xs text-muted-foreground space-y-0.5">
              <p><span className="text-amber-300 font-semibold">Pets não são permitidos</span> nestas dungeons.</p>
              <p>Cada ação tem cooldown de <span className="text-foreground font-semibold">45 segundos</span>. Planeje bem.</p>
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            {(Object.keys(FRAGMENT_TIERS) as FragmentTier[]).map(tier => (
              <FragmentTierCard key={tier} tier={tier} canInvoke={canInvokeFragDungeon} onInvoke={tier => setFragmentLobbyTier(tier)} />
            ))}
          </div>
        </div>

      </div>

      <AnimatePresence>
        {fragmentLobbyTier && (
          <FragmentLobbyDialog
            tier={fragmentLobbyTier} onSessionReady={handleLobbyReady} onClose={() => setFragmentLobbyTier(null)}
            playerName={profile?.display_name || user?.email || 'Herói'} playerLevel={profile?.level || 1}
            playerAtk={playerStats.atk ?? 15} playerDef={playerStats.def ?? 8}
            playerHp={curHp} playerMaxHp={maxHp} playerMp={curMp} playerMaxMp={maxMp}
            playerClass={profile?.class_type || 'guerreiro'}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
