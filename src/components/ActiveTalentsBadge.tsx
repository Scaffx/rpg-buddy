import { Sparkles } from 'lucide-react';
import { usePlayerTalents } from '@/hooks/useTalents';

type ActiveTalentsBadgeProps = {
  compact?: boolean;
  className?: string;
};

export default function ActiveTalentsBadge({ compact = false, className = '' }: ActiveTalentsBadgeProps) {
  const { data: talents = [] } = usePlayerTalents();

  // Conta apenas talentos equipados — é a única medida que reflete o que
  // está de fato contribuindo no gameplay. Evita confusão entre "comprado"
  // e "ativo".
  const names = (talents || [])
    .filter((row: any) => row?.equipped)
    .map((row: any) => String(row?.talentos_disponiveis?.nome || ''))
    .filter(Boolean);

  const count = names.length;

  if (compact) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] ${
          count > 0 ? 'border-primary/40 bg-primary/15 text-primary' : 'border-border bg-muted/40 text-muted-foreground'
        } ${className}`}
        title={count > 0 ? `Talentos ativos: ${names.join(', ')}` : 'Nenhum talento ativo'}
      >
        <Sparkles className="h-3.5 w-3.5" />
        <span>{count} ativos</span>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border p-2.5 ${count > 0 ? 'border-primary/35 bg-primary/10' : 'border-border bg-muted/30'} ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Talentos Ativos</p>
        <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-bold ${count > 0 ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
          <Sparkles className="h-3.5 w-3.5" /> {count}
        </span>
      </div>

      {count > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {names.map((name) => (
            <span key={name} className="text-[11px] rounded-full border border-primary/30 bg-primary/15 px-2 py-0.5 text-primary">
              {name}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-[11px] text-muted-foreground">Sem talentos adquiridos ainda.</p>
      )}
    </div>
  );
}
