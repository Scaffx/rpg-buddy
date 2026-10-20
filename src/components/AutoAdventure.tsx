import { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCw, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAdvanceAutoAdventure, useAutoAdventure, type AdventureEncounter } from '@/hooks/useAutoAdventure';
import { useHeroClass, starterClassDisplayName } from '@/hooks/useHeroClass';
import { useProfile } from '@/hooks/useProfile';
import { useTranslation } from 'react-i18next';
import { AdventureScene, type AdventureSceneAction, type AdventureSceneFrame } from './adventure/AdventureScene';
import { AdventureHoldNotice } from './adventure/AdventureHoldNotice';
import { adventureBiome, adventureHeroClass } from '@/lib/adventureVisuals';

type BattleEvent = {
  at: string; actor: 'hero' | 'enemy'; kind: 'attack' | 'skill'; damage: number;
  hero_hp: number; enemy_hp: number; skill_id: string | null; skill_name: string | null;
  effect?: string | null;
};
type LiveBattle = {
  id: string; stage: number; attempt: number; kind: 'normal' | 'boss';
  status: 'fighting' | 'defeated' | 'won'; replay?: boolean; started_at: string; ends_at: string;
  hero_class?: string;
  hero_hp: number; hero_max_hp: number; enemy_hp: number; enemy_max_hp: number;
  enemy_name: string; enemy_icon: string | null; boss_id: string | null;
  events: BattleEvent[]; biome?: string | null;
};
type Catchup = { battles: number; wins: number; defeats?: number; retreats?: number; gold: number; items: string[]; defeated?: boolean; pending: boolean; from_stage?: number | null; to_stage?: number | null };
function encounterName(encounter: AdventureEncounter) {
  return encounter.kind === 'boss' ? encounter.boss_name || `Chefe da etapa ${encounter.stage}` : `Inimigo da etapa ${encounter.stage}`;
}

function visualEffect(raw?: string | null): AdventureSceneAction['effect'] {
  const effects = ['physical', 'arcane', 'fire', 'ice', 'lightning', 'nature', 'light'] as const;
  return effects.find(effect => effect === raw) ?? 'physical';
}

function useServerClock(serverNow?: string, dataUpdatedAt?: number, active = false) {
  const [, setTick] = useState(0);
  const anchor = useMemo(() => ({
    monotonic: performance.now(),
    server: serverNow ? Date.parse(serverNow) + Math.max(0, Date.now() - (dataUpdatedAt || Date.now())) : 0,
  }), [serverNow, dataUpdatedAt]);
  useEffect(() => {
    if (!serverNow || !active) return;
    const timer = window.setInterval(() => setTick(value => value + 1), 250);
    return () => window.clearInterval(timer);
  }, [serverNow, active]);
  return anchor.server + Math.max(0, performance.now() - anchor.monotonic);
}

export default function AutoAdventure() {
  const adventureQuery = useAutoAdventure({ background: true });
  const advanceMutation = useAdvanceAutoAdventure();
  const { data, dataUpdatedAt, isLoading, isFetching, error, refetch } = adventureQuery;
  const { data: profile } = useProfile();
  const { currentClassName, starterClass } = useHeroClass();
  const { t } = useTranslation();
  const [paused, setPaused] = useState(false);
  const [acceptedBattleId, setAcceptedBattleId] = useState<string | null>(null);
  const attemptedBattleId = useRef<string | null>(null);
  const advanceInFlight = useRef(false);
  const [catchupSummary, setCatchupSummary] = useState<Catchup | null>(null);
  const hasCachedSummary = 'summary' in adventureQuery;
  const cachedSummary = (adventureQuery as typeof adventureQuery & { summary?: Catchup | null }).summary;
  const acknowledgeSummary = (adventureQuery as typeof adventureQuery & { acknowledgeSummary?: () => void }).acknowledgeSummary;
  const shownSummary = hasCachedSummary ? cachedSummary : catchupSummary;
  const processedBatch = useRef<string | null>(null);
  const [stageTransition, setStageTransition] = useState(false);
  const previousStage = useRef<number | null>(null);
  const currentBattle = (data as (typeof data & { battle?: LiveBattle | null }) | undefined)?.battle;
  const lastBattle = (data as (typeof data & { last_battle?: LiveBattle | null }) | undefined)?.last_battle;
  const [displayedDefeat, setDisplayedDefeat] = useState<LiveBattle | null>(null);
  const seenDefeatId = useRef<string | null>(null);
  const defeatTimer = useRef<number | null>(null);
  const currentStage = data?.stage;
  const mode = (data as (typeof data & { mode?: 'progressing' | 'holding' }) | undefined)?.mode;
  const advanceRequested = (data as (typeof data & { advance_pending?: boolean }) | undefined)?.advance_pending;
  const catchup = (data as (typeof data & { catchup?: Catchup | null }) | undefined)?.catchup;
  useEffect(() => {
    if (!catchup || !data || hasCachedSummary) return;
    const key = `${dataUpdatedAt ?? 0}:${data.server_now}`;
    if (processedBatch.current === key) return;
    processedBatch.current = key;
    setCatchupSummary(previous => ({
      battles: (previous?.battles ?? 0) + catchup.battles,
      wins: (previous?.wins ?? 0) + catchup.wins,
      defeats: (previous?.defeats ?? 0) + (catchup.defeats ?? (catchup.defeated ? 1 : 0)),
      retreats: (previous?.retreats ?? 0) + (catchup.retreats ?? (catchup.defeated ? 1 : 0)),
      gold: (previous?.gold ?? 0) + catchup.gold,
      items: [...(previous?.items ?? []), ...catchup.items],
      defeated: Boolean(previous?.defeated || catchup.defeated || catchup.defeats || catchup.retreats),
      pending: catchup.pending,
      from_stage: previous?.from_stage ?? catchup.from_stage,
      to_stage: catchup.to_stage ?? previous?.to_stage,
    }));
  }, [catchup, data, dataUpdatedAt, hasCachedSummary]);
  useEffect(() => {
    if (currentStage == null) return;
    if (previousStage.current != null && previousStage.current !== currentStage) {
      setStageTransition(true);
      const timer = window.setTimeout(() => setStageTransition(false), 1100);
      previousStage.current = currentStage;
      return () => window.clearTimeout(timer);
    }
    previousStage.current = currentStage;
  }, [currentStage]);
  useEffect(() => {
    if (!lastBattle || lastBattle.status !== 'defeated') {
      if (defeatTimer.current !== null) window.clearTimeout(defeatTimer.current);
      defeatTimer.current = null;
      setDisplayedDefeat(null);
      return;
    }
    if (seenDefeatId.current === lastBattle.id) return;
    seenDefeatId.current = lastBattle.id;
    setDisplayedDefeat(lastBattle);
    if (defeatTimer.current !== null) window.clearTimeout(defeatTimer.current);
    defeatTimer.current = window.setTimeout(() => {
      setDisplayedDefeat(previous => previous?.id === lastBattle.id ? null : previous);
      defeatTimer.current = null;
    }, 1400);
  }, [lastBattle]);
  useEffect(() => () => { if (defeatTimer.current !== null) window.clearTimeout(defeatTimer.current); }, []);
  const serverTime = useServerClock(data?.server_now, dataUpdatedAt, currentBattle?.status === 'fighting');

  if (isLoading) return <div className="rpg-card" role="status">{t('app.autoAdventure.loading', { defaultValue: 'Preparando sua aventura...' })}</div>;
  if (error || !data) return <div className="rpg-card space-y-3 border-amber-500/40" role="alert">
    <p className="font-semibold">{t('app.autoAdventure.unavailable', { defaultValue: 'A aventura está indisponível agora.' })}</p>
    <p className="text-sm text-muted-foreground">{t(error instanceof Error && error.message === 'AUTO_ADVENTURE_INVALID_RESPONSE' ? 'app.autoAdventure.invalidResponse' : 'app.autoAdventure.retryHint', { defaultValue: error instanceof Error && error.message === 'AUTO_ADVENTURE_INVALID_RESPONSE' ? 'Os dados da aventura não puderam ser confirmados. Tente atualizar.' : 'Tente novamente em instantes.' })}</p>
    <Button variant="outline" onClick={() => void refetch()}><RotateCw className="mr-2 h-4 w-4" /> Tentar novamente</Button>
  </div>;

  const battle = displayedDefeat ?? currentBattle ?? null;
  const visibleEvents = battle?.events.filter(event => Date.parse(event.at) <= serverTime) ?? [];
  const lastEvent = visibleEvents.at(-1);
  const activeEvent = lastEvent && serverTime - Date.parse(lastEvent.at) < 1350 ? lastEvent : null;
  const isBoss = battle ? battle.kind === 'boss' : data.stage % 10 === 0;
  const stage = battle?.stage ?? data.stage;
  const holdingStage = data.stage;
  const canRequestAdvance = mode === 'holding' && currentBattle?.status === 'fighting' && currentBattle.stage === holdingStage;
  const enemyName = battle?.enemy_name || (isBoss ? data.boss?.name || `Chefe da etapa ${stage}` : `Inimigo da etapa ${stage}`);
  const heroName = profile?.display_name || 'Aventureiro';
  const heroClassName = battle?.hero_class ? starterClassDisplayName(battle.hero_class) : currentClassName || starterClassDisplayName(starterClass);
  const biome = adventureBiome(stage, battle?.biome);
  const heroClass = battle?.hero_class ? adventureHeroClass(battle.hero_class) : adventureHeroClass(starterClass, heroClassName);
  const status: AdventureSceneFrame['status'] = battle?.status === 'defeated' ? 'defeated' : battle?.status === 'won' ? 'victory' : battle ? 'fighting' : 'exploring';
  // Future events must never leak damage or HP into the current frame.
  const frame: AdventureSceneFrame = {
    status: displayedDefeat ? 'defeated' : stageTransition ? 'transition' : status,
    heroHp: battle ? lastEvent?.hero_hp ?? battle.hero_max_hp : null,
    heroMaxHp: battle?.hero_max_hp,
    enemyHp: battle ? lastEvent?.enemy_hp ?? battle.enemy_max_hp : null,
    enemyMaxHp: battle?.enemy_max_hp,
    action: activeEvent ? {
      id: `${battle!.id}-${visibleEvents.length - 1}`, actor: activeEvent.actor,
      skillName: activeEvent.kind === 'skill' ? activeEvent.skill_name : null,
      damage: activeEvent.damage, effect: visualEffect(activeEvent.effect),
    } : null,
  };
  const latest = data.encounters[0];
  const advance = async () => {
    if (!canRequestAdvance || !currentBattle || advanceRequested || acceptedBattleId === currentBattle.id || advanceInFlight.current) return;
    advanceInFlight.current = true;
    attemptedBattleId.current = currentBattle.id;
    try {
      await advanceMutation.mutateAsync({ battleId: currentBattle.id });
      setAcceptedBattleId(currentBattle.id);
    } catch { /* The mutation exposes the error; the stage stays server-owned. */ }
    finally { advanceInFlight.current = false; }
  };

  return <section className="min-w-0 space-y-4" aria-label="Aventura automática">
    {shownSummary && shownSummary.battles > 0 && <div className="rpg-card border-primary/30 text-sm" role="status">
      <strong>{shownSummary.pending ? 'Atualizando sua aventura...' : 'Resumo da aventura'}</strong>
      {shownSummary.from_stage != null && shownSummary.to_stage != null && <p>{shownSummary.from_stage === shownSummary.to_stage ? `Etapa ${shownSummary.from_stage}` : shownSummary.to_stage < shownSummary.from_stage ? `Da etapa ${shownSummary.from_stage} para a ${shownSummary.to_stage}` : `Etapas ${shownSummary.from_stage} a ${shownSummary.to_stage}`}</p>}
      <p>{shownSummary.battles} {shownSummary.battles === 1 ? 'combate' : 'combates'} · {shownSummary.wins} {shownSummary.wins === 1 ? 'vitória' : 'vitórias'} · +{shownSummary.gold} ouro · {shownSummary.items.length} {shownSummary.items.length === 1 ? 'item' : 'itens'}.</p>
      {shownSummary.defeated && <p>{shownSummary.retreats ? `${shownSummary.retreats} ${shownSummary.retreats === 1 ? 'recuo' : 'recuos'}. ` : ''}Após a derrota, seu herói recuou e continuou explorando.</p>}
      {!shownSummary.pending && acknowledgeSummary && <Button size="sm" variant="ghost" onClick={acknowledgeSummary}>Fechar resumo</Button>}
    </div>}
    <div className="rpg-card-glow min-w-0 space-y-4 border-primary/30">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Aventura automática</p>
          <h2 className="font-display text-2xl font-bold text-primary">Etapa {mode === 'holding' ? holdingStage : stage}</h2>
          <p className="text-sm text-muted-foreground">{mode === 'holding' ? 'Permanecendo' : status === 'defeated' ? 'Derrotado' : status === 'victory' ? 'Vitória' : status === 'fighting' ? 'Em combate' : 'Explorando'} · {heroClassName}</p>
          {mode !== 'holding' && status === 'victory' && data.stage > stage && <p className="text-xs text-emerald-300">Próxima etapa: {data.stage}</p>}
        </div>
        <Button size="sm" variant="outline" aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? 'Retomar animação' : 'Pausar animação'}</Button>
      </div>
      <AdventureScene stage={stage} biome={biome} heroClass={heroClass} heroName={heroName} enemyName={enemyName} isBoss={isBoss} frame={frame} paused={paused} />
      <div className="flex min-w-0 flex-wrap justify-between gap-2 text-sm">
        <span className="min-w-0 break-words">{heroName} enfrenta {enemyName}</span>
        {isBoss && <strong className="text-amber-300">Chefe da etapa {stage}</strong>}
      </div>
      {mode === 'holding' && <AdventureHoldNotice stage={holdingStage} advanceToStage={holdingStage + 1} retreatedFromStage={data.encounters.find(encounter => !encounter.won && encounter.stage === holdingStage + 1)?.stage} pending={advanceMutation.isPending} accepted={Boolean(advanceRequested || (currentBattle && acceptedBattleId === currentBattle.id))} canAdvance={canRequestAdvance} error={advanceMutation.isError && attemptedBattleId.current === currentBattle?.id} onAdvance={() => void advance()} />}
      <p className="text-xs text-muted-foreground">{mode === 'holding' ? 'Seu herói continua explorando esta etapa.' : 'O herói avança sozinho.'} Combates podem dar ouro e itens; rotinas concluídas dão XP e atributos. Recompensas são periódicas e têm limites diários.</p>
    </div>
    <div className="grid min-w-0 gap-3 sm:grid-cols-3">
      <div className="rpg-card min-w-0"><p className="text-xs text-muted-foreground">Ouro da aventura hoje</p><p className="text-xl font-bold text-amber-300">{data.gold_today} / {data.limits.gold_per_day}</p></div>
      <div className="rpg-card min-w-0"><p className="text-xs text-muted-foreground">Itens da aventura hoje</p><p className="text-xl font-bold">{data.loot_today} / {data.limits.items_per_day}</p></div>
      <div className="rpg-card min-w-0"><p className="text-xs text-muted-foreground">Último resultado</p><p className="text-sm font-semibold">{latest ? latest.won ? 'Vitória' : 'Derrota sem perda' : 'Aguardando'}</p></div>
    </div>
    <div className="rpg-card min-w-0 space-y-3">
      <div className="flex items-center justify-between gap-2"><h3 className="flex items-center gap-2 font-display font-bold"><Trophy className="h-4 w-4" /> Confrontos recentes</h3><Button size="sm" variant="ghost" disabled={isFetching} onClick={() => void refetch()} aria-label="Atualizar aventura"><RotateCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /></Button></div>
      {data.encounters.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum confronto ainda.</p> : <ol className="space-y-2">{data.encounters.map(encounter => <li key={`${encounter.stage}-${encounter.attempt}`} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-sm"><span className="min-w-0 break-words">{encounterName(encounter)}</span><span className={encounter.won ? 'text-emerald-300' : 'text-amber-300'}>{encounter.won ? `Vitória · ${encounter.gold > 0 ? `+${encounter.gold} ouro` : 'sem ouro nesta luta'}${encounter.item_id ? ' · item no inventário' : ''}` : 'Derrota · sem perda'}</span></li>)}</ol>}
    </div>
  </section>;
}
