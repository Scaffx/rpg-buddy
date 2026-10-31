import { useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { adventureJourneyError, useAdventureJourney } from '@/hooks/useAdventureJourney';
import { JOURNEY_REALMS, journeyNarrative, journeyPosition, type JourneyChoice } from '@/lib/adventureJourney';

export function AdventureJourneyPanel({ stage }: { stage: number }) {
  const [selectedCycle, setSelectedCycle] = useState<number | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<number | null>(null);
  const journey = useAdventureJourney(stage, selectedCycle);
  const requestScope = useRef(journey.scope);
  requestScope.current = journey.scope;
  useEffect(() => { setSelectedCycle(null); setSelectedChapter(null); }, [journey.scope]);

  if (journey.isLoading) return <section className="rpg-card border-primary/20" aria-label="Jornada dos cinco reinos">
    <p className="text-xs uppercase tracking-widest text-muted-foreground">Jornada dos cinco reinos</p>
    <p className="mt-2 text-sm" role="status">Abrindo o diário da etapa {stage}...</p>
  </section>;

  if (!journey.data) return <section className="rpg-card border-primary/20" aria-label="Jornada dos cinco reinos">
    <p className="text-xs uppercase tracking-widest text-muted-foreground">Jornada dos cinco reinos</p>
    <p className="mt-2 text-sm" role="alert">{adventureJourneyError(journey.error)}</p>
    <Button size="sm" variant="outline" className="mt-3" onClick={() => void journey.refetch()}>
      <RotateCw className="mr-2 h-4 w-4" aria-hidden="true" />Tentar novamente
    </Button>
  </section>;

  const { cycle, chapter, view_cycle: viewCycle, choices, stage: confirmedStage } = journey.data;
  if (Number.isSafeInteger(stage) && stage !== confirmedStage) return <section className="rpg-card border-primary/20" aria-label="Jornada dos cinco reinos">
    <p className="text-xs uppercase tracking-widest text-muted-foreground">Jornada dos cinco reinos</p>
    <p className="mt-2 text-sm" role="status">Atualizando a jornada após a mudança de etapa...</p>
  </section>;
  const position = journeyPosition(confirmedStage);
  const lastReachedChapter = viewCycle === cycle ? chapter : 5;
  const visibleChapter = selectedChapter != null && selectedChapter <= lastReachedChapter ? selectedChapter : lastReachedChapter;
  const realm = JOURNEY_REALMS[visibleChapter - 1];
  const milestone = (viewCycle - 1) * 50 + (visibleChapter - 1) * 10 + 5;
  const saved = choices.find(row => row.chapter === visibleChapter);
  const available = confirmedStage >= milestone;
  const savingHere = journey.save.variables?.scope === journey.scope &&
    journey.save.variables.cycle === viewCycle && journey.save.variables.chapter === visibleChapter;
  const saveError = savingHere && journey.save.isError ? adventureJourneyError(journey.save.error) : null;

  const choose = async (choice: JourneyChoice) => {
    const scopeAtClick = journey.scope;
    try {
      await journey.saveChoice(viewCycle, visibleChapter, choice);
    } catch {
      // The mutation exposes the error. Never display an unconfirmed choice.
      if (requestScope.current !== scopeAtClick) return;
    }
  };

  return <section className={`rpg-card min-w-0 space-y-3 ${realm.border}`} aria-label="Jornada dos cinco reinos">
    <div className="flex min-w-0 items-start gap-3">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-current/20 bg-card/60 text-xl ${realm.accent}`} aria-hidden="true">{realm.symbol}</span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1 text-xs uppercase tracking-widest text-muted-foreground"><BookOpen className="h-3.5 w-3.5" aria-hidden="true" /> Jornada · ciclo {viewCycle}{viewCycle !== cycle ? ` de ${cycle}` : ''}</p>
        <h2 className={`font-display text-lg font-bold ${realm.accent}`}>{realm.name}</h2>
        <p className="text-xs text-muted-foreground">Capítulo {visibleChapter} de 5 · etapa {confirmedStage} confirmada</p>
      </div>
    </div>

    <div className="flex flex-wrap items-end gap-2 text-xs">
      {cycle > 1 && <div className="flex items-center gap-1" aria-label="Navegar pelos ciclos">
        <Button type="button" size="sm" variant="ghost" disabled={viewCycle <= 1}
          onClick={() => { setSelectedCycle(viewCycle - 1); setSelectedChapter(null); }}>Ciclo anterior</Button>
        <Button type="button" size="sm" variant="ghost" disabled={viewCycle >= cycle}
          onClick={() => { setSelectedCycle(viewCycle + 1); setSelectedChapter(null); }}>Próximo ciclo</Button>
      </div>}
      <label className="flex items-center gap-2 text-muted-foreground">Reino
        <select className="min-h-9 rounded-md border border-border bg-background px-2 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          value={visibleChapter} onChange={event => setSelectedChapter(Number(event.target.value))}>
          {JOURNEY_REALMS.slice(0, lastReachedChapter).map((item, index) =>
            <option key={item.name} value={index + 1}>{item.name}</option>)}
        </select>
      </label>
    </div>

    <ol className="flex gap-1" aria-label="Progresso pelos cinco reinos">
      {JOURNEY_REALMS.map((item, index) => <li key={item.name} className="min-w-0 flex-1">
        <div className={`h-1.5 rounded-full ${index < lastReachedChapter ? 'bg-primary' : 'bg-muted'}`} aria-hidden="true" />
        <span className="sr-only">{item.name}: {viewCycle === cycle && index + 1 === chapter ? 'capítulo atual' : index + 1 <= lastReachedChapter ? 'passagem alcançada' : 'adiante'}</span>
      </li>)}
    </ol>

    <p className="text-sm leading-relaxed">{journeyNarrative(viewCycle === cycle && visibleChapter === chapter ? position.step : 10, visibleChapter)}</p>
    <p className="text-xs text-muted-foreground">Nove etapas de criaturas e um guardião na etapa 10 de cada reino. A aventura segue sozinha; suas rotinas fortalecem o herói para os próximos encontros.</p>

    {saved ? <div className="rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm" role="status">
      <strong className="text-primary">Seu caminho: {realm[saved.choice].label}</strong>
      <p className="mt-1 text-muted-foreground">{realm[saved.choice].consequence}</p>
    </div> : available ? <div className="rounded-lg border border-border bg-background/40 p-3 text-sm">
      <p className="font-medium">Pequena missão · {realm.prompt}</p>
      <p className="mt-1 text-xs text-muted-foreground">Escolha quando quiser, até em outro ciclo. A decisão não interrompe as lutas.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {(['restore', 'explore'] as const).map(choice => <Button key={choice} type="button" size="sm" variant="outline"
          className="h-auto min-h-11 flex-col items-start whitespace-normal py-2 text-left focus-visible:ring-2 focus-visible:ring-primary"
          disabled={Boolean(savingHere && journey.save.isPending)} onClick={() => void choose(choice)}>
          <span className="flex items-center gap-1 font-semibold">{realm[choice].label}<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></span>
          <span className="text-xs font-normal text-muted-foreground">{realm[choice].detail}</span>
        </Button>)}
      </div>
      {savingHere && journey.save.isPending && <p className="mt-2 text-xs" role="status">Registrando sua escolha...</p>}
      {saveError && <p className="mt-2 text-xs text-destructive" role="alert">{saveError}</p>}
    </div> : <p className="text-xs text-muted-foreground">Uma escolha de caminho aparece na etapa {milestone}. É opcional.</p>}

    {choices.some(row => row.chapter !== visibleChapter) && <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Caminhos guardados neste ciclo</summary>
      <ul className="mt-2 space-y-1 pl-4">
        {choices.filter(row => row.chapter !== visibleChapter).map(row => <li key={row.chapter}>
          {JOURNEY_REALMS[row.chapter - 1].name}: {JOURNEY_REALMS[row.chapter - 1][row.choice].consequence}
        </li>)}
      </ul>
    </details>}
  </section>;
}

export default AdventureJourneyPanel;
