import { Button } from '@/components/ui/button';
import type { AdventureAutoPotionsState } from '@/hooks/useAdventureAutoPotions';

type Props = {
  state?: AdventureAutoPotionsState;
  battleId?: string | null;
  loading?: boolean;
  unavailable?: boolean;
  error?: string | null;
  setting?: boolean;
  onToggle?: (enabled: boolean) => void;
  onRetry?: () => void;
};

const typeName = { hp: 'HP', mp: 'MP' } as const;

/** Pure readout; omitting onToggle makes root demos illustrative and read-only. */
export function AdventureAutoPotionsPanel({ state, battleId, loading, unavailable, error, setting, onToggle, onRetry }: Props) {
  const reservations = battleId && state?.battle_id === battleId ? state.reservations : [];
  return <section className="rounded-xl border border-border/70 bg-card/50 p-3 space-y-2 text-sm" aria-label="Poções automáticas da aventura">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <p className="font-semibold">Poções automáticas</p>
        <p className="text-xs text-muted-foreground">Opcional · padrão desligado · vale para a próxima luta, inclusive após ausência.</p>
      </div>
      <Button size="sm" variant="outline" role="switch" aria-label="Ativar poções automáticas" aria-checked={state?.enabled ?? false}
        disabled={!state || unavailable || loading || setting || !onToggle}
        onClick={() => state && onToggle?.(!state.enabled)}>
        {setting ? 'Salvando...' : state?.enabled ? 'Ativadas' : 'Desativadas'}
      </Button>
    </div>
    <p className="text-xs text-muted-foreground">Com a opção ativa, usa HP só com vida acima de 0 e abaixo de 25% do máximo; usa MP abaixo de 20% do máximo. No máximo 1 poção de cada tipo por luta. Sem estoque, a luta continua.</p>
    {loading ? <p role="status" className="text-xs">Consultando configuração e estoque...</p> :
      unavailable ? <p role="status" className="text-xs text-amber-300">Poções automáticas indisponíveis neste servidor. A aventura continua normalmente. {onRetry && <button type="button" className="underline" onClick={onRetry}>Verificar novamente</button>}</p> :
      error && !state ? <p role="alert" className="text-xs text-amber-300">{error} {onRetry && <button type="button" className="underline" onClick={onRetry}>Tentar novamente</button>}</p> : null}
    {state && <>
      <p className="text-xs">Próxima luta: <strong>{state.enabled ? 'uso automático ativado' : 'sem uso automático'}</strong>. Alterar agora não modifica eventos nem reservas da luta atual.</p>
      <div aria-label="Estoque disponível de poções" className="grid gap-1 text-xs sm:grid-cols-2">
        {(['hp','mp'] as const).map(type => <p key={type}><strong>{typeName[type]} disponível:</strong> {state.stock.filter(item => item.type === type).length
          ? state.stock.filter(item => item.type === type).map(item => `${item.quantity}× ${item.name} (+${item.amount} ${typeName[type]})`).join(' · ')
          : 'sem poção compatível'}</p>)}
      </div>
      {battleId && <div className="text-xs" aria-label="Poções desta luta">
        <strong>Esta luta:</strong> {reservations.length ? <ul className="mt-1 space-y-1">
          {reservations.map(row => <li key={row.type}>{typeName[row.type]} · {row.name} · +{row.recovered} {typeName[row.type]} efetivos · {row.status === 'reserved' ? '1 unidade reservada, será usada no evento agendado' : '1 unidade usada no evento da luta'}</li>)}
        </ul> : <span> nenhuma poção reservada.</span>}
      </div>}
    </>}
    {error && state && <p role="alert" className="text-xs text-amber-300">{error}</p>}
    <p className="text-xs text-muted-foreground">Unidades reservadas já saíram do estoque disponível. A cura e o MP afetam só esta batalha; não alteram vida ou mana permanentes do perfil.</p>
  </section>;
}
