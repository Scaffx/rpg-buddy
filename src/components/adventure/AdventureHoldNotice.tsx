import { Button } from '@/components/ui/button';

type Props = {
  stage: number;
  advanceToStage: number;
  retreatedFromStage?: number | null;
  pending: boolean;
  accepted?: boolean;
  canAdvance?: boolean;
  error: boolean;
  onAdvance: () => void;
};

/** Presentation only: the server supplies the holding state and advance target. */
export function AdventureHoldNotice({ stage, advanceToStage, retreatedFromStage, pending, accepted = false, canAdvance = true, error, onAdvance }: Props) {
  return <div className="min-w-0 space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
    <p className="font-semibold">Permanecendo na etapa {stage}</p>
    <p className="text-sm text-muted-foreground">
      {retreatedFromStage != null && retreatedFromStage > stage
        ? `Seu herói recuou após a derrota na etapa ${retreatedFromStage} e continua explorando aqui. `
        : 'Seu herói continua explorando aqui. '}
      Fortaleça-o com suas rotinas e avance quando quiser.
    </p>
    {accepted ? <p className="text-sm text-emerald-200">Avanço confirmado. Seu herói seguirá para a etapa {advanceToStage} após vencer esta luta.</p>
      : canAdvance ? <Button disabled={pending} onClick={onAdvance}>Avançar para etapa {advanceToStage}</Button>
        : <p className="text-sm text-muted-foreground">A próxima luta nesta etapa está sendo preparada.</p>}
    {error && <p role="alert" className="text-sm text-amber-200">Não foi possível avançar. Seu herói permanece nesta etapa; tente novamente.</p>}
  </div>;
}
