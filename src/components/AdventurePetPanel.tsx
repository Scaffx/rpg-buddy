import type { AdventurePetState } from '@/hooks/useActivePet';
import type { AdventurePetSnapshot } from '@/lib/autoAdventurePayload';
import { adventurePetBonusLabel, sustainLabel } from '@/lib/pets';

type Props = {
  battlePet: AdventurePetSnapshot | null | undefined;
  selection: AdventurePetState | undefined;
  selectionLoading: boolean;
  selectionError: boolean;
};

const stats = [
  ['atk', 'Ofensa (ATK/MATK)'],
  ['def', 'DEF'],
  ['hp', 'HP máx.'],
  ['mp', 'MP máx.'],
] as const;

export function AdventurePetPanel({ battlePet, selection, selectionLoading, selectionError }: Props) {
  const selected = selection?.pets.find(pet => pet.id === selection.active_companion_id);
  return <div className="rounded-xl border border-border/70 bg-card/50 p-3 space-y-2 text-sm" aria-label="Pet na aventura">
    <p className="font-semibold">Pet na aventura automática</p>
    {battlePet ? <>
      <p>Esta luta: <strong>{battlePet.name}</strong> · {adventurePetBonusLabel(battlePet.bonus)}{battlePet.sustain ? ` · ${sustainLabel(battlePet.sustain)}` : ''}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs" aria-label="Atributos do herói nesta luta, base e efetivo">
        {stats.map(([key, label]) => <p key={key}>{label}: <span className="text-muted-foreground">{battlePet.base_stats[key]}</span> → <strong>{battlePet.effective_stats[key]}</strong></p>)}
      </div>
      <p className="text-xs text-muted-foreground">Valores do herói congelados no início desta luta. Os atributos, nível e humor próprios do companheiro não entram nessa conta.</p>
    </> : <p className="text-muted-foreground">{battlePet === null ? 'Esta luta começou sem pet.' : 'Nenhuma luta com pet confirmada neste momento.'}</p>}
    {selectionLoading ? <p role="status" className="text-xs text-muted-foreground">Consultando a seleção para a próxima luta...</p>
      : selectionError ? <p role="alert" className="text-xs text-amber-300">Não foi possível confirmar a seleção para a próxima luta.</p>
      : selection && !selection.enabled ? <p className="text-xs text-amber-300">Combate com pets aguardando liberação para esta conta.</p>
      : selection?.enabled ? <p className="text-xs">Próxima luta: <strong>{selected ? `${selected.name} · ${adventurePetBonusLabel(selected.bonus)}${selected.sustain ? ` · ${sustainLabel(selected.sustain)}` : ''}` : 'sem pet selecionado'}</strong>{selected?.id !== battlePet?.companion_id && battlePet !== undefined ? ' A troca não altera a luta atual.' : ''}</p>
      : null}
  </div>;
}
