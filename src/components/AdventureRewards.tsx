import { lazy, Suspense } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const AdventureChestsPanel = lazy(() => import('@/components/AdventureChestsPanel'));
const CraftingPanel = lazy(() => import('@/components/CraftingPanel'));

export default function AdventureRewards() {
  return (
    <section aria-labelledby="adventure-rewards-title" className="space-y-3">
      <div>
        <h2 id="adventure-rewards-title" className="font-display text-lg font-semibold">
          Espólios da aventura
        </h2>
        <p className="text-sm text-muted-foreground">
          Use o que conquistou nos combates para melhorar seus equipamentos.
          Seu nível e seus atributos evoluem ao concluir rotinas.
        </p>
      </div>
      <Tabs defaultValue="chests">
        <TabsList aria-label="Recompensas da aventura" className="grid w-full grid-cols-2 sm:w-80">
          <TabsTrigger value="chests">Baús</TabsTrigger>
          <TabsTrigger value="crafting">Oficina</TabsTrigger>
        </TabsList>
        <TabsContent value="chests">
          <Suspense fallback={<p role="status" className="py-4 text-sm text-muted-foreground">Carregando seus baús…</p>}>
            <AdventureChestsPanel />
          </Suspense>
        </TabsContent>
        <TabsContent value="crafting">
          <Suspense fallback={<p role="status" className="py-4 text-sm text-muted-foreground">Carregando sua oficina…</p>}>
            <CraftingPanel />
          </Suspense>
        </TabsContent>
      </Tabs>
    </section>
  );
}
