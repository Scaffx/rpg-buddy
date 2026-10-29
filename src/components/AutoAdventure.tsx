import { useEffect, useRef, useState } from 'react';
import { RotateCw, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAdvanceAutoAdventure, useAutoAdventure, type AdventureBattle, type AdventureEncounter } from '@/hooks/useAutoAdventure';
import { useHeroClass, starterClassDisplayName } from '@/hooks/useHeroClass';
import { useProfile } from '@/hooks/useProfile';
import { useTranslation } from 'react-i18next';
import { AdventureScene, type AdventureSceneFrame } from './adventure/AdventureScene';
import { AdventureHoldNotice } from './adventure/AdventureHoldNotice';
import { adventureBiome, adventureHeroClass } from '@/lib/adventureVisuals';
import { useActivePet } from '@/hooks/useActivePet';
import { AdventurePetPanel } from './AdventurePetPanel';
import { AdventureAutoPotionsPanel } from './adventure/AdventureAutoPotionsPanel';
import { autoPotionsErrorMessage, autoPotionsUnavailable, useAdventureAutoPotions } from '@/hooks/useAdventureAutoPotions';
import { projectAdventureSceneFrame } from '@/lib/adventureSceneProjector';
import { adventureServerTime } from '@/lib/adventureClock';
import type { AdventureSnapshot } from '@/lib/autoAdventurePayload';

type Catchup = { battles: number; wins: number; draws?: number; defeats?: number; retreats?: number; gold: number; items: string[]; defeated?: boolean; pending: boolean; from_stage?: number | null; to_stage?: number | null };
function isDraw(encounter: { status?: string; end_reason?: string | null }) {
  return encounter.status === 'draw' || encounter.end_reason === 'turn_limit' || encounter.end_reason === 'event_limit';
}
function encounterResult(encounter: AdventureEncounter & { status?: string; end_reason?: string | null }) {
  return isDraw(encounter) ? 'Sem vencedor · nova tentativa nesta etapa' : encounter.won ? 'Vitória' : 'Derrota sem perda';
}
function encounterName(encounter: AdventureEncounter) {
  return encounter.kind === 'boss' ? encounter.boss_name || `Chefe da etapa ${encounter.stage}` : `Inimigo da etapa ${encounter.stage}`;
}

const seenDefeats = new Map<string, string[]>();
function claimDefeat(accountId: string | null | undefined, battleId: string): boolean {
  const key = accountId ?? '';
  const recent = seenDefeats.get(key) ?? [];
  if (recent.includes(battleId)) return false;
  seenDefeats.set(key, [...recent.slice(-31), battleId]);
  return true;
}

function useServerClock(snapshot?: AdventureSnapshot, active = false) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!snapshot || !active) return;
    const timer = window.setInterval(() => setTick(value => value + 1), 250);
    return () => window.clearInterval(timer);
  }, [snapshot, active]);
  return adventureServerTime(snapshot);
}

export default function AutoAdventure() {
  const adventureQuery = useAutoAdventure({ background: true });
  const adventurePet = useActivePet();
  const autoPotions = useAdventureAutoPotions();
  const advanceMutation = useAdvanceAutoAdventure();
  const { data, dataUpdatedAt, isLoading, isFetching, error, refetch } = adventureQuery;
  const accountId = adventureQuery.accountId;
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
  const processedBatch = useRef<string | null>(null);
  const [stageTransition, setStageTransition] = useState(false);
  const previousStage = useRef<number | null>(null);
  const currentBattle = data?.battle;
  const lastBattle = data?.last_battle;
  const [displayedDefeatState, setDisplayedDefeat] = useState<{ accountId: string | null | undefined; battle: AdventureBattle } | null>(null);
  const accountScope = useRef(accountId);
  const accountSwitched = accountScope.current !== accountId;
  const displayedDefeat = !accountSwitched && displayedDefeatState && displayedDefeatState.accountId === accountId ? displayedDefeatState.battle : null;
  const shownSummary = hasCachedSummary ? cachedSummary : accountSwitched ? null : catchupSummary;
  const seenDefeatId = useRef<string | null>(null);
  const defeatTimer = useRef<number | null>(null);
  const currentStage = data?.stage;
  const mode = (data as (typeof data & { mode?: 'progressing' | 'holding' }) | undefined)?.mode;
  const advanceRequested = (data as (typeof data & { advance_pending?: boolean }) | undefined)?.advance_pending;
  const catchup = (data as (typeof data & { catchup?: Catchup | null }) | undefined)?.catchup;
  const serverTime = useServerClock(data, currentBattle?.status === 'fighting');
  useEffect(() => {
    if (accountScope.current === accountId) return;
    accountScope.current = accountId;
    seenDefeatId.current = null;
    previousStage.current = null;
    processedBatch.current = null;
    attemptedBattleId.current = null;
    advanceInFlight.current = false;
    setDisplayedDefeat(null);
    setCatchupSummary(null);
    setAcceptedBattleId(null);
    setStageTransition(false);
  }, [accountId]);
  useEffect(() => {
    if (!catchup || !data || hasCachedSummary) return;
    const key = `${dataUpdatedAt ?? 0}:${data.server_now}`;
    if (processedBatch.current === key) return;
    processedBatch.current = key;
    setCatchupSummary(previous => {
      if (!previous?.pending && !catchup.pending && catchup.battles <= 1) return previous;
      return {
      battles: (previous?.battles ?? 0) + catchup.battles,
      wins: (previous?.wins ?? 0) + catchup.wins,
      draws: (previous?.draws ?? 0) + (catchup.draws ?? 0),
      defeats: (previous?.defeats ?? 0) + (catchup.defeats ?? (catchup.defeated ? 1 : 0)),
      retreats: (previous?.retreats ?? 0) + (catchup.retreats ?? (catchup.defeated ? 1 : 0)),
      gold: (previous?.gold ?? 0) + catchup.gold,
      items: [...(previous?.items ?? []), ...catchup.items],
      defeated: Boolean(previous?.defeated || catchup.defeated || catchup.defeats || catchup.retreats),
      pending: catchup.pending,
      from_stage: previous?.from_stage ?? catchup.from_stage,
      to_stage: catchup.to_stage ?? previous?.to_stage,
      };
    });
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
    const lastEndedAt = Date.parse(lastBattle?.ends_at ?? '');
    const observedAt = serverTime;
    const recentHordeResult = lastBattle?.engine_version !== 'v4_horde' ||
      (Number.isFinite(lastEndedAt) && Number.isFinite(observedAt) &&
        observedAt >= lastEndedAt && observedAt - lastEndedAt <= 2_000);
    if (!lastBattle || (lastBattle.status !== 'defeated' && lastBattle.status !== 'draw') ||
      (lastBattle.engine_version === 'v4_horde' && (catchup?.pending || !recentHordeResult))) {
      if (defeatTimer.current !== null) window.clearTimeout(defeatTimer.current);
      defeatTimer.current = null;
      setDisplayedDefeat(null);
      return;
    }
    if (seenDefeatId.current === lastBattle.id || !claimDefeat(accountId, lastBattle.id)) return;
    seenDefeatId.current = lastBattle.id;
    setDisplayedDefeat({ accountId, battle: lastBattle });
    if (defeatTimer.current !== null) window.clearTimeout(defeatTimer.current);
    defeatTimer.current = window.setTimeout(() => {
      setDisplayedDefeat(previous => previous?.battle.id === lastBattle.id && previous.accountId === accountId ? null : previous);
      defeatTimer.current = null;
    }, 1400);
  }, [lastBattle, accountId, catchup?.pending, serverTime]);
  useEffect(() => () => { if (defeatTimer.current !== null) window.clearTimeout(defeatTimer.current); }, []);

  if (isLoading) return <div className="rpg-card" role="status">{t('app.autoAdventure.loading', { defaultValue: 'Preparando sua aventura...' })}</div>;
  if (error || !data) return <div className="rpg-card space-y-3 border-amber-500/40" role="alert">
    <p className="font-semibold">{t('app.autoAdventure.unavailable', { defaultValue: 'A aventura está indisponível agora.' })}</p>
    <p className="text-sm text-muted-foreground">{t(error instanceof Error && error.message === 'AUTO_ADVENTURE_INVALID_RESPONSE' ? 'app.autoAdventure.invalidResponse' : 'app.autoAdventure.retryHint', { defaultValue: error instanceof Error && error.message === 'AUTO_ADVENTURE_INVALID_RESPONSE' ? 'Os dados da aventura não puderam ser confirmados. Tente atualizar.' : 'Tente novamente em instantes.' })}</p>
    <Button variant="outline" onClick={() => void refetch()}><RotateCw className="mr-2 h-4 w-4" /> Tentar novamente</Button>
  </div>;

  const liveDuringCatchup = Boolean(currentBattle?.status === 'fighting' &&
    Date.parse(currentBattle.started_at) <= serverTime && Date.parse(currentBattle.ends_at) > serverTime);
  const recovering = Boolean(catchup?.pending && !liveDuringCatchup);
  const battle = recovering ? null : catchup?.pending ? currentBattle : displayedDefeat ?? currentBattle ?? null;
  const isBoss = battle ? battle.kind === 'boss' : data.stage % 10 === 0;
  const stage = battle?.stage ?? data.stage;
  const holdingStage = data.stage;
  const canRequestAdvance = mode === 'holding' && !data.catchup?.pending &&
    currentBattle?.status === 'fighting' && currentBattle.stage === holdingStage &&
    Date.parse(currentBattle.started_at) <= serverTime && Date.parse(currentBattle.ends_at) > serverTime;
  const enemyName = battle?.enemy_name || (isBoss ? data.boss?.name || `Chefe da etapa ${stage}` : `Inimigo da etapa ${stage}`);
  const heroName = profile?.display_name || 'Aventureiro';
  const heroClassName = battle?.hero_class ? starterClassDisplayName(battle.hero_class) : currentClassName || starterClassDisplayName(starterClass);
  const biome = adventureBiome(stage, battle?.biome);
  const heroClass = battle?.hero_class ? adventureHeroClass(battle.hero_class) : adventureHeroClass(starterClass, heroClassName);
  const futureResult = battle && battle.status !== 'fighting' && Date.parse(battle.ends_at) > serverTime;
  const status: AdventureSceneFrame['status'] = futureResult ? 'fighting' : battle?.status === 'draw' ? 'draw' : battle?.status === 'defeated' ? 'defeated' : battle?.status === 'won' ? 'victory' : battle ? 'fighting' : 'exploring';
  const frame = projectAdventureSceneFrame(battle, serverTime,
    displayedDefeat && battle === displayedDefeat ? displayedDefeat.status === 'draw' ? 'draw' : 'defeated' : stageTransition ? 'transition' : status);
  const latest = data.encounters[0];
  const advance = async () => {
    if (!canRequestAdvance || !currentBattle || advanceRequested || acceptedBattleId === currentBattle.id || advanceInFlight.current) return;
    const requestAccountId = accountId;
    advanceInFlight.current = true;
    attemptedBattleId.current = currentBattle.id;
    try {
      await advanceMutation.mutateAsync({ battleId: currentBattle.id });
      if (accountScope.current === requestAccountId) setAcceptedBattleId(currentBattle.id);
    } catch { /* The mutation exposes the error; the stage stays server-owned. */ }
    finally { advanceInFlight.current = false; }
  };

  return <section className="min-w-0 space-y-4" aria-label="Aventura automática">
    <div className="rpg-card-glow min-w-0 space-y-4 border-primary/30">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Aventura automática</p>
          <h2 className="font-display text-2xl font-bold text-primary">Etapa {mode === 'holding' ? holdingStage : stage}</h2>
          <p className="text-sm text-muted-foreground">{mode === 'holding' ? 'Permanecendo' : status === 'draw' ? 'Sem vencedor' : status === 'defeated' ? 'Derrotado' : status === 'victory' ? 'Vitória' : status === 'fighting' ? 'Em combate' : 'Explorando'} · {heroClassName}</p>
          {mode !== 'holding' && status === 'victory' && data.stage > stage && <p className="text-xs text-emerald-300">Próxima etapa: {data.stage}</p>}
        </div>
        <Button size="sm" variant="outline" disabled={recovering} aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? 'Retomar animação' : 'Pausar animação'}</Button>
      </div>
      {recovering ? <div className="rounded-xl border border-primary/30 bg-card/50 p-6 text-sm" role="status">
        <p className="font-semibold">Sincronizando suas lutas anteriores</p>
        <p className="mt-2 text-muted-foreground">A cena ao vivo retorna quando a recuperação terminar.</p>
        <p className="mt-2 text-muted-foreground">{catchup?.battles ?? 0} combates recuperados nesta atualização.</p>
      </div> : <AdventureScene stage={stage} biome={biome} heroClass={heroClass} heroName={heroName} enemyName={enemyName} isBoss={isBoss} bossId={battle?.boss_id} frame={frame} paused={paused} />}
      {!recovering && <div className="flex min-w-0 flex-wrap justify-between gap-2 text-sm">
        <span className="min-w-0 break-words">{heroName} enfrenta {frame.enemies?.map(enemy => enemy.name).join(', ') || enemyName}</span>
        {isBoss && <strong className="text-amber-300">Chefe da etapa {stage}</strong>}
      </div>}
      {!recovering && <AdventurePetPanel battlePet={battle?.pet} selection={adventurePet.state} selectionLoading={adventurePet.isLoading} selectionError={Boolean(adventurePet.error)} />}
      <AdventureAutoPotionsPanel state={autoPotions.state} battleId={battle?.id} loading={autoPotions.isLoading}
        unavailable={autoPotionsUnavailable(autoPotions.error)}
        error={autoPotions.setError ? autoPotionsErrorMessage(autoPotions.setError) : autoPotions.error && !autoPotionsUnavailable(autoPotions.error) ? autoPotionsErrorMessage(autoPotions.error) : null}
        setting={autoPotions.isSetting} onToggle={enabled => { void autoPotions.setEnabled(enabled).catch(() => {}); }}
        onRetry={() => { void autoPotions.refetch(); }} />
      {mode === 'holding' && <AdventureHoldNotice stage={holdingStage} advanceToStage={holdingStage + 1} retreatedFromStage={data.encounters.find(encounter => !encounter.won && !isDraw(encounter) && encounter.stage === holdingStage + 1)?.stage} pending={advanceMutation.isPending} accepted={Boolean(advanceRequested || (currentBattle && acceptedBattleId === currentBattle.id))} canAdvance={canRequestAdvance} error={advanceMutation.isError && attemptedBattleId.current === currentBattle?.id} onAdvance={() => void advance()} />}
      <p className="text-xs text-muted-foreground">{mode === 'holding' ? 'Seu herói continua explorando esta etapa.' : 'O herói avança sozinho.'} Alterações em equipamentos e habilidades passam a valer na próxima luta iniciada. Cada vitória dá ouro; itens diretos seguem um intervalo e limite diário. Rotinas concluídas dão XP e atributos.</p>
    </div>
    {shownSummary && shownSummary.battles > 0 && <div className="rpg-card border-primary/30 text-sm" role="status">
      <strong>{shownSummary.pending ? 'Recuperando o período em que você esteve fora...' : 'Resumo do período ausente'}</strong>
      {shownSummary.from_stage != null && shownSummary.to_stage != null && <p>{shownSummary.from_stage === shownSummary.to_stage ? `Etapa ${shownSummary.from_stage}` : shownSummary.to_stage < shownSummary.from_stage ? `Da etapa ${shownSummary.from_stage} para a ${shownSummary.to_stage}` : `Etapas ${shownSummary.from_stage} a ${shownSummary.to_stage}`}</p>}
      <p>{shownSummary.battles} {shownSummary.battles === 1 ? 'combate' : 'combates'} · {shownSummary.wins} {shownSummary.wins === 1 ? 'vitória' : 'vitórias'} · +{shownSummary.gold} ouro · {shownSummary.items.length} {shownSummary.items.length === 1 ? 'item' : 'itens'}.</p>
      <p className="text-muted-foreground">Este total reúne lutas recuperadas. Cada linha em confrontos recentes representa uma luta.</p>
      {shownSummary.defeated && <p>{shownSummary.retreats ? `${shownSummary.retreats} ${shownSummary.retreats === 1 ? 'recuo' : 'recuos'}. Após a derrota, seu herói recuou e continuou explorando.` : 'Após a derrota, seu herói permaneceu na etapa escolhida.'}</p>}
      {(shownSummary.draws ?? 0) > 0 && <p>{shownSummary.draws} {shownSummary.draws === 1 ? 'luta sem vencedor' : 'lutas sem vencedor'}. O herói tenta novamente na mesma etapa, sem prêmio por essas lutas.</p>}
      {!shownSummary.pending && acknowledgeSummary && <Button size="sm" variant="ghost" onClick={acknowledgeSummary}>Fechar resumo</Button>}
    </div>}
    <div className="grid min-w-0 gap-3 sm:grid-cols-3">
      <div className="rpg-card min-w-0"><p className="text-xs text-muted-foreground">Ouro da aventura hoje</p><p className="text-xl font-bold text-amber-300">{data.gold_today}</p><p className="text-xs text-muted-foreground">Sem teto diário de ouro</p></div>
      <div className="rpg-card min-w-0"><p className="text-xs text-muted-foreground">Itens da aventura hoje</p><p className="text-xl font-bold">{data.loot_today} / {data.limits.items_per_day}</p></div>
      <div className="rpg-card min-w-0"><p className="text-xs text-muted-foreground">Último resultado</p><p className="text-sm font-semibold">{latest ? encounterResult(latest) : 'Aguardando'}</p></div>
    </div>
    <div className="rpg-card min-w-0 space-y-3">
      <div className="flex items-center justify-between gap-2"><h3 className="flex items-center gap-2 font-display font-bold"><Trophy className="h-4 w-4" /> Confrontos recentes</h3><Button size="sm" variant="ghost" disabled={isFetching} onClick={() => void refetch()} aria-label="Atualizar aventura"><RotateCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /></Button></div>
      {data.encounters.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum confronto ainda.</p> : <ol className="space-y-2">{data.encounters.map(encounter => <li key={`${encounter.stage}-${encounter.attempt}`} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-sm"><span className="min-w-0 break-words">{encounterName(encounter)}</span><span className={encounter.won ? 'text-emerald-300' : 'text-amber-300'}>{isDraw(encounter) ? encounterResult(encounter) : encounter.won ? `Vitória · ${encounter.gold > 0 ? `+${encounter.gold} ouro` : 'sem ouro nesta luta'}${encounter.item_id ? ' · item no inventário' : ''}` : 'Derrota · sem perda'}</span></li>)}</ol>}
    </div>
  </section>;
}
