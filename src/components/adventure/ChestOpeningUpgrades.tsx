import { useState } from 'react';
import { Gift, Lock, Coins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useAdventureChests, adventureChestError } from '@/hooks/useAdventureChests';
import { useChestOpeningPurchase } from '@/hooks/useChestOpeningPurchase';
import { useChestCashPurchase } from '@/hooks/useChestCashPurchase';

export function ChestOpeningUpgrades({ gold }: { gold: number | null }) {
  const { user } = useAuth();
  return <OpeningUpgrades key={user?.id ?? 'visitor'} gold={gold} />;
}

function OpeningUpgrades({ gold }: { gold: number | null }) {
  const chests = useAdventureChests();
  const purchase = useChestOpeningPurchase();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cap = chests.data?.openings_cap;
  const prices = chests.data?.prices_gold;
  const busy = purchase.isPending || Boolean(purchase.pending);
  const confirmed = cap !== undefined && prices !== undefined && !chests.error;
  const cash = useChestCashPurchase(Boolean(confirmed && cap === 3));

  async function openCash() {
    setError(null);
    setMessage(null);
    try {
      await cash.begin();
      setMessage('Pagamento seguro aberto. A quarta abertura só será liberada após a confirmação do pagamento pelo servidor.');
    } catch (cause) { setError(adventureChestError(cause)); }
  }

  async function verifyCash() {
    setError(null);
    try {
      const result = await cash.verify();
      if (result.error) throw result.error;
      setMessage(result.data?.already_owned ? 'A quarta abertura foi confirmada e liberada permanentemente.' : 'A confirmação do pagamento ainda não chegou. Suas aberturas atuais continuam disponíveis.');
    } catch (cause) { setError(adventureChestError(cause)); }
  }

  async function buy(target: 2 | 3) {
    setMessage(null);
    setError(null);
    try {
      const receipt = await purchase.buy(target);
      setMessage(receipt.replayed
        ? `Compra já confirmada: ${receipt.target_cap} aberturas liberadas. Nenhum novo débito.`
        : `${receipt.target_cap} aberturas simultâneas liberadas permanentemente por ${receipt.gold_spent.toLocaleString('pt-BR')} ouro.`);
    } catch (cause) { setError(adventureChestError(cause)); }
  }

  return <section aria-labelledby="chest-opening-upgrades-title" className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
    <h3 id="chest-opening-upgrades-title" className="flex items-center gap-2 text-lg font-bold text-amber-300">
      <Gift className="h-5 w-5" aria-hidden="true" /> Aberturas de baús
    </h3>
    <p className="text-sm text-muted-foreground">Você começa com uma abertura simultânea. Libere a segunda e a terceira com ouro; a quarta será uma compra única com cash. Sem mensalidade.</p>
    {chests.isLoading && <p role="status" className="text-sm">Consultando suas aberturas…</p>}
    {chests.error && <p role="alert" className="text-sm text-amber-300">{adventureChestError(chests.error)} <button type="button" className="underline" onClick={() => void chests.refetch()}>Tentar novamente</button></p>}
    {!chests.isLoading && !chests.error && !confirmed && <p role="status" className="text-sm text-muted-foreground">As liberações de abertura ainda não estão disponíveis neste servidor.</p>}
    {confirmed && <p className="text-sm">Liberadas: <strong>{cap} de 4</strong>. Cada liberação é permanente; os quatro espaços para guardar baús continuam disponíveis.</p>}
    {purchase.pending && <div role="alert" className="space-y-2 rounded-lg border border-amber-500/40 p-3 text-sm">
      <p>Uma compra aguarda confirmação. Retome o mesmo pedido antes de iniciar outra compra.</p>
      <Button type="button" variant="outline" size="sm" disabled={purchase.isPending} onClick={() => void buy(purchase.pending!.target_cap)}>Consultar compra pendente</Button>
    </div>}
    {error && <p role="alert" className="text-sm text-amber-300">{error}</p>}
    {message && <p role="status" className="text-sm text-emerald-300">{message}</p>}
    <div className="grid gap-3 sm:grid-cols-3">
      {([2, 3] as const).map(target => {
        const cost = prices?.[target === 2 ? 'second' : 'third'];
        const owned = cap !== undefined && cap >= target;
        return <div key={target} className="rounded-lg border border-border bg-card/70 p-3 space-y-2">
          <h4 className="font-semibold">{target}ª abertura</h4>
          <p className="flex items-center gap-1 text-sm text-yellow-400"><Coins className="h-4 w-4" aria-hidden="true" /> {cost === undefined ? 'Preço indisponível' : `${cost.toLocaleString('pt-BR')} ouro`}</p>
          <Button type="button" size="sm" disabled={!confirmed || busy || owned || cap !== target - 1 || gold === null || cost === undefined || gold < cost} onClick={() => void buy(target)}>
            {owned ? 'Já liberada' : `Liberar ${target}ª abertura`}
          </Button>
          {!owned && cap !== undefined && cap < target - 1 && <p className="text-xs text-muted-foreground">Libere primeiro a {target - 1}ª abertura.</p>}
        </div>;
      })}
      <div className="rounded-lg border border-violet-500/30 bg-card/70 p-3 space-y-2">
        <h4 className="font-semibold">4ª abertura · cash</h4>
        {cap === 4 ? <p className="text-sm text-emerald-300">Já liberada permanentemente</p> : <>
          <p className="text-sm text-violet-300">R$ 9,90 · compra única e permanente.</p>
          {cap === 3 && cash.status.data?.ready && cash.clientReady ? <>
            <Button type="button" size="sm" disabled={cash.checkout.isPending || cash.status.data.order_status === 'creating'} onClick={() => void openCash()}>{cash.checkout.isPending ? 'Preparando pagamento…' : cash.status.data.order_status === 'creating' ? 'Pedido pendente' : cash.requestId ? 'Retomar pagamento' : 'Liberar por R$ 9,90'}</Button>
            <Button type="button" size="sm" variant="outline" disabled={cash.status.isFetching || cash.checkout.isPending} onClick={() => void verifyCash()}>Verificar pagamento</Button>
            <p className="text-xs text-muted-foreground">{cash.status.data.order_status === 'creating' ? 'O pedido anterior precisa de verificação. Nenhuma nova cobrança será criada.' : 'Se a resposta falhar, retome o mesmo pagamento. A liberação depende da confirmação segura do servidor.'}</p>
          </> : <>
            <Button type="button" size="sm" variant="outline" disabled><Lock className="mr-1 h-3 w-3" aria-hidden="true" /> Em preparação</Button>
            <p className="text-xs text-muted-foreground">Esta compra ainda não está disponível. Suas outras aberturas continuam funcionando.</p>
            {cap === 3 && <Button type="button" variant="ghost" size="sm" disabled={cash.status.isFetching} onClick={() => void verifyCash()}>Verificar disponibilidade</Button>}
          </>}
          <p className="text-xs text-muted-foreground">Doações não liberam esta abertura.</p>
        </>}
      </div>
    </div>
  </section>;
}
