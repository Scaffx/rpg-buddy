import { useState } from 'react';
import { craftingErrorMessage, useCraftBossRecipe, useCraftingState, useSalvageDuplicate } from '@/hooks/useCrafting';

const realmNames: Record<string, string> = {
  normal: 'normal', desert: 'deserto', water: 'água', ice: 'gelo', fire: 'fogo',
};
const formatNumber = (value: number) => value.toLocaleString('pt-BR');

export default function CraftingPanel() {
  const state = useCraftingState();
  const craft = useCraftBossRecipe();
  const salvage = useSalvageDuplicate();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const data = state.data;

  const onCraft = async (recipeId: string) => {
    setError(null); setNotice(null);
    try {
      const result = await craft.mutateAsync(recipeId);
      setNotice(result.replayed ? 'Fabricação já registrada.' : 'Item fabricado e enviado ao inventário.');
    } catch (cause) { setError(craftingErrorMessage(cause)); }
  };
  const onSalvage = async (inventoryId: string, quantity: number) => {
    setError(null); setNotice(null);
    try {
      const result = await salvage.mutateAsync({ inventoryId, quantity });
      setNotice(result.replayed ? 'Desmontagem já registrada.'
        : `${result.scrap_return} sucata recebida.`);
    } catch (cause) { setError(craftingErrorMessage(cause)); }
  };

  return (
    <section aria-labelledby="crafting-title" className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div>
        <h2 id="crafting-title" className="font-semibold text-foreground">⚒️ Oficina</h2>
        <p className="text-sm text-muted-foreground">Vença chefes para aprender receitas. Rotinas dão o nível necessário para fabricar e equipar.</p>
      </div>
      {state.isLoading && <p className="text-sm text-muted-foreground">Carregando a oficina…</p>}
      {state.isError && <p role="alert" className="text-sm text-destructive">{craftingErrorMessage(state.error)}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="text-sm text-emerald-400">{notice}</p>}
      {data && <>
        <div className="text-sm text-muted-foreground space-y-1">
          <p>Nível {data.level} · {formatNumber(data.gold)} ouro · classe {data.hero_class ?? 'não definida'}</p>
          {data.hero_class === 'aprendiz' && <p>Aprendizes usam as receitas iniciais de novato após atingir o nível exigido pelas rotinas.</p>}
          <p>Materiais: {formatNumber(data.materials.scrap ?? 0)} sucata · {Object.entries(realmNames).map(([key, label]) => `${formatNumber(data.materials[key] ?? 0)} essência de ${label}`).join(' · ')}</p>
          <p>Chefes vencidos dão 2 sucatas e 1 essência do reino, até uma vez a cada 30 minutos de combate por personagem. Duplicados desmontados dão apenas sucata.</p>
          <p>Próxima receita: vencer o chefe da etapa {data.next_boss_stage}.</p>
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Receitas</h3>
          {data.recipe_count > 30 && <p className="text-xs text-muted-foreground">Mostrando as 30 receitas desbloqueadas mais recentes de {formatNumber(data.recipe_count)}.</p>}
          {data.recipes.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma receita descoberta ainda. Vença o primeiro chefe para começar.</p>}
          {data.recipes.map((recipe) => {
            const missingLevel = data.level < recipe.level_required;
            const wrongClass = data.craft_class !== recipe.hero_class;
            const missingGold = data.gold < recipe.gold_cost;
            const missingScrap = (data.materials.scrap ?? 0) < recipe.scrap_cost;
            const missingEssence = (data.materials[recipe.realm] ?? 0) < recipe.essence_cost;
            const canCraft = recipe.unlocked && !missingLevel && !wrongClass
              && !missingGold && !missingScrap && !missingEssence;
            return <div key={recipe.id} className="rounded-lg border border-border p-3 space-y-1 text-sm">
              <p className="font-medium">{recipe.item_icon} {recipe.item_name} · etapa {recipe.stage}</p>
              <p className="text-muted-foreground">{recipe.item_stats ?? recipe.rarity} · nível {recipe.level_required} · {formatNumber(recipe.gold_cost)} ouro · {formatNumber(recipe.scrap_cost)} sucata · {formatNumber(recipe.essence_cost)} essência de {realmNames[recipe.realm] ?? recipe.realm}</p>
              <p className="text-xs text-muted-foreground">{recipe.unlocked
                ? `Desbloqueada em ${new Date(recipe.unlocked_at ?? '').toLocaleString('pt-BR')}`
                : 'Vença o chefe desta etapa para desbloquear.'}</p>
              {recipe.unlocked && (missingLevel || wrongClass || missingGold || missingScrap || missingEssence) &&
                <p className="text-xs text-amber-400">{[
                  missingLevel && `faltam ${recipe.level_required - data.level} níveis de rotina`,
                  wrongClass && `exige classe ${recipe.hero_class}`,
                  missingGold && `faltam ${formatNumber(recipe.gold_cost - data.gold)} ouro`,
                  missingScrap && `faltam ${recipe.scrap_cost - (data.materials.scrap ?? 0)} sucata`,
                  missingEssence && `faltam ${recipe.essence_cost - (data.materials[recipe.realm] ?? 0)} essências`,
                ].filter(Boolean).join(' · ')}</p>}
              <button type="button" disabled={!canCraft || craft.isPending}
                onClick={() => void onCraft(recipe.id)}
                className="rounded bg-primary px-3 py-1 text-primary-foreground disabled:opacity-50">
                Fabricar
              </button>
            </div>;
          })}
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Desmontar duplicados</h3>
          <p className="text-xs text-muted-foreground">Uma cópia sempre permanece. Cada item desmontado rende 1 sucata; ouro e essência não retornam.</p>
          {data.duplicates.length === 0 && <p className="text-sm text-muted-foreground">Nenhum duplicado elegível no inventário.</p>}
          {data.duplicates.map((item) => {
            const selected = Math.min(Math.max(1, quantities[item.inventory_id] ?? 1), item.quantity - 1);
            return <div key={item.inventory_id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2 text-sm">
              <span>{item.icon} {item.name} · {item.quantity} cópias</span>
              <label htmlFor={`salvage-${item.inventory_id}`}>Quantidade</label>
              <input id={`salvage-${item.inventory_id}`} type="number" min={1} max={item.quantity - 1}
                value={selected} onChange={(event) => setQuantities((current) => ({
                  ...current, [item.inventory_id]: Number(event.target.value),
                }))} className="w-16 rounded border border-border bg-background px-1" />
              <button type="button" disabled={salvage.isPending}
                onClick={() => void onSalvage(item.inventory_id, selected)}
                className="rounded bg-secondary px-3 py-1 text-secondary-foreground disabled:opacity-50">
                Desmontar · +{selected} sucata
              </button>
            </div>;
          })}
        </div>
        {data.recent_receipts.length > 0 && <div className="text-xs text-muted-foreground">
          <h3 className="font-semibold">Vitórias registradas</h3>
          <ul>{data.recent_receipts.map((receipt) => <li key={receipt.battle_id}>
            Etapa {receipt.stage} · {new Date(receipt.recorded_at).toLocaleString('pt-BR')}
            {receipt.historical ? ' · vitória histórica preservada' : ''}
          </li>)}</ul>
        </div>}
      </>}
    </section>
  );
}
