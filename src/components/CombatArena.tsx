import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Dices } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

type Turn = 'idle' | 'player' | 'boss' | 'finished';

type TurnSummary = {
  dado_player: number;
  dano_player: number;
  dado_boss: number;
  dano_boss: number;
  hp_boss_restante: number;
  hp_player_restante: number;
  status: 'em_andamento' | 'vitoria' | 'derrota';
  loot_drop?: { id: string; name: string; icon: string; rarity: string } | null;
};

type CombatDataProvider = {
  processTurn: (params: {
    combateId?: string;
    currentBossHp: number;
    currentPlayerHp: number;
    acaoEscolhida: 'atacar';
  }) => Promise<TurnSummary>;
};

type DamagePopup = {
  id: number;
  value: number;
  target: 'boss' | 'player';
};

type CombatArenaProps = {
  combateId?: string;
  initialBossHp?: number;
  initialPlayerHp?: number;
  provider?: CombatDataProvider;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Default provider with Supabase integration and local mock fallback.
const mockProvider: CombatDataProvider = {
  async processTurn({ combateId, currentBossHp, currentPlayerHp, acaoEscolhida }) {
    if (combateId) {
      const { data, error } = await supabase.functions.invoke('processar_turno', {
        body: {
          combate_id: combateId,
          acao_escolhida: acaoEscolhida,
        },
      });

      if (error) {
        throw error;
      }

      return data as TurnSummary;
    }

    await wait(900);

    const dadoPlayer = Math.floor(Math.random() * 20) + 1;
    const danoPlayer = Math.max(1, Math.floor(dadoPlayer * 1.8));
    const hpBossRestante = Math.max(currentBossHp - danoPlayer, 0);

    if (hpBossRestante <= 0) {
      return {
        dado_player: dadoPlayer,
        dano_player: danoPlayer,
        dado_boss: 0,
        dano_boss: 0,
        hp_boss_restante: hpBossRestante,
        hp_player_restante: currentPlayerHp,
        status: 'vitoria',
      };
    }

    const dadoBoss = Math.floor(Math.random() * 20) + 1;
    const danoBoss = Math.max(1, Math.floor(dadoBoss * 1.3));
    const hpPlayerRestante = Math.max(currentPlayerHp - danoBoss, 0);

    return {
      dado_player: dadoPlayer,
      dano_player: danoPlayer,
      dado_boss: dadoBoss,
      dano_boss: danoBoss,
      hp_boss_restante: hpBossRestante,
      hp_player_restante: hpPlayerRestante,
      status: hpPlayerRestante <= 0 ? 'derrota' : 'em_andamento',
    };
  },
};

export default function CombatArena({
  combateId,
  initialBossHp = 160,
  initialPlayerHp = 120,
  provider,
}: CombatArenaProps) {
  const dataProvider = useMemo(() => provider ?? mockProvider, [provider]);

  const [turn, setTurn] = useState<Turn>('idle');
  const [isRolling, setIsRolling] = useState(false);
  const [rollValue, setRollValue] = useState<number | null>(null);
  const [bossHp, setBossHp] = useState(initialBossHp);
  const [playerHp, setPlayerHp] = useState(initialPlayerHp);
  const [damagePopups, setDamagePopups] = useState<DamagePopup[]>([]);
  const [lootDrop, setLootDrop] = useState<{ name: string; icon: string; rarity: string } | null>(null);
  const bossHpRef = useRef(bossHp);
  const playerHpRef = useRef(playerHp);

  useEffect(() => {
    bossHpRef.current = bossHp;
  }, [bossHp]);

  useEffect(() => {
    playerHpRef.current = playerHp;
  }, [playerHp]);

  const pushDamage = (target: 'boss' | 'player', value: number) => {
    const popupId = Date.now() + Math.floor(Math.random() * 1000);
    setDamagePopups((prev) => [...prev, { id: popupId, value, target }]);
    window.setTimeout(() => {
      setDamagePopups((prev) => prev.filter((item) => item.id !== popupId));
    }, 850);
  };

  const startBattle = () => {
    setBossHp(initialBossHp);
    setPlayerHp(initialPlayerHp);
    setRollValue(null);
    setDamagePopups([]);
    setLootDrop(null);
    setTurn('player');
  };

  useEffect(() => {
    if (turn === 'idle' || turn === 'finished') {
      return;
    }

    let cancelled = false;

    const resolveTurn = async () => {
      if (turn !== 'player') {
        return;
      }

      const turnResult = await dataProvider.processTurn({
        combateId,
        currentBossHp: bossHpRef.current,
        currentPlayerHp: playerHpRef.current,
        acaoEscolhida: 'atacar',
      });

      if (cancelled) {
        return;
      }

      setTurn('player');
      setIsRolling(true);
      setRollValue(null);
      await wait(700);

      setIsRolling(false);
      setRollValue(turnResult.dado_player);
      setBossHp(turnResult.hp_boss_restante);
      pushDamage('boss', turnResult.dano_player);

      await wait(950);
      if (cancelled) {
        return;
      }

      if (turnResult.status === 'vitoria') {
        if (turnResult.loot_drop) {
          setLootDrop(turnResult.loot_drop);
        }
        setTurn('finished');
        return;
      }

      setTurn('boss');
      setIsRolling(true);
      setRollValue(null);
      await wait(700);

      if (cancelled) {
        return;
      }

      setIsRolling(false);
      setRollValue(turnResult.dado_boss);
      setPlayerHp(turnResult.hp_player_restante);
      pushDamage('player', turnResult.dano_boss);

      await wait(950);
      if (cancelled) {
        return;
      }

      if (turnResult.status === 'derrota') {
        setTurn('finished');
        return;
      }

      setTurn('player');
    };

    resolveTurn();

    return () => {
      cancelled = true;
    };
  }, [turn, dataProvider, combateId]);

  const winnerLabel =
    turn === 'finished'
      ? bossHp <= 0
        ? 'Player venceu!'
        : 'Boss venceu!'
      : null;

  return (
    <section className="mx-auto w-full max-w-4xl rounded-2xl border border-zinc-700/60 bg-zinc-900/70 p-6 text-zinc-100 shadow-xl backdrop-blur-sm">
      <header className="mb-6 flex items-center justify-between gap-4">
        <h2 className="text-xl font-bold tracking-wide">Combat Arena</h2>
        <div
          className={`rounded-full px-4 py-1 text-sm font-semibold ${
            turn === 'player'
              ? 'bg-emerald-500/20 text-emerald-300'
              : turn === 'boss'
                ? 'bg-rose-500/20 text-rose-300'
                : 'bg-zinc-700/50 text-zinc-300'
          }`}
        >
          {turn === 'player' && 'Player Turn'}
          {turn === 'boss' && 'Boss Turn'}
          {turn === 'idle' && 'Ready'}
          {turn === 'finished' && 'Battle Ended'}
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-3 md:items-center">
        <div className="relative rounded-xl border border-zinc-700/60 bg-zinc-800/70 p-4 text-center">
          <p className="text-sm text-zinc-400">Player HP</p>
          <p className="mt-2 text-3xl font-black text-emerald-300">{playerHp}</p>
          <AnimatePresence>
            {damagePopups
              .filter((popup) => popup.target === 'player')
              .map((popup) => (
                <motion.span
                  key={popup.id}
                  initial={{ opacity: 0, y: 10, scale: 0.8 }}
                  animate={{ opacity: 1, y: -24, scale: 1 }}
                  exit={{ opacity: 0, y: -42, scale: 1.05 }}
                  transition={{ duration: 0.45 }}
                  className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 text-xl font-extrabold text-rose-400"
                >
                  -{popup.value}
                </motion.span>
              ))}
          </AnimatePresence>
        </div>

        <div className="flex flex-col items-center justify-center gap-3">
          <motion.div
            animate={
              isRolling
                ? { rotate: [0, 180, 540, 900, 1260], scale: [1, 1.15, 1] }
                : { rotate: 0, scale: 1 }
            }
            transition={{ duration: 1, ease: 'easeInOut' }}
            className="flex h-32 w-32 items-center justify-center rounded-3xl border border-zinc-600 bg-zinc-800 shadow-inner"
          >
            <Dices className="h-12 w-12 text-amber-300" />
          </motion.div>

          <div className="text-center">
            <p className="text-xs uppercase tracking-widest text-zinc-400">D20 Roll</p>
            <p className="mt-1 text-3xl font-black text-amber-200">{rollValue ?? '--'}</p>
          </div>
        </div>

        <div className="relative rounded-xl border border-zinc-700/60 bg-zinc-800/70 p-4 text-center">
          <p className="text-sm text-zinc-400">Boss HP</p>
          <p className="mt-2 text-3xl font-black text-rose-300">{bossHp}</p>
          <AnimatePresence>
            {damagePopups
              .filter((popup) => popup.target === 'boss')
              .map((popup) => (
                <motion.span
                  key={popup.id}
                  initial={{ opacity: 0, y: 10, scale: 0.8 }}
                  animate={{ opacity: 1, y: -24, scale: 1 }}
                  exit={{ opacity: 0, y: -42, scale: 1.05 }}
                  transition={{ duration: 0.45 }}
                  className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 text-xl font-extrabold text-rose-400"
                >
                  -{popup.value}
                </motion.span>
              ))}
          </AnimatePresence>
        </div>
      </div>

      <footer className="mt-8 flex flex-col items-center gap-3">
        {winnerLabel ? <p className="text-lg font-bold text-amber-200">{winnerLabel}</p> : null}

        {lootDrop && bossHp <= 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-4 text-center space-y-1"
          >
            <p className="text-sm font-bold text-yellow-300">🎁 Item Obtido!</p>
            <p className="text-2xl">{lootDrop.icon}</p>
            <p className="text-sm font-semibold text-foreground">{lootDrop.name}</p>
            <p className="text-xs text-yellow-400 uppercase font-bold">{lootDrop.rarity}</p>
            <p className="text-[10px] text-muted-foreground">Vá ao seu Inventário para equipar!</p>
          </motion.div>
        )}
        <button
          type="button"
          onClick={startBattle}
          disabled={isRolling}
          className="rounded-lg bg-amber-400 px-5 py-2.5 font-bold text-zinc-900 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {turn === 'idle' ? 'Start Combat' : 'Restart Combat'}
        </button>

        <p className="text-xs text-zinc-400">
          Com combate_id preenchido, os valores vem da Edge Function processar_turno no Supabase.
        </p>
      </footer>
    </section>
  );
}
