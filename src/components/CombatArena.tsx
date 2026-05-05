import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Dices } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { sfx, resumeAudioContext } from '@/lib/sfx';
import { useToast } from '@/hooks/use-toast';

type Turn = 'idle' | 'player' | 'boss' | 'finished' | 'rancor_challenge';

type TurnSummary = {
  dado_player: number;
  dano_player: number;
  heal_amount?: number;
  dado_boss: number;
  dano_boss: number;
  boss_stunned?: boolean;
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
    skillEffectType?: string;
    skillMpCost?: number;
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

type SummonedUnit = {
  id: number;
  name: string;
  hp: number;
  maxHp: number;
  rollValue: number | null;
  isRolling: boolean;
};

type CombatArenaProps = {
  combateId?: string;
  initialBossHp?: number;
  initialPlayerHp?: number;
  initialPlayerMp?: number;
  initialPlayerMaxMp?: number;
  initialPlayerFatigue?: number;
  bossName?: string;
  bossElement?: string | null;
  provider?: CombatDataProvider;
  onVictory?: () => void;
  onDefeat?: () => void;
  onClose?: () => void;
  /** True se o jogador tem a Cabeça de Basilisco no inventário */
  hasBasiliscoHead?: boolean;
  /** Chamado quando o jogador foge do Guerreiro Imortal */
  onImmortalFlee?: () => void;
  /** Chamado quando o jogador usa a Cabeça de Basilisco para derrota verdadeira */
  onImmortalTrueDefeat?: () => void;
  /** Companheiro de boss (ex: Ossinho) que duela ao lado do herói */
  companionData?: { name: string; level: number; mood: number };
};

type CombatSkill = {
  id: string;
  name: string;
  power: number;
};

type BattleLogEntry = {
  id: number;
  actor: 'player' | 'boss' | 'companion';
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

const SUMMON_NAMES = ['Clone', 'Sombra', 'Fragmento', 'Espectro', 'Avatar', 'Minion'];

const RANCOR_QUESTIONS_POOL: ((mission?: string) => string)[] = [
  (m) => m
    ? `"${m}" continua pendente. O que realmente te impede de concluir isso?`
    : 'O que você está evitando enfrentar? Escreva agora, com honestidade.',
  (m) => m
    ? `Você falhou em "${m}" mais de uma vez. Qual é o real motivo por trás disso?`
    : 'Quantas vezes você prometeu a si mesmo que faria diferente? O que vai mudar agora?',
  (m) => m
    ? `"${m}" representa algo maior. O que você ganha ao finalmente completá-la?`
    : 'Se não for hoje, quando? O que vai ser diferente desta vez?',
  (m) => m
    ? `Cada vez que "${m}" fica pendente, uma parte de você se perde. O que vai fazer HOJE?`
    : 'Olhe para o que você adiou esta semana. Comprometa-se com uma ação concreta agora.',
];

/** Calcula ataque do companheiro com base em level e mood */
function computeCompanionAttack(level: number, mood: number): { roll: number; damage: number; skillName: string } {
  const roll = Math.floor(Math.random() * 20) + 1;
  const moodMod = mood >= 70 ? 1.2 : mood < 40 ? 0.8 : 1.0;
  const basePower = 2 + level * 1.5;
  const damage = Math.max(1, Math.round((roll * basePower / 10) * moodMod));
  const lowSkills  = ['Mordida', 'Osso Afiado', 'Arranhar'];
  const midSkills  = ['Garra Sombria', 'Dentada Funda', 'Uivo Sombrio'];
  const highSkills = ['Explosão Óssea', 'Golpe Espectral', 'Investida Fúnebre'];
  const pool = level <= 2 ? lowSkills : level <= 5 ? midSkills : highSkills;
  return { roll, damage, skillName: pool[Math.floor(Math.random() * pool.length)] };
}

const isSummonSkill = (skillName?: string): boolean =>
  /invocar|invoca[cç]|clone|fragmento|minion|sombra\s*gê|sombra\s*ge|desdobra|avatar|despertar|prolifera|divis[aã]o|ativar\s*cr/i.test(skillName ?? '');

// Default provider with Supabase integration and local mock fallback.
const mockProvider: CombatDataProvider = {
  async processTurn({ combateId, currentBossHp, currentPlayerHp, currentPlayerMp, acaoEscolhida, skillId, skillName, skillPower, skillEffectType, skillMpCost }) {
    if (combateId) {
      const { data, error } = await supabase.functions.invoke('processar_turno', {
        body: {
          combate_id: combateId,
          acao_escolhida: acaoEscolhida,
          skill_id: skillId,
          skill_name: skillName,
          skill_power: skillPower,
          current_mp: currentPlayerMp,
          ...(skillEffectType ? { skill_effect_type: skillEffectType } : {}),
          ...(skillMpCost !== undefined ? { skill_mp_cost: skillMpCost } : {}),
        },
      });

      if (error) {
        // supabase-js v2 retorna FunctionsHttpError com mensagem genérica.
        // O corpo JSON com a mensagem real está em error.context (Response).
        let realMessage = error.message || 'Erro desconhecido';
        try {
          const ctx = (error as any).context;
          if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.json();
            if (body?.error) realMessage = String(body.error);
            if (body?.message) realMessage = String(body.message);
          } else if (ctx && typeof ctx.text === 'function') {
            const txt = await ctx.text();
            if (txt) realMessage = txt;
          }
        } catch {
          /* ignore parse failure, keep generic message */
        }
        throw new Error(realMessage);
      }

      // Edge function pode retornar 2xx com payload de erro (ex.: insufficient_mp).
      if (data && typeof data === 'object' && 'error' in (data as any)) {
        throw new Error(String((data as any).message || (data as any).error));
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
  initialPlayerFatigue = 0,
  bossName,
  bossElement,
  provider,
  onVictory,
  onDefeat,
  onClose,
  hasBasiliscoHead = false,
  onImmortalFlee,
  onImmortalTrueDefeat,
  companionData,
}: CombatArenaProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const dataProvider = useMemo(() => provider ?? mockProvider, [provider]);

  const bossResourceType: BossResource = useMemo(
    () => getBossResourceType(bossName, bossElement),
    [bossName, bossElement],
  );
  const bossResourceMax = useMemo(() => Math.max(40, Math.round(initialBossHp * 0.5)), [initialBossHp]);

  // Guerreiro Imortal: detectar pelo nome
  const isImmortalBoss = useMemo(() => /guerreiro\s+imortal/i.test(bossName ?? ''), [bossName]);
  // Rancor Sombrio: confronta o heroi com suas falhas
  const isRancorBoss = useMemo(() => /rancor\s+sombrio/i.test(bossName ?? ''), [bossName]);
  // 'none' = combate normal | 'reborn' = mostrando overlay de renascimento
  const [immortalPhase, setImmortalPhase] = useState<'none' | 'reborn'>('none');
  // Conta quantas vezes o imortal renasceu nesta sessão (0 = primeira vez)
  const immortalRebirthCountRef = useRef(0);

  const [turn, setTurn] = useState<Turn>('idle');
  const [isRolling, setIsRolling] = useState(false);
  const [rollValue, setRollValue] = useState<number | null>(null);
  const [bossHp, setBossHp] = useState(initialBossHp);
  const [playerHp, setPlayerHp] = useState(initialPlayerHp);
  const [playerMp, setPlayerMp] = useState(initialPlayerMp);
  const [playerFatigue, setPlayerFatigue] = useState(initialPlayerFatigue);
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
  const [summonedUnits, setSummonedUnits] = useState<SummonedUnit[]>([]);
  // Rancor Sombrio
  const [rancorPhase, setRancorPhase] = useState<'none' | 'reconstituted'>('none');
  const [rancorQuestion, setRancorQuestion] = useState('');
  const [rancorAnswerText, setRancorAnswerText] = useState('');
  const [questionsAnswered, setQuestionsAnswered] = useState(0);
  const [rancorBoostBadge, setRancorBoostBadge] = useState(false);
  // Companion combat state
  const [companionRoll, setCompanionRoll] = useState<number | null>(null);
  const [companionIsRolling, setCompanionIsRolling] = useState(false);
  const [companionSkillName, setCompanionSkillName] = useState<string | null>(null);
  const bossHpRef = useRef(bossHp);
  const playerHpRef = useRef(playerHp);
  const playerMpRef = useRef(playerMp);
  const playerFatigueRef = useRef(playerFatigue);
  const bossResourceRef = useRef(bossResource);
  const summonedUnitsRef = useRef<SummonedUnit[]>([]);
  // Rancor refs
  const questionsAnsweredRef = useRef(0);
  const rancorTurnCountRef = useRef(0);
  const rancorMissionIdxRef = useRef(0);
  const rancorReconstitutedRef = useRef(false);
  const failedMissionTitlesRef = useRef<string[]>([]);
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
    playerFatigueRef.current = playerFatigue;
  }, [playerFatigue]);

  useEffect(() => {
    bossResourceRef.current = bossResource;
  }, [bossResource]);

  useEffect(() => {
    summonedUnitsRef.current = summonedUnits;
  }, [summonedUnits]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      currentBattleTokenRef.current += 1;
      sfx.stopRancorBattle();
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

  // Rancor Sombrio: jogador confirma sua resposta
  const handleRancorAnswerSubmit = () => {
    if (!rancorAnswerText.trim()) return;
    questionsAnsweredRef.current += 1;
    setQuestionsAnswered(questionsAnsweredRef.current);
    setRancorBoostBadge(true);
    setTimeout(() => setRancorBoostBadge(false), 4500);
    toast({
      title: '⚡ Você enfrentou seus medos!',
      description: 'Uma onda de determinação te impulsiona. Continue lutando!',
      duration: 3500,
    });
    setTurn('player');
  };

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

  /** Reinicia o combate contra o Guerreiro Imortal após o renascimento (mantém HP do jogador). */
  const handleImmortalFightAgain = async () => {
    // Resetar HP do boss no banco de dados para que processar_turno use o valor correto
    if (combateId && user) {
      void supabase
        .from('combates_ativos' as never)
        .update({ hp_atual_boss: initialBossHp } as never)
        .eq('id' as never, combateId as never);
    }
    setImmortalPhase('none');
    currentBattleTokenRef.current += 1;
    skillCursorRef.current = 0;
    setBossHp(initialBossHp);
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
    setSummonedUnits([]);
    summonedUnitsRef.current = [];
    // Mantém HP/MP do jogador (sem chamar startBattle que os resetaria)
    setTurn('player');
  };

  /** Rancor Sombrio: heroi escolhe continuar após reconstituição. */
  const handleRancorContinueFight = () => {
    const newHp = Math.ceil(initialBossHp * 0.5);
    if (combateId && user) {
      void supabase
        .from('combates_ativos' as never)
        .update({ hp_atual_boss: newHp, status: 'em_andamento' } as never)
        .eq('id' as never, combateId as never);
    }
    setRancorPhase('none');
    currentBattleTokenRef.current += 1;
    sfx.rancorBattle();
    setTurn('player');
  };

  const startBattle = () => {
    // Resume the WebAudio context from a user gesture so SFX play reliably.
    resumeAudioContext();
    sfx.stopRancorBattle();
    currentBattleTokenRef.current += 1;
    skillCursorRef.current = 0;
    setBossHp(initialBossHp);
    setPlayerHp(initialPlayerHp);
    setPlayerMp(initialPlayerMp);
    setPlayerFatigue(initialPlayerFatigue);
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
    setSummonedUnits([]);
    summonedUnitsRef.current = [];
    // Rancor Sombrio: música épica + carregar missões com mais falhas
    if (isRancorBoss) {
      questionsAnsweredRef.current = 0;
      rancorTurnCountRef.current = 0;
      rancorMissionIdxRef.current = 0;
      rancorReconstitutedRef.current = false;
      setQuestionsAnswered(0);
      setRancorPhase('none');
      setRancorQuestion('');
      setRancorAnswerText('');
      setRancorBoostBadge(false);
      if (user) {
        void supabase
          .from('missions' as never)
          .select('title' as never)
          .eq('user_id' as never, user.id as never)
          .or('is_failed.eq.true,status.eq.failed' as never)
          .limit(60)
          .then(({ data }) => {
            if (!data) return;
            const counts = new Map<string, number>();
            (data as { title: string }[]).forEach((m) => {
              counts.set(m.title, (counts.get(m.title) ?? 0) + 1);
            });
            failedMissionTitlesRef.current = [...counts.entries()]
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
              .map(([title]) => title);
          });
      }
      sfx.rancorBattle();
    }
    setTurn('player');
  };

  const persistPlayerVitals = (nextHp: number, nextMp: number, nextFatigue: number) => {
    if (!user?.id) return;
    void supabase
      .from('user_health_stats')
      .update({
        current_hp: Math.max(0, Math.round(nextHp)),
        current_mp: Math.max(0, Math.round(nextMp)),
        fatigue: Math.max(0, Math.min(100, Math.round(nextFatigue))),
      } as any)
      .eq('user_id', user.id);
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
      const cost = candidate.mpCost !== undefined ? candidate.mpCost : getSkillMpCost(candidate.power);
      if (cost <= currentMp) {
        skillCursorRef.current = idx + 1;
        return { skill: candidate, warning: null };
      }
      if (!skippedHigh) skippedHigh = candidate;
    }

    skillCursorRef.current += 1;
    const warning = skippedHigh
      ? `MP insuficiente para "${skippedHigh.name}" (custa ${skippedHigh.mpCost !== undefined ? skippedHigh.mpCost : getSkillMpCost(skippedHigh.power)} MP). Usando Ataque Básico.`
      : null;
    return { skill: null, warning };
  };

  useEffect(() => {
    if (turn === 'idle' || turn === 'finished' || turn === 'rancor_challenge') {
      return;
    }

    const resolveTurn = async () => {
      if (turn !== 'player') {
        return;
      }

      const battleToken = currentBattleTokenRef.current;
      const { skill: chosenSkill, warning } = pickAffordableSkill(playerMpRef.current);
      setInsufficientResourceWarning(warning);

      const skillCost = chosenSkill ? (chosenSkill.mpCost !== undefined ? chosenSkill.mpCost : getSkillMpCost(chosenSkill.power)) : 0;

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
          skillEffectType: chosenSkill?.effectType,
          skillMpCost: chosenSkill?.mpCost,
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
      persistPlayerVitals(playerHpRef.current, mpAfterTurn, playerFatigueRef.current);

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

      // Dano em área (splash) nas unidades invocadas
      if (summonedUnitsRef.current.length > 0) {
        const splashDmg = Math.max(1, Math.floor(turnResult.dano_player * 0.25));
        const nextUnits = summonedUnitsRef.current
          .map((u) => ({ ...u, hp: Math.max(0, u.hp - splashDmg) }))
          .filter((u) => u.hp > 0);
        setSummonedUnits(nextUnits);
        summonedUnitsRef.current = nextUnits;
      }

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

      // ── Turno do companheiro (boss-story, ex: Ossinho) ──────────────────────
      let currentBossHpAfterCompanion = turnResult.hp_boss_restante;
      if (companionData && currentBossHpAfterCompanion > 0) {
        setCompanionIsRolling(true);
        setCompanionRoll(null);
        setCompanionSkillName(null);
        sfx.diceRoll();
        await wait(700);
        if (!mountedRef.current || battleToken !== currentBattleTokenRef.current) return;
        const { roll: cRoll, damage: cDmg, skillName: cSkill } = computeCompanionAttack(
          companionData.level,
          companionData.mood,
        );
        setCompanionIsRolling(false);
        setCompanionRoll(cRoll);
        setCompanionSkillName(cSkill);
        currentBossHpAfterCompanion = Math.max(0, currentBossHpAfterCompanion - cDmg);
        setBossHp(currentBossHpAfterCompanion);
        pushDamage('boss', cDmg, cRoll);
        appendBattleLog({ actor: 'companion', skill: cSkill, damage: cDmg, roll: cRoll, effects: [] });
        toast({
          title: `💀 ${companionData.name} ataca!`,
          description: `${cSkill} • D20: ${cRoll} • Dano: ${cDmg}`,
          duration: 2000,
        });
        await wait(700);
        if (!mountedRef.current || battleToken !== currentBattleTokenRef.current) return;
        // Companheiro matou o boss
        if (currentBossHpAfterCompanion <= 0) {
          if (isRancorBoss) {
            if (questionsAnsweredRef.current < 2 && !rancorReconstitutedRef.current) {
              rancorReconstitutedRef.current = true;
              const newHp = Math.ceil(initialBossHp * 0.5);
              setBossHp(newHp);
              if (combateId && user) {
                void supabase
                  .from('combates_ativos' as never)
                  .update({ hp_atual_boss: newHp, status: 'em_andamento' } as never)
                  .eq('id' as never, combateId as never);
              }
              sfx.stopRancorBattle();
              setRancorPhase('reconstituted');
              setTurn('finished');
              return;
            }
            sfx.stopRancorBattle();
          }
          if (isImmortalBoss) {
            setShowVictory(true);
            sfx.victory();
            immortalRebirthCountRef.current += 1;
            setTimeout(() => {
              if (!mountedRef.current) return;
              setShowVictory(false);
              setImmortalPhase('reborn');
              setBossHp(initialBossHp);
              setBossResource(bossResourceMax);
            }, 2000);
          } else {
            if (turnResult.loot_drop) setLootDrop(turnResult.loot_drop);
            launchVictoryCinematic();
          }
          setTurn('finished');
          return;
        }
      }

      if (turnResult.status === 'vitoria') {
        // Rancor Sombrio: ressurge se o her\u00f3i ainda n\u00e3o enfrentou suas falhas
        if (isRancorBoss) {
          if (questionsAnsweredRef.current < 2 && !rancorReconstitutedRef.current) {
            rancorReconstitutedRef.current = true;
            const newHp = Math.ceil(initialBossHp * 0.5);
            setBossHp(newHp);
            if (combateId && user) {
              void supabase
                .from('combates_ativos' as never)
                .update({ hp_atual_boss: newHp, status: 'em_andamento' } as never)
                .eq('id' as never, combateId as never);
            }
            sfx.stopRancorBattle();
            setRancorPhase('reconstituted');
            setTurn('finished');
            return;
          }
          // Vit\u00f3ria verdadeira \u2014 her\u00f3i enfrentou suas falhas
          if (turnResult.loot_drop) setLootDrop(turnResult.loot_drop);
          sfx.stopRancorBattle();
          launchVictoryCinematic();
          setTurn('finished');
          return;
        }

        if (turnResult.loot_drop) {
          setLootDrop(turnResult.loot_drop);
        }

        if (isImmortalBoss) {
          // Mostrar vitória brevemente, depois acionar renascimento
          setShowVictory(true);
          sfx.victory();
          const isFirstTime = immortalRebirthCountRef.current === 0;
          immortalRebirthCountRef.current += 1;
          setTimeout(() => {
            if (!mountedRef.current) return;
            setShowVictory(false);
            setImmortalPhase('reborn');
            // Resetar HP do boss no client (DB será resetado ao clicar em Enfrentar Novamente)
            setBossHp(initialBossHp);
            setBossResource(bossResourceMax);
            // Avisar se é a primeira vez (para estilo diferente no overlay)
            if (!isFirstTime) {
              // Reutilizamos immortalRebirthCountRef; o overlay lê o ref
            }
          }, 2000);
        } else {
          launchVictoryCinematic();
        }
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
      const nextHp = Math.max(0, turnResult.hp_player_restante);
      setPlayerHp(nextHp);

      // Combate gera desgaste: +1 de fadiga por ataque do boss e +1 extra se dano foi alto.
      const fatigueGain = turnResult.dano_boss >= 20 ? 2 : 1;
      const nextFatigue = Math.min(100, Math.max(0, playerFatigueRef.current + fatigueGain));
      setPlayerFatigue(nextFatigue);
      persistPlayerVitals(nextHp, mpAfterTurn, nextFatigue);

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

      // ── Invocar unidades / ataques de unidades invocadas ───────────────────────────────
      let currentHpForSummons = nextHp;
      {
        const hasSummonSkill = isSummonSkill(turnResult.habilidade_boss);
        let workingUnits = [...summonedUnitsRef.current];

        if (hasSummonSkill && workingUnits.length < 3) {
          const count = 1 + Math.floor(Math.random() * 2);
          const newUnits: SummonedUnit[] = Array.from({ length: count }).map((_, i) => {
            const name = SUMMON_NAMES[(Math.floor(Math.random() * SUMMON_NAMES.length) + i) % SUMMON_NAMES.length];
            const hp = 25 + Math.floor(Math.random() * 16);
            return { id: Date.now() + i, name, hp, maxHp: hp, rollValue: null, isRolling: false };
          });
          workingUnits = [...workingUnits, ...newUnits].slice(0, 4);
          setSummonedUnits(workingUnits);
          summonedUnitsRef.current = workingUnits;
          toast({
            title: '⚠️ Unidades Invocadas!',
            description: `${newUnits.length} unidade(s) entram no combate!`,
            duration: 2800,
          });
          await wait(700);
          if (!mountedRef.current || battleToken !== currentBattleTokenRef.current) return;
        }

        if (workingUnits.length > 0 && turnResult.status !== 'derrota') {
          for (const unit of workingUnits) {
            if (!mountedRef.current || battleToken !== currentBattleTokenRef.current) break;
            if (unit.hp <= 0) continue;
            setSummonedUnits((prev) =>
              prev.map((u) => u.id === unit.id ? { ...u, isRolling: true, rollValue: null } : u),
            );
            sfx.diceRoll();
            await wait(550);
            if (!mountedRef.current || battleToken !== currentBattleTokenRef.current) break;
            const unitRoll = Math.floor(Math.random() * 20) + 1;
            const unitDamage = Math.max(1, Math.floor(unitRoll * 0.6));
            currentHpForSummons = Math.max(0, currentHpForSummons - unitDamage);
            setPlayerHp(currentHpForSummons);
            const updatedUnit: SummonedUnit = { ...unit, isRolling: false, rollValue: unitRoll };
            workingUnits = workingUnits.map((u) => u.id === unit.id ? updatedUnit : u);
            summonedUnitsRef.current = workingUnits;
            setSummonedUnits(workingUnits);
            pushDamage('player', unitDamage, unitRoll);
            appendBattleLog({
              actor: 'boss',
              skill: `${unit.name} Ataca`,
              damage: unitDamage,
              roll: unitRoll,
              effects: [],
            });
            await wait(450);
          }
          if (!mountedRef.current || battleToken !== currentBattleTokenRef.current) return;
          if (currentHpForSummons <= 0) {
            persistPlayerVitals(0, mpAfterTurn, nextFatigue);
            launchDefeatCinematic();
            setTurn('finished');
            return;
          }
        }
      }

      if (turnResult.status === 'derrota') {
        persistPlayerVitals(currentHpForSummons, mpAfterTurn, nextFatigue);
        launchDefeatCinematic();
        setTurn('finished');
        return;
      }

      // Jogador regenera 1 MP por turno (não em vitória/derrota)
      const regeneratedMp = Math.min(initialPlayerMaxMp, playerMpRef.current + 1);
      setPlayerMp(regeneratedMp);
      persistPlayerVitals(currentHpForSummons, regeneratedMp, nextFatigue);

      // Rancor Sombrio: provocação a cada 3 turnos do boss
      if (isRancorBoss) {
        rancorTurnCountRef.current += 1;
        if (rancorTurnCountRef.current % 3 === 0 && questionsAnsweredRef.current < 5) {
          const mIdx = rancorMissionIdxRef.current % Math.max(1, failedMissionTitlesRef.current.length);
          const missionTitle = failedMissionTitlesRef.current.length > 0
            ? failedMissionTitlesRef.current[mIdx]
            : undefined;
          rancorMissionIdxRef.current += 1;
          const questionFn = RANCOR_QUESTIONS_POOL[questionsAnsweredRef.current % RANCOR_QUESTIONS_POOL.length];
          setRancorQuestion(questionFn(missionTitle));
          setRancorAnswerText('');
          setTurn('rancor_challenge');
          return;
        }
      }

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
              const cost = skill.mpCost !== undefined ? skill.mpCost : getSkillMpCost(skill.power);
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

      {/* ── Rancor Sombrio: progresso de respostas ────────────────────────── */}
      {isRancorBoss && turn !== 'idle' && (
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-violet-700/40 bg-violet-950/50 px-3 py-2 text-xs">
          <span className="text-violet-300 font-semibold">☠️ Rancor Sombrio</span>
          <span className="text-zinc-400">— Verdades para a vitória:</span>
          <span className="font-mono font-bold text-violet-200 ml-auto">{questionsAnswered}/2 ✓</span>
          {rancorBoostBadge && (
            <span className="rounded bg-amber-500/20 px-2 py-0.5 text-amber-300 font-bold">⚡ Determinação Ativa!</span>
          )}
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
          <div className="mt-2 text-[11px] text-orange-300/90">
            Fadiga: <span className="font-mono font-semibold">{playerFatigue}%</span>
          </div>
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

      {/* ── Companheiro de Combate (boss-story) ─────────────────────────────── */}
      {companionData && turn !== 'idle' && (
        <div className="mt-4 rounded-xl border border-violet-700/40 bg-violet-950/40 p-3 flex items-center gap-4">
          <motion.div
            animate={companionIsRolling ? { rotate: [-12, 12, -12, 12, 0], scale: [1, 1.2, 1] } : { rotate: 0, scale: 1 }}
            transition={companionIsRolling ? { repeat: Infinity, duration: 0.35 } : {}}
            className="text-4xl select-none shrink-0"
          >
            💀
          </motion.div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-violet-300">
              {companionData.name}
              <span className="ml-2 text-[10px] font-normal text-zinc-400">
                Nv.{companionData.level} · Humor {companionData.mood}%
              </span>
            </p>
            {companionIsRolling && (
              <p className="text-xs text-violet-400 animate-pulse">Rolando dado…</p>
            )}
            {!companionIsRolling && companionSkillName && (
              <p className="text-xs text-violet-200">{companionSkillName}</p>
            )}
            {!companionIsRolling && !companionSkillName && (
              <p className="text-xs text-zinc-500">Aguardando turno…</p>
            )}
          </div>
          {companionRoll !== null && !companionIsRolling && (
            <div className="shrink-0 rounded-lg border border-violet-500/30 bg-violet-900/50 px-3 py-1.5 text-center">
              <p className="text-[10px] uppercase tracking-widest text-violet-400">D20</p>
              <p className="text-lg font-black text-violet-200 font-mono">{companionRoll}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Unidades Invocadas ────────────────────────────────────────────────── */}
      {summonedUnits.length > 0 && (
        <div className="mt-4 rounded-xl border border-rose-700/50 bg-zinc-900/70 p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-rose-400">
            ⚠️ Unidades Invocadas
          </p>
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {summonedUnits.map((unit) => (
              <div
                key={unit.id}
                className="rounded-lg border border-zinc-700/60 bg-zinc-800/80 p-2.5"
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-semibold text-rose-300">{unit.name}</span>
                  <span className="font-mono text-xs text-zinc-400">
                    {unit.hp}/{unit.maxHp} HP
                  </span>
                </div>
                <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-700/70">
                  <div
                    className="h-full bg-gradient-to-r from-rose-600 to-rose-800 transition-all duration-500"
                    style={{ width: `${(unit.hp / unit.maxHp) * 100}%` }}
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <motion.div
                    animate={unit.isRolling ? { rotate: [0, 360, 720] } : { rotate: 0 }}
                    transition={{ duration: 0.5 }}
                  >
                    <Dices className="h-3 w-3 text-amber-400" />
                  </motion.div>
                  <span className="font-mono text-xs text-amber-300">
                    {unit.isRolling
                      ? '…'
                      : unit.rollValue !== null
                        ? `D20: ${unit.rollValue}`
                        : '—'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {/* ── Overlay de Renascimento do Guerreiro Imortal ───────────────────────── */}
      {immortalPhase === 'reborn' && (
        <div className="pointer-events-auto fixed inset-0 z-50 overflow-hidden flex flex-col items-center justify-center">
          <div className="absolute inset-0 bg-black" />
          <div
            className="absolute inset-0 animate-defeat-shake"
            style={{
              background: 'radial-gradient(ellipse at center, hsl(0 90% 20% / 0.5) 0%, transparent 70%)',
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'conic-gradient(from 0deg, transparent 0deg, hsl(0 90% 40% / 0.15) 10deg, transparent 20deg, transparent 50deg, hsl(0 90% 30% / 0.12) 60deg, transparent 70deg)',
            }}
          />
          <div className="relative z-10 text-center space-y-8 px-6 max-w-2xl">
            <motion.div
              initial={{ scale: 0.05, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.9, type: 'spring', stiffness: 150, damping: 12 }}
            >
              {immortalRebirthCountRef.current <= 1 ? (
                <p className="font-cinzel font-black text-5xl md:text-8xl text-red-500 drop-shadow-[0_0_50px_hsl(0_90%_50%/1)] leading-tight uppercase">
                  O GUERREIRO<br />IMORTAL<br />RENASCE
                </p>
              ) : (
                <p className="font-cinzel font-black text-4xl md:text-6xl text-red-400 drop-shadow-[0_0_30px_hsl(0_80%_45%/0.9)] leading-tight uppercase">
                  Ele Renasce<br />Novamente...
                </p>
              )}
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="text-red-200/70 text-sm md:text-base tracking-widest"
            >
              {immortalRebirthCountRef.current <= 1
                ? 'A força bruta não é suficiente para derrotá-lo...'
                : 'Ele não conhece o fim. Apenas a Cabeça de Basilisco pode pará-lo.'}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.2 }}
              className="flex flex-col items-center gap-3"
            >
              {hasBasiliscoHead && (
                <button
                  type="button"
                  onClick={() => {
                    setImmortalPhase('none');
                    onImmortalTrueDefeat?.();
                  }}
                  className="w-72 rounded-xl border border-purple-400/70 bg-purple-700/60 px-6 py-3.5 font-bold text-purple-100 hover:bg-purple-600/80 transition text-base shadow-[0_0_20px_hsl(270_80%_50%/0.4)]"
                >
                  🗿 Usar Cabeça de Basilisco
                </button>
              )}
              <button
                type="button"
                onClick={handleImmortalFightAgain}
                className="w-72 rounded-xl border border-red-500/50 bg-red-800/50 px-6 py-3.5 font-bold text-red-100 hover:bg-red-700/70 transition text-base"
              >
                ⚔️ Enfrentar Novamente
              </button>
              <button
                type="button"
                onClick={() => {
                  setImmortalPhase('none');
                  if (onImmortalFlee) {
                    onImmortalFlee();
                  } else {
                    onClose?.();
                  }
                }}
                className="w-72 rounded-xl border border-zinc-600/50 bg-zinc-800/60 px-6 py-3 text-zinc-300 hover:bg-zinc-700/70 transition text-sm"
              >
                🏃 Fugir (Abandonar)
              </button>
            </motion.div>
          </div>
        </div>
      )}

      {/* ── Rancor Sombrio: Reconstitui\u00e7\u00e3o ─────────────────────────────────── */}
      {rancorPhase === 'reconstituted' && (
        <div className="pointer-events-auto fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden">
          <div className="absolute inset-0 bg-black/93" />
          <div
            className="absolute inset-0"
            style={{ background: 'radial-gradient(ellipse at center, hsl(270 80% 12% / 0.7) 0%, transparent 68%)' }}
          />
          <div className="relative z-10 text-center space-y-6 px-6 max-w-xl">
            <motion.div
              initial={{ scale: 0.05, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.85, type: 'spring', stiffness: 130, damping: 13 }}
            >
              <p className="font-cinzel font-black text-4xl md:text-6xl text-violet-400 drop-shadow-[0_0_50px_hsl(270_80%_55%/0.95)] leading-tight uppercase">
                Rancor Sombrio<br />Ressurge!
              </p>
            </motion.div>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
              className="text-rose-200/80 text-sm md:text-base leading-relaxed italic"
            >
              "Voc\u00ea me ataca com o corpo, mas sua mente ainda foge das suas falhas.<br />
              Responda \u00e0s minhas perguntas — apenas a verdade pode me destruir."
            </motion.p>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.0 }}
              className="text-violet-300 text-xs font-mono"
            >
              Rancor reconstitui com 50% HP — responda mais {Math.max(0, 2 - questionsAnswered)} pergunta(s) para a vit\u00f3ria verdadeira
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.35 }}
            >
              <button
                type="button"
                onClick={handleRancorContinueFight}
                className="rounded-xl border border-violet-500/60 bg-violet-800/60 px-8 py-3.5 font-bold text-violet-100 hover:bg-violet-700/80 transition text-base shadow-[0_0_24px_hsl(270_80%_40%/0.45)]"
              >
                ⚔️ Enfrentar meus medos
              </button>
            </motion.div>
          </div>
        </div>
      )}

      {/* ── Rancor Sombrio: Di\u00e1logo de Provoca\u00e7\u00e3o ───────────────────────────── */}
      {turn === 'rancor_challenge' && (
        <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/88 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-violet-700/60 bg-zinc-900 p-6 shadow-[0_0_70px_hsl(270_80%_25%/0.7)]">
            <div className="mb-4 text-center">
              <p className="text-xs uppercase tracking-widest text-violet-400 mb-3">☠️ Rancor Sombrio fala:</p>
              <p className="text-base font-semibold text-rose-200 italic leading-relaxed">
                "{rancorQuestion}"
              </p>
            </div>
            <p className="mb-3 text-center text-xs text-zinc-400">
              Responda com honestidade — sua determina\u00e7\u00e3o \u00e9 a \u00fanica arma contra ele.
              <br />
              <span className="text-violet-400">({questionsAnswered}/2 respostas dadas para a vit\u00f3ria verdadeira)</span>
            </p>
            <textarea
              value={rancorAnswerText}
              onChange={(e) => setRancorAnswerText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) handleRancorAnswerSubmit(); }}
              placeholder="Escreva sua resposta com sinceridade..."
              className="w-full h-28 rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 resize-none focus:outline-none focus:ring-1 focus:ring-violet-500"
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
            <button
              type="button"
              disabled={!rancorAnswerText.trim()}
              onClick={handleRancorAnswerSubmit}
              className="mt-3 w-full rounded-lg bg-violet-600 px-4 py-2.5 font-bold text-white hover:bg-violet-500 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ⚡ Comprometo-me com isso! (Ctrl+Enter)
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
                <p className={entry.actor === 'player' ? 'text-emerald-300 font-semibold' : entry.actor === 'companion' ? 'text-violet-300 font-semibold' : 'text-rose-300 font-semibold'}>
                  {entry.actor === 'player' ? 'Herói' : entry.actor === 'companion' ? (companionData?.name ?? 'Companheiro') : 'Boss'} usou {entry.skill}
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
