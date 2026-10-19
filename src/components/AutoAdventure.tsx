import { useEffect, useState } from 'react';
import { Loader2, RotateCw, Shield, Swords, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAutoAdventure, type AdventureEncounter } from '@/hooks/useAutoAdventure';

function kindLabel(encounter: Pick<AdventureEncounter, 'kind' | 'stage'>) {
  return encounter.kind === 'boss' ? `Chefe da etapa ${encounter.stage}` : `Inimigo da etapa ${encounter.stage}`;
}

export default function AutoAdventure() {
  const { data, isLoading, isFetching, error, refetch } = useAutoAdventure();
  const [now, setNow] = useState(Date.now());

  // This clock only animates the display. The server catches up when any client returns.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (isLoading) {
    return <div className="rpg-card flex items-center gap-3" role="status"><Loader2 className="h-5 w-5 animate-spin" /> Preparando sua aventura...</div>;
  }

  if (error || !data) {
    return <div className="rpg-card space-y-3 border-amber-500/40" role="alert">
      <p className="font-semibold">A aventura está indisponível agora.</p>
      <p className="text-sm text-muted-foreground">{error instanceof Error ? error.message : 'Tente novamente em instantes.'}</p>
      <Button variant="outline" onClick={() => void refetch()}><RotateCw className="mr-2 h-4 w-4" /> Tentar novamente</Button>
    </div>;
  }

  const nextAt = new Date(data.next_at).getTime();
  const remaining = Math.max(0, Math.ceil((nextAt - now) / 1000));
  const minutes = Math.floor(remaining / 60);
  const seconds = String(remaining % 60).padStart(2, '0');
  const progress = Math.max(0, Math.min(100, 100 * (1 - remaining / (data.limits.interval_minutes * 60))));
  const isBoss = data.stage % 10 === 0;
  const latest = data.encounters[0];

  return <section className="space-y-4" aria-label="Aventura automática">
    <div className="rpg-card-glow space-y-5 border-primary/30 bg-gradient-to-br from-primary/10 to-slate-900/40">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Aventura automática</p>
          <h2 className="font-display text-2xl font-bold text-primary">Etapa {data.stage}</h2>
          <p className="text-sm text-muted-foreground">{isBoss ? '🐉 Chefe à frente' : '⚔️ Próximo inimigo'} · combate sem comandos por turno</p>
        </div>
        <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">Ativa automaticamente</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <div className="rounded-xl border border-primary/30 bg-card/60 p-4 text-center"><Shield className="mx-auto mb-2 h-8 w-8 text-primary" /><p className="font-semibold">Seu personagem</p><p className="text-xs text-muted-foreground">Nível e equipamento influenciam o combate</p></div>
        <Swords className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
        <div className="rounded-xl border border-destructive/30 bg-card/60 p-4 text-center"><span className="block text-3xl" aria-hidden="true">{isBoss ? '🐉' : '👾'}</span><p className="font-semibold">{isBoss ? 'Chefe' : 'Inimigo'}</p><p className="text-xs text-muted-foreground">Etapa {data.stage}</p></div>
      </div>

      <div className="space-y-2" role="status" aria-live="polite">
        <div className="flex justify-between text-xs text-muted-foreground"><span>Próximo confronto</span><span>{minutes}:{seconds}</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-primary transition-all duration-1000" style={{ width: `${progress}%` }} /></div>
      </div>
      <p className="text-xs text-muted-foreground">Ao voltar ao app, o servidor recupera no máximo {data.limits.offline_hours} horas. Derrotas apenas pausam a etapa; a próxima tentativa é automática.</p>
    </div>

    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rpg-card"><p className="text-xs text-muted-foreground">Ouro da aventura hoje</p><p className="text-xl font-bold text-amber-300">{data.gold_today} / {data.limits.gold_per_day}</p></div>
      <div className="rpg-card"><p className="text-xs text-muted-foreground">Itens da aventura hoje</p><p className="text-xl font-bold">{data.loot_today} / {data.limits.items_per_day}</p></div>
      <div className="rpg-card"><p className="text-xs text-muted-foreground">Último resultado</p><p className="text-sm font-semibold">{latest ? latest.won ? 'Vitória' : 'Derrota sem penalidade' : 'Aguardando'}</p></div>
    </div>

    <div className="rpg-card space-y-3">
      <div className="flex items-center justify-between"><h3 className="flex items-center gap-2 font-display font-bold"><Trophy className="h-4 w-4" /> Confrontos recentes</h3><Button size="sm" variant="ghost" disabled={isFetching} onClick={() => void refetch()} aria-label="Atualizar aventura"><RotateCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /></Button></div>
      {data.encounters.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum confronto ainda.</p> : <ol className="space-y-2">{data.encounters.map(encounter => <li key={`${encounter.stage}-${encounter.attempt}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-sm"><span>{encounter.kind === 'boss' ? '🐉' : '⚔️'} {kindLabel(encounter)}</span><span className={encounter.won ? 'text-emerald-300' : 'text-amber-300'}>{encounter.won ? `Vitória · +${encounter.gold} ouro${encounter.item_id ? ' · item no inventário' : ''}` : 'Derrota · sem perda'}</span></li>)}</ol>}
      <p className="text-xs text-muted-foreground">Combate não concede XP, nível nem atributos. Essas evoluções vêm de rotinas concluídas.</p>
    </div>
  </section>;
}
