import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Dices } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { sfx, resumeAudioContext } from '@/lib/sfx';
import { useToast } from '@/hooks/use-toast';

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
  habilidade_player?: string;
  habilidade_boss?: string;
  efeitos_player?: string[];
  efeitos_boss?: string[];
  log_id?: string | null;
  /** Preenchido pelo servidor quando a habilidade foi bloqueada por MP insuficiente. */
  skill_blocked?: boolean;
  skill_blocked_reason?: string;
};

type CombatDataProvider = {
  processTurn: (params: {
    combateId?: string;
    currentBossHp: number;
    currentPlayerHp: number;
    currentPlayerMp?: number;
    acaoEscolhida: 'atacar';
    skillId?: string;
    skillName?: string;
    skillPower?: number;
  }) => Promise<TurnSummary>;
};

type DamagePopup = {
  id: number;
  value: number;
  target: 'boss' | 'player';
  crit?: boolean;
};

type HitEffect = {
  id: number;
  target: 'boss' | 'player';
};

type CritParticle = {
  id: number;
  target: 'boss' | 'player';
  variant: 'blood' | 'energy';
  pxEnd: number;
  pyEnd: number;
  size: number;
  hue: number;
  duration: number;
};

type Confetti = {
  id: number;
  cx: number;
  cdx: number;
  duration: number;
  delay: number;
  color: string;
  size: number;
};

type CombatArenaProps = {
  combateId?: string;
  initialBossHp?: number;
  initialPlayerHp?: number;
  initialPlayerMp?: number;
  initialPlayerMaxMp?: number;
  bossName?: string;
  bossElement?: string | null;
  provider?: CombatDataProvider;
  onVictory?: () => void;
  onDefeat?: () => void;
  onClose?: () => void;
};

type CombatSkill = {
  id: string;
  name: string;
  power: number;
};

type BattleLogEntry = {
  id: number;
  actor: 'player' | 'boss';
  skill: string;
  damage: number;
  roll: number;
  effects: string[];
};

type ProfileLoadoutRow = {
  combat_skill_loadout?: unknown;
};

type BossResource = 'mana' | 'stamina';

// Determina se o boss usa Mana (criaturas mágicas) ou Estamina (criaturas físicas).
function getBossResourceType(name?: string, element?: string | null): BossResource {
  const text = `${name || ''} ${element || ''}`.toLowerCase();
  const magicKeywords = [
    'mago', 'feiticeir', 'bruxo', 'necro', 'arcan', 'fenix', 'phoenix', 'sereia',
    'dragão', 'dragao', 'wyvern', 'lich', 'espectro', 'fantasma', 'lord daemon',
    'lorde daemon', 'demon', 'cavaleiro do vazio', 'sphinx', 'esfinge', 'chronos',
    'leviata', 'hidra', 'quimera', 'guerreiro imortal',
  ];
  const magicElements = ['sagrado', 'escuridão', 'escuridao', 'demônio', 'demonio', 'morto-vivo', 'raio', 'água', 'agua', 'gelo'];
  if (magicKeywords.some((k) => text.includes(k))) return 'mana';
  if (magicElements.some((k) => text.includes(k))) return 'mana';
  return 'stamina';
}

// Custo de MP de uma habilidade do jogador, derivado do "power".
// Aumentado para tornar gestão de mana mais relevante: cada ~15 de poder
// custa 1 MP (mín. 2, máx. 16).
export function getSkillMpCost(power: number): number {
  if (!power || power <= 0) return 0;
  return Math.max(2, Math.min(16, Math.ceil(power / 15)));
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Default provider with Supabase integration and local mock fallback.
const mockProvider: CombatDataProvider = {
  async processTurn({ combateId, currentBossHp, currentPlayerHp, currentPlayerMp, acaoEscolhida, skillId, skillName, skillPower }) {
    if (combateId) {
      const { data, error } = await supabase.functions.invoke('processar_turno', {
        body: {
          combate_id: combateId,
          acao_escolhida: acaoEscolhida,
          skill_id: skillId,
          skill_name: skillName,
          skill_power: skillPower,
          current_mp: currentPlayerMp,
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

    const bossSkillPool = ['Golpe Selvagem', 'Açoite Pesado', 'Pressão Brutal', 'Investida'];
    const habilidade_boss = bossSkillPool[Math.floor(Math.random() * bossSkillPool.length)];

    return {
      dado_player: dadoPlayer,
      dano_player: danoPlayer,
      dado_boss: dadoBoss,
      dano_boss: danoBoss,
      hp_boss_restante: hpBossRestante,
      hp_player_restante: hpPlayerRestante,
      status: hpPlayerRestante <= 0 ? 'derrota' : 'em_andamento',
      habilidade_player: skillName || 'Ataque Basico',
      habilidade_boss,
      efeitos_player: [],
      efeitos_boss: [],
    };
  },
};

export default function CombatArena({
  combateId,
  initialBossHp = 160,
  initialPlayerHp = 120,
  initialPlayerMp = 40,
  initialPlayerMaxMp = 40,
  bossName,
  bossElement,
  provider,
  onVictory,
  onDefeat,
  onClose,
}: CombatArenaProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const dataProvider = useMemo(() => provider ?? mockProvider, [provider]);

  const bossResourceType: BossResource = useMemo(
    () => getBossResourceType(bossName, bossElement),
    [bossName, bossElement],
  );
  const bossResourceMax = useMemo(() => Math.max(40, Math.round(initialBossHp * 0.5)), [initialBossHp]);

  const [turn, setTurn] = useState<Turn>('idle');
  const [isRolling, setIsRolling] = useState(false);
  const [rollValue, setRollValue] = useState<number | null>(null);
  const [bossHp, setBossHp] = useState(initialBossHp);
  const [playerHp, setPlayerHp] = useState(initialPlayerHp);
  const [playerMp, setPlayerMp] = useState(initialPlayerMp);
  const [bossResource, setBossResource] = useState(bossResourceMax);
  const [damagePopups, setDamagePopups] = useState<DamagePopup[]>([]);
  const [hitEffects, setHitEffects] = useState<HitEffect[]>([]);
  const [arenaShake, setArenaShake] = useState(false);
  const [screenFlash, setScreenFlash] = useState(false);
  const [lootDrop, setLootDrop] = useState<{ name: string; icon: string; rarity: string } | null>(null);
  const [selectedSkills, setSelectedSkills] = useState<CombatSkill[]>([]);
  const [battleLog, setBattleLog] = useState<BattleLogEntry[]>([]);
  const [critParticles, setCritParticles] = useState<CritParticle[]>([]);
  const [confetti, setConfetti] = useState<Confetti[]>([]);
  const [showVictory, setShowVictory] = useState(false);
  const [showDefeat, setShowDefeat] = useState(false);
  const [insufficientResourceWarning, setInsufficientResourceWarning] = useState<string | null>(null);
  const bossHpRef = useRef(bossHp);
  const playerHpRef = useRef(playerHp);
  const playerMpRef = useRef(playerMp);
  const bossResourceRef = useRef(bossResource);
  const currentBattleTokenRef = useRef(0);
  const mountedRef = useRef(true);
  const skillCursorRef = useRef(0);

  useEffect(() => {
    bossHpRef.current = bossHp;
  }, [bossHp]);

  useEffect(() => {
    playerHpRef.current = playerHp;
  }, [playerHp]);

  useEffect(() => {
    playerMpRef.current = playerMp;
  }, [playerMp]);

  useEffect(() => {
    bossResourceRef.current = bossResource;
  }, [bossResource]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      currentBattleTokenRef.current += 1;
    };
  }, []);

  useEffect(() => {
    const loadCombatSkills = async () => {
      if (!user) {
        setSelectedSkills([]);
        return;
      }

      try {
        const { data } = await supabase
          .from('profiles')
          .select('combat_skill_loadout')
          .eq('user_id', user.id)
          .maybeSingle();

        const row = data as ProfileLoadoutRow | null;
        const raw = Array.isArray(row?.combat_skill_loadout) ? row.combat_skill_loadout : [];
        const parsed = raw
          .map((entry: unknown) => {
            const safeEntry = typeof entry === 'object' && entry ? (entry as Record<string, unknown>) : {};
            return {
              id: String(safeEntry.id || ''),
              name: String(safeEntry.name || 'Ataque Basico'),
              power: Number(safeEntry.power || 0),
            };
          })
          .filter((skill: CombatSkill) => skill.id);

        setSelectedSkills(parsed.slice(0, 4));
      } catch {
        // Column may not exist yet — silently use default (Ataque Basico)
        setSelectedSkills([]);
      }
    };

    loadCombatSkills();
  }, [user]);

  // Auto-inicia o combate quando a arena recebe um combateId (após cliques de "Enfrentar boss").
  useEffect(() => {
    if (combateId && turn === 'idle') {
      startBattle();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combateId]);

  const appendBattleLog = (entry: Omit<BattleLogEntry, 'id'>) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setBattleLog((prev) => [
      { id, ...entry },
      ...prev,
    ].slice(0, 12));
  };

  const spawnCritParticles = (target: 'boss' | 'player') => {
    // Boss takes blood (rose/red), Player takes energy (cyan/violet)
    const variant: 'blood' | 'energy' = target === 'boss' ? 'blood' : 'energy';
    const count = 14;
    const baseId = Date.now() + Math.floor(Math.random() * 10000);
    const particles: CritParticle[] = Array.from({ length: count }).map((_, i) => {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const distance = 60 + Math.random() * 60;
      return {
        id: baseId + i,
        target,
        variant,
        pxEnd: Math.cos(angle) * distance,
        pyEnd: Math.sin(angle) * distance,
        size: 6 + Math.random() * 8,
        hue: variant === 'blood' ? 350 + Math.random() * 15 : 190 + Math.random() * 80,
        duration: 700 + Math.random() * 500,
      };
    });
    setCritParticles((prev) => [...prev, ...particles]);
    window.setTimeout(() => {
      setCritParticles((prev) => prev.filter((p) => !particles.some((np) => np.id === p.id)));
    }, 1300);
  };

  const pushDamage = (target: 'boss' | 'player', value: number, roll?: number) => {
    const baseId = Date.now() + Math.floor(Math.random() * 1000);
    const isCrit = (roll ?? 0) >= 18 || value >= 25;
    setDamagePopups((prev) => [...prev, { id: baseId, value, target, crit: isCrit }]);
    setHitEffects((prev) => [...prev, { id: baseId + 1, target }]);
    setArenaShake(true);
    if (target === 'player') {
      setScreenFlash(true);
      window.setTimeout(() => setScreenFlash(false), 550);
    }
    if (isCrit) {
      spawnCritParticles(target);
      sfx.crit();
    } else {
      sfx.slash();
      window.setTimeout(() => sfx.hit(), 80);
    }
    window.setTimeout(() => setArenaShake(false), 500);
    window.setTimeout(() => {
      setDamagePopups((prev) => prev.filter((item) => item.id !== baseId));
      setHitEffects((prev) => prev.filter((item) => item.id !== baseId + 1));
    }, 1100);
  };

  const launchVictoryCinematic = () => {
    const colors = ['hsl(var(--primary))', 'hsl(43 96% 56%)', 'hsl(var(--accent))', 'hsl(142 70% 55%)', 'hsl(0 80% 60%)'];
    const pieces: Confetti[] = Array.from({ length: 60 }).map((_, i) => ({
      id: Date.now() + i,
      cx: Math.random() * 100,
      cdx: (Math.random() - 0.5) * 200,
      duration: 2.5 + Math.random() * 2.5,
      delay: Math.random() * 0.6,
      color: colors[i % colors.length],
      size: 6 + Math.random() * 8,
    }));
    setConfetti(pieces);
    setShowVictory(true);
    sfx.victory();
    onVictory?.();
  };

  const launchDefeatCinematic = () => {
    setShowDefeat(true);
    sfx.defeat();
    onDefeat?.();
  };

  const startBattle = () => {
    // Resume the WebAudio context from a user gesture so SFX play reliably.
    resumeAudioContext();
    currentBattleTokenRef.current += 1;
    skillCursorRef.current = 0;
    setBossHp(initialBossHp);
    setPlayerHp(initialPlayerHp);
    setPlayerMp(initialPlayerMp);
    setBossResource(bossResourceMax);
    setRollValue(null);
    setDamagePopups([]);
    setHitEffects([]);
    setArenaShake(false);
    setScreenFlash(false);
    setLootDrop(null);
    setBattleLog([]);
    setCritParticles([]);
    setConfetti([]);
    setShowVictory(false);
    setShowDefeat(false);
    setInsufficientResourceWarning(null);
    setTurn('player');
  };

  // Encontra a próxima skill que o jogador pode pagar com MP atual.
  // Se nenhuma puder ser usada, retorna null (jogador faz Ataque Básico, sem custo).
  const pickAffordableSkill = (currentMp: number): { skill: CombatSkill | null; warning: string | null } => {
    if (selectedSkills.length === 0) return { skill: null, warning: null };

    const start = skillCursorRef.current % selectedSkills.length;
    let skippedHigh: CombatSkill | null = null;

    for (let i = 0; i < selectedSkills.length; i += 1) {
      const idx = (start + i) % selectedSkills.length;
      const candidate = selectedSkills[idx];
      const cost = getSkillMpCost(candidate.power);
      if (cost <= currentMp) {
        skillCursorRef.current = idx + 1;
        return { skill: candidate, warning: null };
      }
      if (!skippedHigh) skippedHigh = candidate;
    }

    skillCursorRef.current += 1;
    const warning = skippedHigh
      ? `MP insuficiente para "${skippedHigh.name}" (custa ${getSkillMpCost(skippedHigh.power)} MP). Usando Ataque Básico.`
      : null;
    return { skill: null, warning };
  };

  useEffect(() => {
    if (turn === 'idle' || turn === 'finished') {
      return;
    }

    const resolveTurn = async () => {
      if (turn !== 'player') {
        return;
      }

      const battleToken = currentBattleTokenRef.current;
      const { skill: chosenSkill, warning } = pickAffordableSkill(playerMpRef.current);
      setInsufficientResourceWarning(warning);

      const skillCost = chosenSkill ? getSkillMpCost(chosenSkill.power) : 0;

      // Toast de início de turno: mostra MP atual e aviso se alguma skill foi bloqueada.
      toast({
        title: '⚔️ Seu Turno',
        description: warning
          ? `MP: ${playerMpRef.current}/${initialPlayerMaxMp} — ${warning}`
          : `MP: ${playerMpRef.current}/${initialPlayerMaxMp}${chosenSkill ? ` • Usando ${chosenSkill.name}` : ' • Ataque Básico'}`,
        duration: 2800,
      });

      let turnResult: TurnSummary;
      try {
        turnResult = await dataProvider.processTurn({
          combateId,
          currentBossHp: bossHpRef.current,
          currentPlayerHp: playerHpRef.current,
          currentPlayerMp: playerMpRef.current,
          acaoEscolhida: 'atacar',
          skillId: chosenSkill?.id,
          skillName: chosenSkill?.name,
          skillPower: chosenSkill?.power,
        });
      } catch (err: unknown) {
        if (!mountedRef.current || battleToken !== currentBattleTokenRef.current) return;
        const msg = err instanceof Error ? err.message : String(err);
        const isMpError = /mp|mana|stamina|recurso|insuffi/i.test(msg);
        toast({
          title: isMpError ? '⚠️ Habilidade bloqueada pelo servidor' : '❌ Erro ao processar turno',
          description: isMpError
            ? `Servidor rejeitou a habilidade por recursos insuficientes. O turno foi cancelado.`
            : `Falha: ${msg}`,
          variant: 'destructive',
          duration: 4500,
        });
        setInsufficientResourceWarning(
          isMpError ? 'Servidor bloqueou a habilidade por MP insuficiente.' : `Erro: ${msg}`,
        );
        setTurn('finished');
        setIsRolling(false);
        return;
      }

      if (!mountedRef.current || battleToken !== currentBattleTokenRef.current) {
        return;
      }

      // Deduz MP do jogador apenas se a skill foi usada com sucesso.
      if (skillCost > 0) {
        setPlayerMp((prev) => Math.max(0, prev - skillCost));
      }

      const mpAfterTurn = Math.max(0, playerMpRef.current - skillCost);

      setTurn('player');
      setIsRolling(true);
      setRollValue(null);
      sfx.diceRoll();
      await wait(700);

      setIsRolling(false);
      setRollValue(turnResult.dado_player);
      setBossHp(turnResult.hp_boss_restante);
      pushDamage('boss', turnResult.dano_player, turnResult.dado_player);
      appendBattleLog({
        actor: 'player',
        skill: turnResult.habilidade_player || chosenSkill?.name || 'Ataque Basico',
        damage: turnResult.dano_player,
        roll: turnResult.dado_player,
        effects: turnResult.efeitos_player || [],
      });

      // Toast de fim do turno: mostra MP restante e se o servidor bloqueou alguma habilidade.
      const serverBlocked = turnResult.skill_blocked;
      toast({
        title: serverBlocked ? '⚠️ Habilidade bloqueada (servidor)' : `✅ Dano: ${turnResult.dano_player}`,
        description: serverBlocked
          ? `${turnResult.skill_blocked_reason || 'MP insuficiente'} — MP restante: ${mpAfterTurn}/${initialPlayerMaxMp}`
          : `D20: ${turnResult.dado_player} • MP restante: ${mpAfterTurn}/${initialPlayerMaxMp}`,
        duration: 2800,
        ...(serverBlocked ? { variant: 'destructive' as const } : {}),
      });

      await wait(950);
      if (!mountedRef.current || battleToken !== currentBattleTokenRef.current) {
        return;
      }

      if (turnResult.status === 'vitoria') {
        if (turnResult.loot_drop) {
          setLootDrop(turnResult.loot_drop);
        }
        launchVictoryCinematic();
        setTurn('finished');
        return;
      }

      setTurn('boss');
      setIsRolling(true);
      setRollValue(null);
      sfx.diceRoll();
      await wait(700);

      if (!mountedRef.current || battleToken !== currentBattleTokenRef.current) {
        return;
      }

      // Boss consome seu recurso (mana ou stamina) ao atacar.
      // Custo aleatório 4-9, regenera 2 se ficou sem.
      const bossCost = 4 + Math.floor(Math.random() * 6);
      let nextBossResource = bossResourceRef.current - bossCost;
      if (nextBossResource < 0) {
        // Boss exausto: recupera um pouco e ataca enfraquecido (efeito visual já existe via dano normal).
        nextBossResource = Math.min(bossResourceMax, bossResourceRef.current + 2);
      }
      setBossResource(Math.max(0, Math.min(bossResourceMax, nextBossResource)));

      setIsRolling(false);
      setRollValue(turnResult.dado_boss);
      setPlayerHp(turnResult.hp_player_restante);
      pushDamage('player', turnResult.dano_boss, turnResult.dado_boss);
      appendBattleLog({
        actor: 'boss',
        skill: turnResult.habilidade_boss || 'Golpe Selvagem',
        damage: turnResult.dano_boss,
        roll: turnResult.dado_boss,
        effects: turnResult.efeitos_boss || [],
      });

      await wait(950);
      if (!mountedRef.current || battleToken !== currentBattleTokenRef.current) {
        return;
      }

      if (turnResult.status === 'derrota') {
        launchDefeatCinematic();
        setTurn('finished');
        return;
      }

      // Jogador regenera 1 MP por turno (não em vitória/derrota)
      setPlayerMp((prev) => Math.min(initialPlayerMaxMp, prev + 1));

      setTurn('player');
    };

    resolveTurn().catch((error) => {
      console.error('Falha ao resolver turno de combate', error);
      if (mountedRef.current) {
        setTurn('finished');
        setIsRolling(false);
      }
    });
  }, [turn, dataProvider, combateId, selectedSkills]);

  const winnerLabel =
    turn === 'finished'
      ? bossHp <= 0
        ? 'Player venceu!'
        : 'Boss venceu!'
      : null;

  return (
    <section className="relative mx-auto w-full max-w-4xl overflow-hidden rounded-2xl border border-zinc-700/60 bg-zinc-900/70 p-6 text-zinc-100 shadow-xl backdrop-blur-sm">
      {screenFlash && (
        <div className="pointer-events-none absolute inset-0 z-30 rounded-2xl bg-rose-500/70 mix-blend-screen animate-hit-flash" />
      )}
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

      <div className="mb-4 rounded-xl border border-zinc-700/60 bg-zinc-800/60 p-3">
        <p className="text-xs uppercase tracking-wide text-zinc-400">Loadout (max 4)</p>
        {selectedSkills.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {selectedSkills.map((skill) => {
              const cost = getSkillMpCost(skill.power);
              const canAfford = playerMp >= cost || turn === 'idle';
              return (
                <span
                  key={skill.id}
                  title={
                    canAfford
                      ? `Custo: ${cost} MP`
                      : `MP insuficiente — necessário ${cost}, disponível ${playerMp}`
                  }
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-all select-none ${
                    canAfford
                      ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200'
                      : 'border-zinc-600/40 bg-zinc-700/20 text-zinc-500 opacity-50 cursor-not-allowed line-through'
                  }`}
                >
                  {!canAfford && <span className="text-[10px] not-italic no-underline line-through-none">⚠️</span>}
                  {skill.name}
                  <span className={`text-[10px] font-mono ${canAfford ? 'text-cyan-400/80' : 'text-zinc-500'}`}>
                    {cost} MP
                  </span>
                </span>
              );
            })}
          </div>
        ) : (
          <p className="mt-1 text-sm text-zinc-300">
            Nenhuma habilidade equipada na aba de Habilidades. Usando Ataque Basico.
          </p>
        )}
      </div>

      {insufficientResourceWarning && (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          ⚠️ {insufficientResourceWarning}
        </div>
      )}

      <div className={`grid gap-6 md:grid-cols-3 md:items-center ${arenaShake ? 'animate-combat-shake' : ''}`}>
        <div
          className={`relative rounded-xl border border-zinc-700/60 bg-zinc-800/70 p-4 text-center transition-shadow ${
            hitEffects.some((h) => h.target === 'player') ? 'animate-target-hit ring-2 ring-rose-500/70 shadow-[0_0_30px_hsl(0_72%_51%/0.55)]' : ''
          }`}
        >
          <p className="text-sm text-zinc-400">Player HP</p>
          <p className="mt-2 text-3xl font-black text-emerald-300">{playerHp}</p>
          {/* Barra de MP do jogador */}
          {(() => {
            const mpPct = initialPlayerMaxMp > 0 ? (playerMp / initialPlayerMaxMp) * 100 : 0;
            const isLow = mpPct <= 25;
            const isCritical = mpPct <= 10;
            return (
              <div className={`mt-3 ${isLow ? 'animate-low-resource' : ''}`}>
                <div className={`flex items-center justify-between text-[10px] uppercase tracking-widest ${
                  isCritical ? 'text-rose-300 font-bold' : isLow ? 'text-amber-300' : 'text-cyan-300/80'
                }`}>
                  <span>MP {isCritical && '⚠️'}</span>
                  <span className="font-mono">{playerMp}/{initialPlayerMaxMp}</span>
                </div>
                <div className={`mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-700/70 ${isCritical ? 'animate-low-resource-pulse' : ''}`}>
                  <div
                    className={`h-full transition-all duration-500 ${
                      isCritical
                        ? 'bg-gradient-to-r from-rose-500 to-rose-700'
                        : isLow
                          ? 'bg-gradient-to-r from-amber-400 to-orange-500'
                          : 'bg-gradient-to-r from-cyan-400 to-blue-500'
                    }`}
                    style={{ width: `${mpPct}%` }}
                  />
                </div>
              </div>
            );
          })()}
          {hitEffects
            .filter((h) => h.target === 'player')
            .map((h) => (
              <span
                key={`slash-${h.id}`}
                className="pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-transparent via-rose-300 to-transparent animate-slash"
              />
            ))}
          <AnimatePresence>
            {damagePopups
              .filter((popup) => popup.target === 'player')
              .map((popup) => (
                <span
                  key={popup.id}
                  className={`pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 font-extrabold animate-damage-float drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] ${
                    popup.crit ? 'text-3xl text-amber-300' : 'text-2xl text-rose-400'
                  }`}
                >
                  {popup.crit && <span className="mr-1 text-xs uppercase tracking-widest text-amber-200">CRIT!</span>}
                  -{popup.value}
                </span>
              ))}
          </AnimatePresence>
          {critParticles
            .filter((p) => p.target === 'player')
            .map((p) => (
              <span
                key={`particle-${p.id}`}
                className="pointer-events-none absolute left-1/2 top-1/2 rounded-full animate-particle-burst"
                style={{
                  width: `${p.size}px`,
                  height: `${p.size}px`,
                  background: `radial-gradient(circle, hsl(${p.hue} 95% 65%) 0%, hsl(${p.hue} 90% 45% / 0.85) 60%, transparent 100%)`,
                  boxShadow: `0 0 12px hsl(${p.hue} 95% 60% / 0.9)`,
                  ['--px-end' as never]: `${p.pxEnd}px`,
                  ['--py-end' as never]: `${p.pyEnd}px`,
                  animationDuration: `${p.duration}ms`,
                }}
              />
            ))}
          {critParticles.some((p) => p.target === 'player') && (
            <span className="pointer-events-none absolute left-1/2 top-1/2 h-12 w-12 rounded-full border-4 border-cyan-300/80 animate-shockwave" />
          )}
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

        <div
          className={`relative rounded-xl border border-zinc-700/60 bg-zinc-800/70 p-4 text-center transition-shadow ${
            hitEffects.some((h) => h.target === 'boss') ? 'animate-target-hit ring-2 ring-amber-400/70 shadow-[0_0_30px_hsl(43_96%_56%/0.55)]' : ''
          }`}
        >
          <p className="text-sm text-zinc-400">Boss HP</p>
          <p className="mt-2 text-3xl font-black text-rose-300">{bossHp}</p>
          {/* Barra de recurso do boss (Mana ou Estamina) */}
          {(() => {
            const resPct = bossResourceMax > 0 ? (bossResource / bossResourceMax) * 100 : 0;
            const isLow = resPct <= 25;
            const isCritical = resPct <= 10;
            const baseColor = bossResourceType === 'mana' ? 'text-violet-300/80' : 'text-lime-300/80';
            return (
              <div className={`mt-3 ${isLow ? 'animate-low-resource' : ''}`}>
                <div className="flex items-center justify-between text-[10px] uppercase tracking-widest">
                  <span className={isCritical ? 'text-rose-300 font-bold' : isLow ? 'text-amber-300' : baseColor}>
                    {bossResourceType === 'mana' ? '🔮 Mana' : '⚡ Stamina'} {isCritical && '⚠️'}
                  </span>
                  <span className="font-mono text-zinc-300">{bossResource}/{bossResourceMax}</span>
                </div>
                <div className={`mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-700/70 ${isCritical ? 'animate-low-resource-pulse' : ''}`}>
                  <div
                    className={`h-full transition-all duration-500 ${
                      isCritical
                        ? 'bg-gradient-to-r from-rose-500 to-rose-700'
                        : isLow
                          ? 'bg-gradient-to-r from-amber-400 to-orange-500'
                          : bossResourceType === 'mana'
                            ? 'bg-gradient-to-r from-violet-400 to-fuchsia-500'
                            : 'bg-gradient-to-r from-lime-400 to-emerald-500'
                    }`}
                    style={{ width: `${resPct}%` }}
                  />
                </div>
              </div>
            );
          })()}
          {hitEffects
            .filter((h) => h.target === 'boss')
            .map((h) => (
              <span
                key={`slash-${h.id}`}
                className="pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-transparent via-amber-200 to-transparent animate-slash"
              />
            ))}
          <AnimatePresence>
            {damagePopups
              .filter((popup) => popup.target === 'boss')
              .map((popup) => (
                <span
                  key={popup.id}
                  className={`pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 font-extrabold animate-damage-float drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] ${
                    popup.crit ? 'text-3xl text-amber-300' : 'text-2xl text-rose-400'
                  }`}
                >
                  {popup.crit && <span className="mr-1 text-xs uppercase tracking-widest text-amber-200">CRIT!</span>}
                  -{popup.value}
                </span>
              ))}
          </AnimatePresence>
          {critParticles
            .filter((p) => p.target === 'boss')
            .map((p) => (
              <span
                key={`particle-${p.id}`}
                className="pointer-events-none absolute left-1/2 top-1/2 rounded-full animate-particle-burst"
                style={{
                  width: `${p.size}px`,
                  height: `${p.size}px`,
                  background: `radial-gradient(circle, hsl(${p.hue} 95% 65%) 0%, hsl(${p.hue} 85% 40% / 0.85) 55%, transparent 100%)`,
                  boxShadow: `0 0 14px hsl(${p.hue} 95% 55% / 0.9)`,
                  ['--px-end' as never]: `${p.pxEnd}px`,
                  ['--py-end' as never]: `${p.pyEnd}px`,
                  animationDuration: `${p.duration}ms`,
                }}
              />
            ))}
          {critParticles.some((p) => p.target === 'boss') && (
            <span className="pointer-events-none absolute left-1/2 top-1/2 h-12 w-12 rounded-full border-4 border-rose-400/80 animate-shockwave" />
          )}
        </div>
      </div>

      {showVictory && (
        <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden animate-victory-overlay">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/30 via-purple-900/40 to-rose-600/30" />
          <div
            className="absolute left-1/2 top-1/2 h-[140vmax] w-[140vmax] animate-victory-rays"
            style={{
              background:
                'conic-gradient(from 0deg, transparent 0deg, hsl(43 96% 60% / 0.35) 12deg, transparent 24deg, transparent 60deg, hsl(43 96% 60% / 0.25) 72deg, transparent 84deg, transparent 120deg, hsl(43 96% 60% / 0.3) 132deg, transparent 144deg, transparent 180deg, hsl(43 96% 60% / 0.22) 192deg, transparent 204deg, transparent 240deg, hsl(43 96% 60% / 0.28) 252deg, transparent 264deg, transparent 300deg, hsl(43 96% 60% / 0.2) 312deg, transparent 324deg)',
              maskImage: 'radial-gradient(circle, black 30%, transparent 70%)',
              WebkitMaskImage: 'radial-gradient(circle, black 30%, transparent 70%)',
            }}
          />
          {confetti.map((c) => (
            <span
              key={`confetti-${c.id}`}
              className="absolute top-0 animate-confetti rounded-sm"
              style={{
                left: `${c.cx}vw`,
                width: `${c.size}px`,
                height: `${c.size * 1.6}px`,
                background: c.color,
                ['--cdx' as never]: `${c.cdx}px`,
                ['--cdur' as never]: `${c.duration}s`,
                animationDelay: `${c.delay}s`,
                animationDuration: `${c.duration}s`,
                boxShadow: `0 0 8px ${c.color}`,
              }}
            />
          ))}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center">
            <p className="font-cinzel text-7xl md:text-9xl font-black text-amber-300 drop-shadow-[0_0_30px_hsl(43_96%_60%/0.9)] animate-victory-title">
              VICTORY!
            </p>
            <p className="text-lg md:text-2xl font-semibold text-amber-100/90 tracking-widest uppercase animate-victory-subtitle">
              Boss derrotado
            </p>
            <button
              type="button"
              onClick={() => setShowVictory(false)}
              className="pointer-events-auto mt-4 rounded-lg bg-amber-400 px-6 py-2.5 font-bold text-zinc-900 transition hover:bg-amber-300 animate-victory-subtitle"
            >
              Continuar
            </button>
          </div>
        </div>
      )}

      {showDefeat && (
        <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden animate-defeat-overlay">
          <div className="absolute inset-0 bg-black/85" />
          <div
            className="absolute inset-0 animate-defeat-vignette"
            style={{
              background: 'radial-gradient(ellipse at center, transparent 25%, hsl(0 70% 12% / 0.7) 65%, hsl(0 80% 6% / 0.95) 100%)',
            }}
          />
          <div className="absolute inset-0 animate-defeat-shake flex flex-col items-center justify-center gap-4 text-center">
            <p className="font-cinzel text-7xl md:text-9xl font-black text-rose-500 drop-shadow-[0_0_40px_hsl(0_80%_45%/0.95)] animate-defeat-title">
              DEFEAT
            </p>
            <p className="text-base md:text-xl font-semibold text-rose-200/80 tracking-[0.4em] uppercase animate-victory-subtitle">
              Voce foi derrotado pelo boss
            </p>
            <button
              type="button"
              onClick={() => setShowDefeat(false)}
              className="pointer-events-auto mt-6 rounded-lg border border-rose-500/60 bg-rose-900/40 px-6 py-2.5 font-bold text-rose-100 hover:bg-rose-800/60 transition animate-victory-subtitle"
            >
              Continuar
            </button>
          </div>
        </div>
      )}

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
        {turn === 'finished' ? (
          <button
            type="button"
            onClick={() => onClose?.()}
            className="rounded-lg bg-amber-400 px-5 py-2.5 font-bold text-zinc-900 transition hover:bg-amber-300"
          >
            Sair da Arena
          </button>
        ) : (
          <button
            type="button"
            onClick={startBattle}
            disabled={isRolling || turn === 'player' || turn === 'boss'}
            className="rounded-lg bg-amber-400 px-5 py-2.5 font-bold text-zinc-900 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {turn === 'idle' ? 'Iniciar Combate' : 'Combate em andamento...'}
          </button>
        )}

        {turn === 'finished' && (
          <p className="text-xs text-zinc-400 text-center">
            ⚔️ Combate finalizado. Este boss foi {bossHp <= 0 ? 'derrotado' : 'vitorioso'} — não é possível recombater agora.
          </p>
        )}
      </footer>

      <div className="mt-6 rounded-xl border border-zinc-700/60 bg-zinc-950/50 p-4">
        <p className="text-sm font-bold text-zinc-100">Registro de Turnos</p>
        <div className="mt-3 space-y-2 text-xs">
          {battleLog.length === 0 ? (
            <p className="text-zinc-400">Sem eventos ainda. Inicie o combate para registrar habilidades e dano.</p>
          ) : (
            battleLog.map((entry) => (
              <div key={entry.id} className="rounded-lg border border-zinc-700/60 bg-zinc-900/80 p-2">
                <p className={entry.actor === 'player' ? 'text-emerald-300 font-semibold' : 'text-rose-300 font-semibold'}>
                  {entry.actor === 'player' ? 'Heroi' : 'Boss'} usou {entry.skill}
                </p>
                <p className="text-zinc-300">D20: {entry.roll} | Dano: {entry.damage}</p>
                {entry.effects.length > 0 ? (
                  <p className="text-amber-300">Efeitos: {entry.effects.join(', ')}</p>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
