import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Hammer, Package, Loader2, AlertTriangle } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { useProfile, useClasses } from '@/hooks/useProfile';
import { useGoldBalance } from '@/hooks/useGold';
import { useRecipes, useCraftingMaterials, useCraftItem } from '@/hooks/useCrafting';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

const CRAFTING_CLASSES = ['Alquimista', 'Mecânico', 'Mestre-Ferreiro', 'Criador'];

const CLASS_ICONS: Record<string, string> = {
  Alquimista: '⚗️',
  Mecânico: '🔧',
  'Mestre-Ferreiro': '⚒️',
  Criador: '🛠️',
};

export default function CraftingPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: profile } = useProfile();
  const { data: classes } = useClasses();
  const { data: goldBalance } = useGoldBalance();
  const gold = (goldBalance as any)?.gold ?? 0;

  const currentClass = useMemo(() => {
    const id = (profile as any)?.current_class_id;
    if (!id || !classes) return null;
    return (classes as any[]).find((c: any) => c.id === id)?.name ?? null;
  }, [profile, classes]);

  const isCraftingClass = currentClass ? CRAFTING_CLASSES.includes(currentClass) : false;
  const { data: recipes, isLoading: recipesLoading } = useRecipes(isCraftingClass ? currentClass : null);
  const { data: materials } = useCraftingMaterials();
  const craftItem = useCraftItem();

  const handleCraft = async (recipe: any) => {
    try {
      await craftItem.mutateAsync({
        materialsRequired: recipe.materials_cost,
        goldRequired: recipe.gold_cost ?? 0,
        outputItemId: recipe.item_output_id,
        recipeName: recipe.name,
      });
      toast({
        title: `⚒️ ${recipe.name} fabricado!`,
        description: 'Item adicionado ao inventário.',
      });
    } catch (err: any) {
      toast({
        title: 'Falha ao fabricar',
        description: err?.message,
        variant: 'destructive',
      });
    }
  };

  if (!profile || !classes) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!isCraftingClass) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-64 gap-4 text-center px-6">
          <AlertTriangle className="w-12 h-12 text-yellow-400 opacity-70" />
          <h2 className="text-xl font-display font-bold text-foreground">Classe não compatível</h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            Apenas Alquimistas, Mecânicos e suas evoluções podem fabricar itens. Evolua sua classe para acessar esta área.
          </p>
          <Button variant="outline" onClick={() => navigate('/classes')}>
            Ver Árvore de Classes
          </Button>
        </div>
      </AppLayout>
    );
  }

  const classIcon = CLASS_ICONS[currentClass!] ?? '⚙️';

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <span className="text-3xl">{classIcon}</span>
          <div>
            <h1 className="text-2xl font-display font-bold text-primary text-glow">
              Oficina de Craft
            </h1>
            <p className="text-sm text-muted-foreground">{currentClass}</p>
          </div>
        </div>

        {/* Recursos disponíveis */}
        <div className="flex gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-4 py-2">
            <span className="text-lg">🧪</span>
            <span className="text-sm font-bold text-foreground">{materials ?? 0}</span>
            <span className="text-xs text-muted-foreground">Materiais</span>
          </div>
          <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-4 py-2">
            <span className="text-lg">🪙</span>
            <span className="text-sm font-bold text-foreground">{gold}</span>
            <span className="text-xs text-muted-foreground">Ouro</span>
          </div>
        </div>

        {/* Receitas */}
        {recipesLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : !recipes?.length ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted-foreground">
            <Package className="w-10 h-10 opacity-30" />
            <p className="text-sm">Nenhuma receita disponível para {currentClass}.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {recipes.map((recipe: any) => {
              const item = recipe.item_output;
              const canAffordMats = (materials ?? 0) >= recipe.materials_cost;
              const canAffordGold = !recipe.gold_cost || gold >= recipe.gold_cost;
              const canCraft = canAffordMats && canAffordGold;

              return (
                <div
                  key={recipe.id}
                  className="bg-card border border-border rounded-xl p-4 space-y-3"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-3xl shrink-0">{item?.icon ?? '📦'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-display font-bold text-foreground text-sm">{recipe.name}</p>
                        {item?.rarity && (
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-border/60 capitalize">
                            {item.rarity}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {recipe.description || item?.description}
                      </p>
                    </div>
                  </div>

                  {/* Bônus do item */}
                  {item && (
                    <div className="flex flex-wrap gap-1.5 text-[10px]">
                      {item.atk_bonus > 0 && (
                        <span className="bg-red-950/40 border border-red-500/30 rounded px-1.5 py-0.5 text-red-300">+{item.atk_bonus} ATK</span>
                      )}
                      {item.def_bonus > 0 && (
                        <span className="bg-blue-950/40 border border-blue-500/30 rounded px-1.5 py-0.5 text-blue-300">+{item.def_bonus} DEF</span>
                      )}
                      {item.hp_bonus > 0 && (
                        <span className="bg-green-950/40 border border-green-500/30 rounded px-1.5 py-0.5 text-green-300">+{item.hp_bonus} HP</span>
                      )}
                      {item.mp_bonus > 0 && (
                        <span className="bg-purple-950/40 border border-purple-500/30 rounded px-1.5 py-0.5 text-purple-300">+{item.mp_bonus} MP</span>
                      )}
                      {item.matk_bonus > 0 && (
                        <span className="bg-violet-950/40 border border-violet-500/30 rounded px-1.5 py-0.5 text-violet-300">+{item.matk_bonus} MATK</span>
                      )}
                      {item.crit_bonus > 0 && (
                        <span className="bg-orange-950/40 border border-orange-500/30 rounded px-1.5 py-0.5 text-orange-300">+{item.crit_bonus}% CRIT</span>
                      )}
                      {item.agi_bonus > 0 && (
                        <span className="bg-yellow-950/40 border border-yellow-500/30 rounded px-1.5 py-0.5 text-yellow-300">+{item.agi_bonus} AGI</span>
                      )}
                    </div>
                  )}

                  {/* Custo */}
                  <div className="flex items-center gap-3 text-xs">
                    <span className={`flex items-center gap-1 ${canAffordMats ? 'text-foreground' : 'text-red-400'}`}>
                      🧪 {recipe.materials_cost} mat.
                    </span>
                    {recipe.gold_cost > 0 && (
                      <span className={`flex items-center gap-1 ${canAffordGold ? 'text-foreground' : 'text-red-400'}`}>
                        🪙 {recipe.gold_cost} ouro
                      </span>
                    )}
                  </div>

                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => handleCraft(recipe)}
                    disabled={!canCraft || craftItem.isPending}
                  >
                    {craftItem.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    ) : (
                      <Hammer className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    {canCraft ? 'Fabricar' : 'Recursos insuficientes'}
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center pb-4">
          🧪 Materiais são obtidos ao derrotar bosses. Continue explorando!
        </p>
      </div>
    </AppLayout>
  );
}
