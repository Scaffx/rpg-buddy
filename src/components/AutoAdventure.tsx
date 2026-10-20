import { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCw, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAutoAdventure, type AdventureEncounter } from '@/hooks/useAutoAdventure';
import { useHeroClass, starterClassDisplayName } from '@/hooks/useHeroClass';
import { useProfile } from '@/hooks/useProfile';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from 'react-i18next';
import { AdventureScene, type AdventureSceneAction, type AdventureSceneFrame } from './adventure/AdventureScene';
import { adventureBiome, adventureHeroClass } from '@/lib/adventureVisuals';

type BattleEvent = {
  at: string; actor: 'hero' | 'enemy'; kind: 'attack' | 'skill'; damage: number;
  hero_hp: number; enemy_hp: number; skill_id: string | null; skill_name: string | null;
  effect?: string | null;
};
type LiveBattle = {
  id: string; stage: number; attempt: number; kind: 'normal' | 'boss';
  status: 'fighting' | 'defeated' | 'won'; replay?: boolean; started_at: string; ends_at: string;
  hero_hp: number; hero_max_hp: number; enemy_hp: number; enemy_max_hp: number;
  enemy_name: string; enemy_icon: string | null; boss_id: string | null;
  events: BattleEvent[]; biome?: string | null;
};
type Catchup = { battles: number; wins: number; gold: number; items: string[]; defeated: boolean; pending: boolean; from_stage?: number | null; to_stage?: number | null };
type ChoiceRpcClient = {
  rpc: (name: 'choose_auto_adventure', args: { p_battle_id: string; p_choice: 'retry' | 'previous' }) => Promise<{ error: { message: string } | null }>;
};

function encounterName(encounter: AdventureEncounter) {
  return encounter.kind === 'boss' ? encounter.boss_name || `Chefe da etapa ${encounter.stage}` : `Inimigo da etapa ${encounter.stage}`;
}

function visualEffect(raw?: string | null): AdventureSceneAction['effect'] {
  const effects: Record<string, Exclude<AdventureSceneAction['effect'], null | undefined>> = {
    neutro: 'physical', physical: 'physical', arcano: 'arcane', arcane: 'arcane',
    fogo: 'fire', fire: 'fire', gelo: 'ice', ice: 'ice', raio: 'lightning', lightning: 'lightning',
    natureza: 'nature', nature: 'nature', sagrado: 'light', light: 'light',
    agua: 'water', water: 'water', sombra: 'shadow', shadow: 'shadow',
  };
  return effects[raw?.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') ?? ''] ?? 'physical';
}

function useServerClock(serverNow?: string, dataUpdatedAt?: number) {
  const [, setTick] = useState(0);
  const anchor = useMemo(() => ({
    monotonic: performance.now(),
    server: serverNow ? Date.parse(serverNow) + Math.max(0, Date.now() - (dataUpdatedAt || Date.now())) : 0,
  }), [serverNow, dataUpdatedAt]);
  useEffect(() => {
    if (!serverNow) return;
    const timer = window.setInterval(() => setTick(value => value + 1), 250);
    return () => window.clearInterval(timer);
  }, [serverNow]);
  return anchor.server + Math.max(0, performance.now() - anchor.monotonic);
}

export default function AutoAdventure() {
  const { data, dataUpdatedAt, isLoading, isFetching, error, refetch } = useAutoAdventure({ background: true });
  const { data: profile } = useProfile();
  const { currentClassName, starterClass } = useHeroClass();
  const { t } = useTranslation();
  const [paused, setPaused] = useState(false);
  const [choiceError, setChoiceError] = useState(false);
  const [choicePending, setChoicePending] = useState(false);
  const [catchupSummary, setCatchupSummary] = useState<Catchup | null>(null);
  const processedBatch = useRef<string | null>(null);
  const [stageTransition, setStageTransition] = useState(false);
  const previousStage = useRef<number | null>(null);
  const currentBattle = (data as (typeof data & { battle?: LiveBattle | null }) | undefined)?.battle;
  const currentStage = currentBattle?.stage ?? data?.stage;
  const catchup = (data as (typeof data & { catchup?: Catchup | null }) | undefined)?.catchup;
  useEffect(() => {
    if (!catchup || !data) return;
    const key = `${dataUpdatedAt ?? 0}:${data.server_now}`;
    if (processedBatch.current === key) return;
    processedBatch.current = key;
    setCatchupSummary(previous => ({
      battles: (previous?.battles ?? 0) + catchup.battles,
      wins: (previous?.wins ?? 0) + catchup.wins,
      gold: (previous?.gold ?? 0) + catchup.gold,
      items: [...(previous?.items ?? []), ...catchup.items],
      defeated: Boolean(previous?.defeated || catchup.defeated),
      pending: catchup.pending,
      from_stage: previous?.from_stage ?? catchup.from_stage,
      to_stage: catchup.to_stage ?? previous?.to_stage,
    }));
  }, [catchup, data, dataUpdatedAt]);
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
  const serverTime = useServerClock(data?.server_now, dataUpdatedAt);

  if (isLoading) return <div className="rpg-card" role="status">{t('app.autoAdventure.loading', { defaultValue: 'Preparando sua aventura...' })}</div>;
  if (error || !data) return <div className="rpg-card space-y-3 border-amber-500/40" role="alert">
    <p className="font-semibold">{t('app.autoAdventure.unavailable', { defaultValue: 'A aventura está indisponível agora.' })}</p>
    <p className="text-sm text-muted-foreground">{t(error instanceof Error && error.message === 'AUTO_ADVENTURE_INVALID_RESPONSE' ? 'app.autoAdventure.invalidResponse' : 'app.autoAdventure.retryHint', { defaultValue: error instanceof Error && error.message === 'AUTO_ADVENTURE_INVALID_RESPONSE' ? 'Os dados da aventura não puderam ser confirmados. Tente atualizar.' : 'Tente novamente em instantes.' })}</p>
    <Button variant="outline" onClick={() => void refetch()}><RotateCw className="mr-2 h-4 w-4" /> Tentar novamente</Button>
  </div>;

  const battle = currentBattle ?? null;
  const visibleEvents = battle?.events.filter(event => Date.parse(event.at) <= serverTime) ?? [];
  const lastEvent = visibleEvents.at(-1);
  const activeEvent = lastEvent && serverTime - Date.parse(lastEvent.at) < 1350 ? lastEvent : null;
  const isBoss = battle ? battle.kind === 'boss' : data.stage % 10 === 0;
  const stage = battle?.stage ?? data.stage;
  const enemyName = battle?.enemy_name || (isBoss ? data.boss?.name || `Chefe da etapa ${stage}` : `Inimigo da etapa ${stage}`);
  const heroName = profile?.display_name || 'Aventureiro';
  const heroClassName = currentClassName || starterClassDisplayName(starterClass);
  const biome = adventureBiome(stage, battle?.biome);
  const heroClass = adventureHeroClass(starterClass, heroClassName);
  const status: AdventureSceneFrame['status'] = battle?.status === 'defeated' ? 'defeated' : battle?.status === 'won' ? 'victory' : battle ? 'fighting' : 'exploring';
  // Future events must never leak damage or HP into the current frame.
  const frame: AdventureSceneFrame = {
    status: stageTransition ? 'transition' : status,
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
  const choose = async (action: 'retry' | 'previous') => {
    if (!battle || battle.status !== 'defeated' || choicePending || (action === 'previous' && battle.stage <= 1)) return;
    setChoicePending(true);
    setChoiceError(false);
    try {
      const { error: mutationError } = await (supabase as unknown as ChoiceRpcClient).rpc('choose_auto_adventure', { p_battle_id: battle.id, p_choice: action });
      if (mutationError) throw mutationError;
      await refetch();
    } catch { setChoiceError(true); }
    finally { setChoicePending(false); }
  };

  return <section className="min-w-0 space-y-4" aria-label="Aventura automática">
    {catchupSummary && catchupSummary.battles > 0 && <div className="rpg-card border-primary/30 text-sm" role="status">
      <strong>{catchupSummary.pending ? 'Atualizando sua aventura...' : 'Enquanto você esteve fora'}</strong>
      {catchupSummary.from_stage != null && catchupSummary.to_stage != null && <p>{catchupSummary.from_stage === catchupSummary.to_stage ? `Etapa ${catchupSummary.from_stage}` : `Etapas ${catchupSummary.from_stage} a ${catchupSummary.to_stage}`}</p>}
      <p>{catchupSummary.battles} {catchupSummary.battles === 1 ? 'combate' : 'combates'} · {catchupSummary.wins} {catchupSummary.wins === 1 ? 'vitória' : 'vitórias'} · +{catchupSummary.gold} ouro · {catchupSummary.items.length} {catchupSummary.items.length === 1 ? 'item' : 'itens'}.</p>
      {catchupSummary.defeated && <p>Seu herói foi derrotado e aguarda sua escolha.</p>}
    </div>}
    <div className="rpg-card-glow min-w-0 space-y-4 border-primary/30">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Aventura automática</p>
          <h2 className="font-display text-2xl font-bold text-primary">Etapa {stage}</h2>
          <p className="text-sm text-muted-foreground">{status === 'defeated' ? 'Derrotado' : status === 'victory' ? 'Vitória' : status === 'fighting' ? 'Em combate' : 'Explorando'} · {heroClassName}</p>
          {status === 'victory' && data.stage > stage && <p className="text-xs text-emerald-300">Próxima etapa: {data.stage}</p>}
          {battle?.replay && <p className="text-xs text-amber-200">Etapa repetida · sem novas recompensas</p>}
        </div>
        <Button size="sm" variant="outline" aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? 'Retomar animação' : 'Pausar animação'}</Button>
      </div>
      <AdventureScene stage={stage} biome={biome} heroClass={heroClass} heroName={heroName} enemyName={enemyName} isBoss={isBoss} frame={frame} paused={paused} />
      <div className="flex min-w-0 flex-wrap justify-between gap-2 text-sm">
        <span className="min-w-0 break-words">{heroName} enfrenta {enemyName}</span>
        {isBoss && <strong className="text-amber-300">Chefe da etapa {stage}</strong>}
      </div>
      {status === 'defeated' && <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
        <p className="font-semibold">Seu herói foi derrotado. Escolha como continuar.</p>
        <div className="flex flex-wrap gap-2"><Button disabled={choicePending} onClick={() => void choose('retry')}>Tentar de novo</Button><Button variant="outline" disabled={choicePending || stage <= 1} onClick={() => void choose('previous')}>Voltar uma etapa</Button></div>
        {stage <= 1 && <p className="text-xs text-muted-foreground">Você já está na primeira etapa.</p>}
        {choiceError && <p role="alert" className="text-sm text-amber-200">Não foi possível continuar. Tente novamente.</p>}
      </div>}
      <p className="text-xs text-muted-foreground">O herói avança sozinho. Combates podem dar ouro e itens; rotinas concluídas dão XP e atributos. Recompensas são periódicas e têm limites diários.</p>
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
