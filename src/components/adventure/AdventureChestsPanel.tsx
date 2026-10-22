import { useEffect, useMemo, useState } from 'react';
import { Box, Clock3, Coins, Gift, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  adventureChestError,
  useAdventureChests,
  type AdventureChest,
  type AdventureChestReceipt,
} from '@/hooks/useAdventureChests';

const rarityText: Record<AdventureChest['rarity'], string> = {
  comum: 'Comum', raro: 'Raro', epico: 'Épico', lendario: 'Lendário',
};
const rarityBorder: Record<AdventureChest['rarity'], string> = {
  comum: 'border-stone-500/40', raro: 'border-sky-500/50',
  epico: 'border-violet-500/50', lendario: 'border-amber-500/60',
};
const essenceText: Record<AdventureChest['minimum']['essence_material'], string> = {
  normal: 'normal', desert: 'deserto', water: 'água', ice: 'gelo', fire: 'fogo',
};

function remaining(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours ? `${hours}h ${String(minutes).padStart(2, '0')}m ${String(rest).padStart(2, '0')}s`
    : `${minutes}m ${String(rest).padStart(2, '0')}s`;
}

function guaranteed(chest: AdventureChest) {
  const minimum = chest.minimum;
  const rewards = [`${minimum.gold} ouro`, `${minimum.scrap} sucata`];
  if (minimum.essence) rewards.push(`${minimum.essence} essência de ${essenceText[minimum.essence_material]}`);
  if (minimum.potions) rewards.push(`${minimum.potions} ${minimum.potions === 1 ? 'poção' : 'poções'}`);
  return rewards.join(' · ');
}

function recentReward(receipt: AdventureChestReceipt) {
  const parts = [`${receipt.gold} ouro`, `${receipt.scrap} sucata`];
  if (receipt.essence) parts.push(`${receipt.essence} essência de ${essenceText[receipt.essence_material]}`);
  if (receipt.potions) parts.push(`${receipt.potions} ${receipt.potions === 1 ? 'poção' : 'poções'}`);
  if (receipt.equipment) parts.push(`${receipt.equipment.icon} ${receipt.equipment.name}`);
  return parts.join(' · ');
}

export function AdventureChestsPanel() {
  const { data, error, isLoading, isFetching, refetch, start, claim } = useAdventureChests();
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const serverTime = data?.server_now;
  const clock = useMemo(() => serverTime ? {
    server: Date.parse(serverTime), monotonic: performance.now(),
  } : null, [serverTime]);
  const opening = data?.chests.some(chest => chest.status === 'opening') ?? false;
  useEffect(() => {
    if (!opening) return;
    const timer = window.setInterval(() => setTick(value => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [opening]);
  const serverNow = clock ? clock.server + Math.max(0, performance.now() - clock.monotonic) : 0;
  const busy = start.isPending || claim.isPending;

  async function handleStart(chestId: string) {
    setActionError(null);
    setActionSuccess(null);
    try {
      await start.mutateAsync(chestId);
      setActionSuccess('Abertura iniciada. O horário fica salvo no servidor.');
    } catch (cause) {
      setActionError(adventureChestError(cause));
    }
  }

  async function handleClaim(chestId: string) {
    setActionError(null);
    setActionSuccess(null);
    try {
      const result = await claim.mutateAsync(chestId);
      setActionSuccess(result.replayed
        ? 'Este baú já foi resgatado. O recibo continua disponível abaixo.'
        : `Baú resgatado: ${recentReward(result.receipt)}.`);
    } catch (cause) {
      setActionError(adventureChestError(cause));
    }
  }

  return (
    <section aria-labelledby="adventure-chests-title" className="rounded-2xl border border-border/70 bg-card/80 p-4 sm:p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="adventure-chests-title" className="flex items-center gap-2 text-lg font-bold">
            <Gift className="h-5 w-5 text-amber-400" aria-hidden="true" /> Baús da aventura
          </h2>
          <p className="text-sm text-muted-foreground">
            Quatro espaços, uma abertura por vez. O tempo corre mesmo quando você sai. Baús não dão XP.
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label="Atualizar baús"
          disabled={isFetching} onClick={() => void refetch()}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} aria-hidden="true" />
        </Button>
      </div>

      {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
        {adventureChestError(error)}
      </p>}
      {actionError && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
        {actionError}
      </p>}
      {actionSuccess && <p role="status" className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
        {actionSuccess}
      </p>}

      {isLoading && <p className="text-sm text-muted-foreground">Consultando seus baús no servidor…</p>}
      {data && <>
        <p className="text-sm text-muted-foreground">
          {data.occupied} de {data.slots_total} espaços ocupados. Vitórias dão no máximo uma oportunidade de baú a cada 30 minutos de combate.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: data.slots_total }, (_, slot) => {
            const chest = data.chests[slot];
            if (!chest) return <div key={`empty-${slot}`} className="min-h-36 rounded-xl border border-dashed border-border/60 p-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Box className="h-4 w-4" aria-hidden="true" /> Espaço {slot + 1} livre
            </div>;
            const ready = chest.ready_at !== null && serverNow >= Date.parse(chest.ready_at);
            return <article key={chest.id} className={`rounded-xl border bg-background/50 p-4 space-y-2 ${rarityBorder[chest.rarity]}`}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold">Baú {rarityText[chest.rarity]}</h3>
                <span className="text-xs text-muted-foreground">{chest.open_hours}h para abrir</span>
              </div>
              <p className="text-xs text-muted-foreground">Garantido: {guaranteed(chest)}.</p>
              <p className="text-xs text-muted-foreground">Pode conter equipamento adequado à classe e ao nível da vitória.</p>
              {chest.status === 'queued' ? <Button type="button" size="sm" disabled={busy || opening}
                onClick={() => void handleStart(chest.id)}>Iniciar abertura</Button>
                : <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-1 text-sm" aria-live="polite">
                    <Clock3 className="h-4 w-4" aria-hidden="true" />
                    {ready ? 'Pronto para resgatar' : remaining(Date.parse(chest.ready_at!) - serverNow)}
                  </span>
                  <Button type="button" size="sm" disabled={busy || !ready}
                    onClick={() => void handleClaim(chest.id)}>Resgatar</Button>
                </div>}
            </article>;
          })}
        </div>
        {data.occupied === 0 && <p className="text-sm text-muted-foreground">
          Vença combates para encontrar baús. Ao receber um, escolha quando começar a abertura.
        </p>}
        {data.overflow.count > 0 && <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm space-y-1">
          <p className="flex items-center gap-2 font-medium"><Coins className="h-4 w-4" aria-hidden="true" /> Excedente convertido</p>
          <p>{data.overflow.count} {data.overflow.count === 1 ? 'baú' : 'baús'} com os espaços cheios: {data.overflow.gold} ouro e {data.overflow.scrap} sucata creditados. Essências também foram creditadas quando presentes.</p>
        </div>}
        {data.recent_claims.length > 0 && <div className="space-y-2">
          <h3 className="text-sm font-semibold">Resgates recentes</h3>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {data.recent_claims.map(receipt => <li key={receipt.chest_id}>
              {rarityText[receipt.rarity]} · {recentReward(receipt)}
            </li>)}
          </ul>
        </div>}
      </>}
    </section>
  );
}

export default AdventureChestsPanel;
