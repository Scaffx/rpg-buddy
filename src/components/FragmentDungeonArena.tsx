/**
 * FragmentDungeonArena
 * Multi-floor dungeon arena for Fragment Dungeons (invoked with 10 Portal Fragments).
 * Supports up to 8 players, 45s action cooldown, multi-floor progression.
 * No pets allowed.
 */
import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import DungeonArena, { type SessionPlayer, type PotionItem } from './DungeonArena';
import { type FragmentTier, FRAGMENT_TIERS } from '@/hooks/usePortalEvent';

// ── Class diversity bonus ─────────────────────────────────────────────────
const CLASS_DIVERSITY_THRESHOLD = 4;
const CLASS_DIVERSITY_XP_BONUS  = 0.25; // +25%

function computeClassDiversity(players: SessionPlayer[]): number {
  const classes = new Set(players.map(p => (p as any).playerClass ?? 'unknown'));
  return classes.size >= CLASS_DIVERSITY_THRESHOLD ? CLASS_DIVERSITY_XP_BONUS : 0;
}

// ── Dungeon IDs per floor ─────────────────────────────────────────────────
// Portal dungeons used as floors (cycled through); difficulty scales by tier
const FLOOR_DUNGEON_MAP: Record<FragmentTier, string[]> = {
  medium:    ['portal_blue',   'portal_yellow', 'portal_red'],
  hard:      ['portal_yellow', 'portal_red',    'portal_red',    'portal_legendary'],
  legendary: ['portal_red',    'portal_red',    'portal_legendary', 'portal_legendary', 'portal_legendary'],
  ultra:     ['portal_red',    'portal_legendary', 'portal_legendary', 'portal_legendary', 'portal_legendary', 'portal_legendary'],
};

// ── Tier display names ─────────────────────────────────────────────────────
const TIER_FLOOR_NAMES: Record<FragmentTier, string[]> = {
  medium:    ['Primeiro Andar', 'Segundo Andar', 'Terceiro Andar (Boss)'],
  hard:      ['Primeiro Andar', 'Segundo Andar', 'Terceiro Andar', 'Quarto Andar (Boss Final)'],
  legendary: ['Primeiro Andar', 'Segundo Andar', 'Terceiro Andar', 'Quarto Andar', 'Andar Final (Boss Épico)'],
  ultra:     ['Primeiro Andar', 'Segundo Andar', 'Terceiro Andar', 'Quarto Andar', 'Quinto Andar', 'Andar Final (Boss Lendário)'],
};

// ── Types ──────────────────────────────────────────────────────────────────
export type FragmentVictoryResult = {
  totalXp: number;
  totalGold: number;
  floorsCompleted: number;
  classDiversityBonus: boolean;
};

export type FragmentDungeonArenaProps = {
  sessionId: string;
  sessionPlayers: SessionPlayer[];
  dungeonTier: FragmentTier;
  isHost: boolean;
  // Current player stats
  playerLevel: number;
  playerAtk: number;
  playerDef: number;
  initialPlayerHp: number;
  initialPlayerMaxHp: number;
  initialPlayerMp: number;
  initialPlayerMaxMp: number;
  potions: PotionItem[];
  friendCount: number;
  onVictory: (result: FragmentVictoryResult) => void;
  onDefeat: () => void;
};

// ── Inter-floor rest screen (30 s countdown) ──────────────────────────────
function InterFloorScreen({
  floorJustCompleted,
  nextFloorName,
  isFinalFloor,
  xpSoFar,
  goldSoFar,
  onContinue,
}: {
  floorJustCompleted: number;
  nextFloorName: string;
  isFinalFloor: boolean;
  xpSoFar: number;
  goldSoFar: number;
  onContinue: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 p-4"
    >
      <div className="text-center space-y-2">
        <div className="text-5xl">✅</div>
        <h2 className="text-xl font-bold text-green-400">Andar {floorJustCompleted + 1} Concluído!</h2>
        <p className="text-sm text-muted-foreground">
          Descanse antes de prosseguir para o próximo desafio...
        </p>
      </div>

      <div className="rpg-card bg-green-500/10 border-green-500/30 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recompensas acumuladas</p>
        <div className="flex justify-around">
          <div className="text-center">
            <p className="text-lg font-bold text-yellow-400">+{xpSoFar} XP</p>
            <p className="text-xs text-muted-foreground">Experiência</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-amber-400">+{goldSoFar} 🪙</p>
            <p className="text-xs text-muted-foreground">Ouro</p>
          </div>
        </div>
      </div>

      {!isFinalFloor && (
        <div className="rpg-card bg-purple-500/10 border-purple-500/30">
          <p className="text-xs text-muted-foreground mb-1">Próximo:</p>
          <p className="font-semibold text-purple-300">⚔️ {nextFloorName}</p>
        </div>
      )}

      <button
        onClick={onContinue}
        className="w-full py-3 rounded-xl font-bold bg-purple-600 hover:bg-purple-700 text-white transition-colors"
      >
        {isFinalFloor ? '🏆 Ver Resultado Final' : '▶ Avançar para o Próximo Andar'}
      </button>
    </motion.div>
  );
}

// ── Floor progress bar ─────────────────────────────────────────────────────
function FloorProgressBar({
  tier,
  currentFloor,
  floorNames,
}: {
  tier: FragmentTier;
  currentFloor: number;
  floorNames: string[];
}) {
  const meta = FRAGMENT_TIERS[tier];
  return (
    <div className="rpg-card bg-muted/20 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {meta.emoji} {meta.label}
        </span>
        <span className={`text-xs font-bold ${meta.colorClass}`}>
          Andar {currentFloor + 1} / {floorNames.length}
        </span>
      </div>
      <div className="flex gap-1">
        {floorNames.map((name, i) => (
          <div
            key={i}
            title={name}
            className={`flex-1 h-2 rounded-full transition-all ${
              i < currentFloor
                ? 'bg-green-500'
                : i === currentFloor
                ? `bg-purple-500 animate-pulse`
                : 'bg-muted/40'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

// ── Party roster ──────────────────────────────────────────────────────────
function PartyRoster({ players }: { players: SessionPlayer[] }) {
  if (players.length <= 1) return null;
  const classes = new Set(players.map(p => (p as any).playerClass ?? 'unknown'));
  const hasDiversityBonus = classes.size >= CLASS_DIVERSITY_THRESHOLD;

  return (
    <div className="rpg-card bg-muted/20 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Grupo ({players.length}/8)
        </span>
        {hasDiversityBonus && (
          <span className="text-xs font-bold text-yellow-400 bg-yellow-500/10 border border-yellow-500/30 px-2 py-0.5 rounded-full">
            ✨ +25% XP Diversidade
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-1">
        {players.map(p => (
          <div
            key={p.userId}
            className={`flex items-center gap-2 px-2 py-1 rounded-lg text-xs ${
              p.isAlive ? 'bg-muted/30' : 'bg-red-500/10 opacity-50'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${p.isAlive ? 'bg-green-400' : 'bg-red-400'}`} />
            <span className="truncate font-medium">{p.displayName}</span>
            {p.isHost && <span className="text-amber-400 ml-auto">👑</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────
export default function FragmentDungeonArena({
  sessionId,
  sessionPlayers,
  dungeonTier,
  isHost,
  playerLevel,
  playerAtk,
  playerDef,
  initialPlayerHp,
  initialPlayerMaxHp,
  initialPlayerMp,
  initialPlayerMaxMp,
  potions,
  friendCount,
  onVictory,
  onDefeat,
}: FragmentDungeonArenaProps) {
  const floorDungeons = FLOOR_DUNGEON_MAP[dungeonTier];
  const floorNames    = TIER_FLOOR_NAMES[dungeonTier];
  const tierMeta      = FRAGMENT_TIERS[dungeonTier];

  const [currentFloor, setCurrentFloor]     = useState(0);
  const [phase, setPhase]                   = useState<'floor' | 'inter-floor' | 'complete'>('floor');
  const [accXp, setAccXp]                   = useState(0);
  const [accGold, setAccGold]               = useState(0);

  // Track current floor's player HP between floors
  const [floorStartHp, setFloorStartHp]   = useState(initialPlayerHp);
  const [floorStartMp, setFloorStartMp]   = useState(initialPlayerMp);

  const classDiversityBonus = useMemo(
    () => computeClassDiversity(sessionPlayers),
    [sessionPlayers],
  );

  function handleFloorVictory(result: { xpGained: number; goldGained: number }) {
    const xpBonus = Math.round(result.xpGained * classDiversityBonus);
    const newXp   = accXp + result.xpGained + xpBonus;
    const newGold = accGold + result.goldGained;
    setAccXp(newXp);
    setAccGold(newGold);

    if (currentFloor >= floorDungeons.length - 1) {
      // Last floor complete
      setPhase('complete');
    } else {
      setPhase('inter-floor');
    }
  }

  function handleFloorDefeat() {
    onDefeat();
  }

  function handleInterFloorContinue() {
    if (phase === 'complete') {
      onVictory({
        totalXp: accXp,
        totalGold: accGold,
        floorsCompleted: floorDungeons.length,
        classDiversityBonus: classDiversityBonus > 0,
      });
      return;
    }
    setCurrentFloor(prev => prev + 1);
    setPhase('floor');
  }

  if (phase === 'complete') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="space-y-6 p-4"
      >
        <div className="text-center space-y-2">
          <div className="text-6xl">🏆</div>
          <h2 className="text-2xl font-bold text-yellow-400">{tierMeta.emoji} Dungeon Concluída!</h2>
          <p className="text-muted-foreground text-sm">
            Você completou todos os {floorDungeons.length} andares da {tierMeta.label}!
          </p>
        </div>
        <div className="rpg-card bg-yellow-500/10 border-yellow-500/30 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recompensas Totais</p>
          <div className="flex justify-around">
            <div className="text-center">
              <p className="text-2xl font-bold text-yellow-400">+{accXp}</p>
              <p className="text-xs text-muted-foreground">XP Total</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-amber-400">+{accGold}</p>
              <p className="text-xs text-muted-foreground">Ouro Total</p>
            </div>
          </div>
          {classDiversityBonus > 0 && (
            <p className="text-center text-xs text-yellow-300">
              ✨ Bônus de Diversidade de Classes aplicado (+25% XP)
            </p>
          )}
        </div>
        <button
          onClick={() => onVictory({ totalXp: accXp, totalGold: accGold, floorsCompleted: floorDungeons.length, classDiversityBonus: classDiversityBonus > 0 })}
          className="w-full py-3 rounded-xl font-bold bg-yellow-600 hover:bg-yellow-700 text-white transition-colors"
        >
          🎉 Coletar Recompensas
        </button>
      </motion.div>
    );
  }

  if (phase === 'inter-floor') {
    return (
      <div className="space-y-4">
        <FloorProgressBar tier={dungeonTier} currentFloor={currentFloor} floorNames={floorNames} />
        <PartyRoster players={sessionPlayers} />
        <InterFloorScreen
          floorJustCompleted={currentFloor}
          nextFloorName={floorNames[currentFloor + 1] ?? ''}
          isFinalFloor={currentFloor >= floorDungeons.length - 1}
          xpSoFar={accXp}
          goldSoFar={accGold}
          onContinue={handleInterFloorContinue}
        />
      </div>
    );
  }

  // phase === 'floor'
  const floorDungeonId = floorDungeons[currentFloor];
  const floorName      = floorNames[currentFloor];

  return (
    <div className="space-y-3">
      <FloorProgressBar tier={dungeonTier} currentFloor={currentFloor} floorNames={floorNames} />
      <PartyRoster players={sessionPlayers} />

      <AnimatePresence mode="wait">
        <motion.div
          key={`floor-${currentFloor}`}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
        >
          <DungeonArena
            dungeonId={floorDungeonId}
            dungeonName={floorName}
            initialPlayerHp={floorStartHp}
            initialPlayerMaxHp={initialPlayerMaxHp}
            initialPlayerMp={floorStartMp}
            initialPlayerMaxMp={initialPlayerMaxMp}
            playerLevel={playerLevel}
            playerAtk={playerAtk}
            playerDef={playerDef}
            potions={potions}
            friendCount={friendCount}
            sessionId={sessionId}
            sessionPlayers={sessionPlayers}
            isHost={isHost}
            actionCooldownMs={45_000}
            isPortalDungeon
            onVictory={result => {
              // Pass remaining HP to next floor (player retains some HP between floors)
              setFloorStartHp(Math.max(1, Math.round(initialPlayerMaxHp * 0.6)));
              setFloorStartMp(Math.max(0, Math.round(initialPlayerMaxMp * 0.5)));
              handleFloorVictory(result);
            }}
            onDefeat={handleFloorDefeat}
            onFlee={handleFloorDefeat}
          />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
