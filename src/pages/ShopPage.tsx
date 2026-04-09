import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useGoldBalance, useBuyItem } from '@/hooks/useGold';
import { useShopItems, useBuyEquipment } from '@/hooks/useInventory';
import AppLayout from '@/components/AppLayout';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ShoppingBag, Clock, History,
  Shield, Tv, BedDouble, Utensils, Gamepad2, UsersRound,
  FlaskConical, Sparkles, Zap, HeartPulse, Skull, Coins, Sword,
} from 'lucide-react';

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  Shield, Tv, BedDouble, Utensils, Gamepad2, UsersRound,
  FlaskConical, Sparkles, Zap, HeartPulse, Clock, Skull, Sword,
};

const COLOR_MAP: Record<string, string> = {
  cyan: 'text-cyan-400',
  green: 'text-emerald-400',
  purple: 'text-purple-400',
  orange: 'text-orange-400',
  pink: 'text-pink-400',
  red: 'text-red-400',
};

const COLOR_GLOW: Record<string, string> = {
  cyan: 'shadow-cyan-500/20',
  green: 'shadow-emerald-500/20',
  purple: 'shadow-purple-500/20',
  orange: 'shadow-orange-500/20',
  pink: 'shadow-pink-500/20',
  red: 'shadow-red-500/20',
};

export default function ShopPage() {
  const [buying, setBuying] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('tempo');
  const { data: balance } = useGoldBalance();
  const buyMutation = useBuyItem();
  const buyEquipMutation = useBuyEquipment();
  const { data: shopEquipItems = [] } = useShopItems();

  const { data: items = [] } = useQuery({
    queryKey: ['shop-items'],
    queryFn: async () => {
      const { data, error } = await supabase.from('shop_items').select('*');
      if (error) throw error;
      return data;
    },
  });

  const currentGold = (balance as any)?.gold ?? 100;

  const RARITY_COLORS: Record<string, string> = {
    comum: 'text-slate-400',
    incomum: 'text-green-400',
    raro: 'text-blue-400',
    epico: 'text-purple-400',
    lendario: 'text-yellow-400',
  };

  const RARITY_GLOW: Record<string, string> = {
    comum: '',
    incomum: 'shadow-green-500/20',
    raro: 'shadow-blue-500/20',
    epico: 'shadow-purple-500/20',
    lendario: 'shadow-yellow-500/20',
  };

  const CATEGORY_LABELS: Record<string, string> = {
    weapon: '⚔️ Arma',
    armor: '🛡️ Armadura',
    accessory: '📿 Acessório',
    consumable: '🧪 Consumível',
  };

  const handleBuy = (item: any) => {
    setBuying(item.id);
    buyMutation.mutate(item, {
      onSuccess: () => {
        toast.success(`${item.name} comprado com sucesso! 🪙`);
        setBuying(null);
      },
      onError: (err: Error) => {
        toast.error(err.message);
        setBuying(null);
      },
    });
  };

  const renderItems = (itemsList: any[]) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {itemsList.map((item: any) => {
        const IconComp = ICON_MAP[item.icon] || ShoppingBag;
        const colorClass = COLOR_MAP[item.icon_color] || 'text-cyan-400';
        const glowClass = COLOR_GLOW[item.icon_color] || '';
        const canAfford = currentGold >= item.cost_percent;

        return (
          <div
            key={item.id}
            className={`bg-card border border-border rounded-2xl p-5 flex flex-col gap-3 hover:border-primary/30 transition-all shadow-lg ${glowClass}`}
          >
            <div className="flex items-start justify-between">
              <IconComp className={`w-8 h-8 ${colorClass}`} />
            </div>

            <div>
              <h3 className="text-lg font-bold text-foreground">{item.name}</h3>
              <p className="text-sm text-muted-foreground">{item.description}</p>
            </div>

            <div className="flex items-center justify-between mt-auto">
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold text-yellow-400">{item.cost_percent} 🪙</span>
                {item.duration && (
                  <span className="flex items-center gap-1 text-xs text-emerald-400">
                    <Clock className="w-3.5 h-3.5" />
                    {item.duration}
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={() => handleBuy(item)}
              disabled={!canAfford || buying === item.id}
              className="w-full py-2.5 rounded-xl font-bold text-sm text-foreground transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: canAfford
                  ? 'linear-gradient(135deg, hsl(25 95% 53%), hsl(270 60% 55%))'
                  : undefined,
              }}
            >
              {buying === item.id ? 'COMPRANDO...' : !canAfford ? 'OURO INSUFICIENTE' : 'COMPRAR'}
            </button>
          </div>
        );
      })}
    </div>
  );

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <ShoppingBag className="w-8 h-8 text-cyan-400" />
              <div>
                <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
                  🏪 Loja
                </h1>
                <p className="text-sm text-muted-foreground">EQUIPAMENTOS E BÊNÇÃOS</p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-4 py-2">
              <span className="text-sm text-muted-foreground">SEU SALDO</span>
              <Coins className="w-5 h-5 text-yellow-400" />
              <span className="text-xl font-bold text-emerald-400">
                {currentGold} 🪙
              </span>
            </div>
          </div>

          <div className="flex justify-end">
            <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <History className="w-4 h-4 text-orange-400" />
              Histórico de Compras
            </button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="tempo" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2 bg-secondary/50 border border-border rounded-lg p-1">
            <TabsTrigger value="tempo" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              <Clock className="w-4 h-4 mr-2" />
              Loja do Tempo
            </TabsTrigger>
            <TabsTrigger value="equipamentos" className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-400">
              <Sword className="w-4 h-4 mr-2" />
              Equipamentos
            </TabsTrigger>
          </TabsList>

          {/* Loja do Tempo */}
          <TabsContent value="tempo" className="space-y-4 mt-6">
            <div className="space-y-2">
              <h2 className="text-lg font-display font-bold text-cyan-400">Loja do Tempo</h2>
              <p className="text-sm text-muted-foreground italic">
                "O tempo é seu maior ativo. Adquira pausas, proteção e equilíbrio para evoluir com sabedoria."
              </p>
            </div>
            {renderItems(items)}
          </TabsContent>

          {/* Loja de Equipamentos */}
          <TabsContent value="equipamentos" className="space-y-4 mt-6">
            <div className="space-y-2">
              <h2 className="text-lg font-display font-bold text-purple-400">Loja de Equipamentos</h2>
              <p className="text-sm text-muted-foreground italic">
                "Armas, armaduras e acessórios permanentes para fortalecer seu personagem."
              </p>
            </div>

            {(['weapon', 'armor', 'accessory', 'consumable'] as const).map((cat) => {
              const catItems = shopEquipItems.filter((i: any) => i.category === cat);
              if (catItems.length === 0) return null;
              return (
                <div key={cat} className="space-y-3">
                  <h3 className="text-md font-semibold text-foreground">{CATEGORY_LABELS[cat]}</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {catItems.map((item: any) => {
                      const canAfford = currentGold >= item.shop_price;
                      const rarityColor = RARITY_COLORS[item.rarity] || 'text-slate-400';
                      const glowClass = RARITY_GLOW[item.rarity] || '';
                      return (
                        <div
                          key={item.id}
                          className={`bg-card border border-border rounded-2xl p-5 flex flex-col gap-3 hover:border-primary/30 transition-all shadow-lg ${glowClass}`}
                        >
                          <div className="flex items-start justify-between">
                            <span className="text-3xl">{item.icon}</span>
                            <span className={`text-xs font-bold ${rarityColor}`}>{item.rarity.toUpperCase()}</span>
                          </div>

                          <div>
                            <h3 className="text-lg font-bold text-foreground">{item.name}</h3>
                            <p className="text-sm text-muted-foreground">{item.description}</p>
                            {item.stat_label && (
                              <p className="text-xs text-primary mt-1 font-semibold">{item.stat_label}</p>
                            )}
                          </div>

                          <div className="flex items-center mt-auto">
                            <span className="text-2xl font-bold text-yellow-400">{item.shop_price} 🪙</span>
                          </div>

                          <button
                            onClick={() => {
                              setBuying(item.id);
                              buyEquipMutation.mutate(item, {
                                onSuccess: () => {
                                  toast.success(`${item.name} comprado! Verifique seu inventário.`);
                                  setBuying(null);
                                },
                                onError: (err: Error) => {
                                  toast.error(err.message);
                                  setBuying(null);
                                },
                              });
                            }}
                            disabled={!canAfford || buying === item.id}
                            className="w-full py-2.5 rounded-xl font-bold text-sm text-foreground transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            style={{
                              background: canAfford
                                ? 'linear-gradient(135deg, hsl(25 95% 53%), hsl(270 60% 55%))'
                                : undefined,
                            }}
                          >
                            {buying === item.id ? 'COMPRANDO...' : !canAfford ? 'OURO INSUFICIENTE' : 'COMPRAR'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
