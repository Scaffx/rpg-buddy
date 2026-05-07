import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useGoldBalance, useBuyItem } from '@/hooks/useGold';
import { useShopItems, useBuyEquipment, useInventory, type GameItem, type InventoryItem } from '@/hooks/useInventory';
import AppLayout from '@/components/AppLayout';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ShoppingBag, Clock, History,
  Shield, Tv, BedDouble, Utensils, Gamepad2, UsersRound,
  FlaskConical, Sparkles, Zap, HeartPulse, Skull, Coins, Sword, Loader2, AlertTriangle, Pill,
  TrendingUp, TrendingDown, Minus, Lock, CheckCircle2, Package,
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

function normalizeCategory(rawCategory: string | null | undefined): 'consumable' | 'weapon' | 'armor' | 'accessory' | null {
  const normalized = String(rawCategory || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  const aliases: Record<string, 'consumable' | 'weapon' | 'armor' | 'accessory'> = {
    consumable: 'consumable',
    consumivel: 'consumable',
    potion: 'consumable',
    weapon: 'weapon',
    arma: 'weapon',
    armas: 'weapon',
    armor: 'armor',
    armadura: 'armor',
    armaduras: 'armor',
    accessory: 'accessory',
    acessorio: 'accessory',
    acessorios: 'accessory',
    acessory: 'accessory',
  };

  return aliases[normalized] || null;
}

export default function ShopPage() {
  const { t } = useTranslation();
  const [buying, setBuying] = useState<string | null>(null);
  const { data: balance } = useGoldBalance();
  const buyMutation = useBuyItem();
  const buyEquipMutation = useBuyEquipment();
  const { data: inventory = [] } = useInventory();

  // Map of category → currently equipped item (best equipped by category)
  const equippedByCategory = useMemo(() => {
    const map: Record<string, GameItem | null> = { weapon: null, armor: null, accessory: null };
    (inventory as InventoryItem[]).forEach(inv => {
      if (!inv.equipped || !inv.game_items) return;
      const cat = normalizeCategory(inv.game_items.category);
      if (!cat || cat === 'consumable') return;
      if (!map[cat]) { map[cat] = inv.game_items; return; }
      // keep item with highest total stat score
      const score = (g: GameItem) =>
        (g.atk_bonus||0) + (g.matk_bonus||0) + (g.def_bonus||0) + (g.hp_bonus||0)*0.5 + (g.agi_bonus||0) + (g.crit_bonus||0)*2;
      if (score(inv.game_items) > score(map[cat]!)) map[cat] = inv.game_items;
    });
    return map;
  }, [inventory]);

  // Set of item_ids already in inventory
  const ownedItemIds = useMemo(
    () => new Set((inventory as InventoryItem[]).map(inv => inv.item_id)),
    [inventory],
  );

  // Set of item_ids equipped
  const equippedItemIds = useMemo(
    () => new Set((inventory as InventoryItem[]).filter(inv => inv.equipped).map(inv => inv.item_id)),
    [inventory],
  );
  const {
    data: shopEquipItems = [],
    isLoading: isEquipLoading,
    error: equipError,
  } = useShopItems();

  const {
    data: items = [],
    isLoading: isTimeShopLoading,
    error: timeShopError,
  } = useQuery({
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
    weapon: t('app.shop.label_weapon'),
    armor: t('app.shop.label_armor'),
    accessory: t('app.shop.label_accessory'),
    consumable: t('app.shop.label_consumable'),
  };

  const CATEGORY_TAB_LABELS: Record<string, string> = {
    consumable: t('app.shop.tab_consumables'),
    weapon: t('app.shop.tab_weapons'),
    armor: t('app.shop.tab_armors'),
    accessory: t('app.shop.tab_accessories'),
  };

  const CATEGORY_TAB_ICONS: Record<string, React.ComponentType<any>> = {
    consumable: Pill,
    weapon: Sword,
    armor: Shield,
    accessory: Sparkles,
  };

  const CATEGORY_ORDER: Array<'consumable' | 'weapon' | 'armor' | 'accessory'> = [
    'consumable',
    'weapon',
    'armor',
    'accessory',
  ];

  const handleBuy = (item: any) => {
    setBuying(item.id);
    buyMutation.mutate(item, {
      onSuccess: () => {
        toast.success(t('app.shop.toast_buy_success_time', { name: item.name }));
        setBuying(null);
      },
      onError: (err: Error) => {
        toast.error(err.message);
        setBuying(null);
      },
    });
  };

  const renderItems = (itemsList: any[]) => {
    if (!itemsList || itemsList.length === 0) {
      return (
        <div className="rounded-xl border border-border bg-card/60 p-6 text-sm text-muted-foreground">
          {t('app.shop.empty_time_shop')}
        </div>
      );
    }

    return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {itemsList.map((item: any) => {
        const IconComp = ICON_MAP[item.icon] || ShoppingBag;
        const colorClass = COLOR_MAP[item.icon_color] || 'text-cyan-400';
        const glowClass = COLOR_GLOW[item.icon_color] || '';
        const itemCost = Number(item.cost_percent ?? 0);
        const canAfford = currentGold >= itemCost;

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
  };

  const hasShopError = Boolean(timeShopError || equipError);

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
                  {t('app.shop.page_title')}
                </h1>
                <p className="text-sm text-muted-foreground">{t('app.shop.page_subtitle')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-4 py-2">
              <span className="text-sm text-muted-foreground">{t('app.shop.label_balance')}</span>
              <Coins className="w-5 h-5 text-yellow-400" />
              <span className="text-xl font-bold text-emerald-400">
                {currentGold} 🪙
              </span>
            </div>
          </div>

          <div className="flex justify-end">
            <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <History className="w-4 h-4 text-orange-400" />
              {t('app.shop.link_purchase_history')}
            </button>
          </div>
        </div>

        {hasShopError && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5" />
            <div>
              <p className="font-semibold">{t('app.shop.error_title')}</p>
              <p className="text-xs opacity-90">{t('app.shop.error_desc')}</p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <Tabs defaultValue="tempo" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2 bg-secondary/50 border border-border rounded-lg p-1">
            <TabsTrigger value="tempo" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              <Clock className="w-4 h-4 mr-2" />
              {t('app.shop.tab_time_shop')}
            </TabsTrigger>
            <TabsTrigger value="equipamentos" className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-400">
              <Sword className="w-4 h-4 mr-2" />
              {t('app.shop.tab_equipment')}
            </TabsTrigger>
          </TabsList>

          {/* Loja do Tempo */}
          <TabsContent value="tempo" className="space-y-4 mt-6">
            <div className="space-y-2">
              <h2 className="text-lg font-display font-bold text-cyan-400">{t('app.shop.section_time_shop_title')}</h2>
              <p className="text-sm text-muted-foreground italic">
                {t('app.shop.section_time_shop_quote')}
              </p>
            </div>
            {isTimeShopLoading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> {t('app.shop.loading_items')}
              </div>
            ) : (
              renderItems(items)
            )}
          </TabsContent>

          {/* Loja de Equipamentos */}
          <TabsContent value="equipamentos" className="space-y-4 mt-6">
            <div className="space-y-2">
              <h2 className="text-lg font-display font-bold text-purple-400">{t('app.shop.section_equip_title')}</h2>
              <p className="text-sm text-muted-foreground italic">
                {t('app.shop.section_equip_quote')}
              </p>
            </div>

            {isEquipLoading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> {t('app.shop.loading_equip')}
              </div>
            ) : (
              <Tabs defaultValue="weapon" className="w-full space-y-4">
                <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 bg-secondary/50 border border-border rounded-lg p-1">
                  {CATEGORY_ORDER.filter(c => c !== 'consumable').map((cat) => {
                    const Icon = CATEGORY_TAB_ICONS[cat];
                    return (
                      <TabsTrigger
                        key={cat}
                        value={cat}
                        className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary"
                      >
                        <Icon className="w-4 h-4 mr-2" />
                        {CATEGORY_TAB_LABELS[cat]}
                      </TabsTrigger>
                    );
                  })}
                  <TabsTrigger value="consumable" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                    <Pill className="w-4 h-4 mr-2" />
                    {CATEGORY_TAB_LABELS['consumable']}
                  </TabsTrigger>
                </TabsList>

                {CATEGORY_ORDER.map((cat) => {
                  const catItems = shopEquipItems.filter((i: any) => normalizeCategory(i.category) === cat);
                  const equippedItem = (equippedByCategory as any)[cat] as GameItem | null;

                  return (
                    <TabsContent key={cat} value={cat} className="space-y-3 mt-2">
                      {/* Slot info header */}
                      {cat !== 'consumable' && (
                        <div className="flex items-center gap-3 px-1">
                          <span className="text-sm font-semibold text-foreground">{CATEGORY_LABELS[cat]}</span>
                          <span className="text-xs text-muted-foreground">
                            {cat === 'weapon' ? 'até 2 equipadas' : cat === 'armor' ? '1 equipada' : 'até 3 equipadas'}
                          </span>
                          {equippedItem && (
                            <span className="ml-auto text-xs text-emerald-400 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              Equipado: <strong>{equippedItem.name}</strong>
                            </span>
                          )}
                        </div>
                      )}

                      {catItems.length === 0 ? (
                        <div className="rounded-xl border border-border bg-card/60 p-6 text-sm text-muted-foreground">
                          {t('app.shop.empty_category', { category: CATEGORY_TAB_LABELS[cat].toLowerCase() })}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {catItems.map((item: GameItem) => {
                            const itemPrice = Number(item.shop_price ?? 0);
                            const canAfford = currentGold >= itemPrice;
                            const rarityKey = String(item.rarity || 'comum').toLowerCase();
                            const rarityColor = RARITY_COLORS[rarityKey] || 'text-slate-400';
                            const glowClass = RARITY_GLOW[rarityKey] || '';
                            const isOwned    = ownedItemIds.has(item.id);
                            const isEquipped = equippedItemIds.has(item.id);
                            const isLocked   = (item.level_required || 1) > 1;

                            // Stat rows: only show non-zero stats
                            type StatRow = { label: string; icon: string; value: number; delta: number | null };
                            const statDefs: Array<{ key: keyof GameItem; label: string; icon: string }> = [
                              { key: 'atk_bonus',  label: 'ATK',  icon: '⚔️' },
                              { key: 'matk_bonus', label: 'MATK', icon: '🔮' },
                              { key: 'def_bonus',  label: 'DEF',  icon: '🛡️' },
                              { key: 'hp_bonus',   label: 'HP',   icon: '❤️' },
                              { key: 'mp_bonus',   label: 'MP',   icon: '💧' },
                              { key: 'agi_bonus',  label: 'AGI',  icon: '💨' },
                              { key: 'crit_bonus', label: 'CRIT', icon: '🎯' },
                            ];
                            const statRows: StatRow[] = statDefs
                              .map(d => {
                                const val = Number(item[d.key] || 0);
                                const equippedVal = equippedItem ? Number(equippedItem[d.key] || 0) : 0;
                                const delta = (cat !== 'consumable' && (val !== 0 || equippedVal !== 0))
                                  ? val - equippedVal
                                  : null;
                                return { label: d.label, icon: d.icon, value: val, delta };
                              })
                              .filter(r => r.value !== 0);

                            const totalScore = statRows.reduce((s, r) => s + r.value, 0);
                            const netDelta   = statRows.reduce((s, r) => s + (r.delta ?? 0), 0);

                            return (
                              <div
                                key={item.id}
                                className={`relative bg-card border rounded-2xl p-4 flex flex-col gap-3 transition-all shadow-lg ${glowClass} ${
                                  isEquipped ? 'border-emerald-500/60' : 'border-border hover:border-primary/40'
                                }`}
                              >
                                {/* Status badges */}
                                <div className="flex items-start justify-between gap-2">
                                  <span className="text-3xl leading-none">{item.icon}</span>
                                  <div className="flex flex-col items-end gap-1">
                                    <span className={`text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded ${rarityColor} bg-current/10`}>
                                      {String(item.rarity || 'comum').toUpperCase()}
                                    </span>
                                    {isEquipped && (
                                      <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-0.5">
                                        <CheckCircle2 className="w-3 h-3" /> EQUIPADO
                                      </span>
                                    )}
                                    {!isEquipped && isOwned && (
                                      <span className="text-[10px] text-blue-400 flex items-center gap-0.5">
                                        <Package className="w-3 h-3" /> NO BAÚ
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Name + description */}
                                <div>
                                  <h3 className="text-base font-bold text-foreground leading-tight">{item.name}</h3>
                                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.description}</p>
                                </div>

                                {/* Real stat block */}
                                {statRows.length > 0 && (
                                  <div className="bg-secondary/40 rounded-xl p-3 space-y-1.5">
                                    {statRows.map(row => (
                                      <div key={row.label} className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground flex items-center gap-1.5">
                                          <span>{row.icon}</span> {row.label}
                                        </span>
                                        <div className="flex items-center gap-2">
                                          <span className="font-bold text-foreground">+{row.value}</span>
                                          {row.delta !== null && row.delta !== 0 && (
                                            <span className={`text-[10px] font-semibold flex items-center gap-0.5 ${row.delta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                              {row.delta > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                              {row.delta > 0 ? '+' : ''}{row.delta}
                                            </span>
                                          )}
                                          {row.delta === 0 && row.value > 0 && (
                                            <span className="text-[10px] text-muted-foreground flex items-center"><Minus className="w-3 h-3" /></span>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                    {/* Net upgrade/downgrade summary */}
                                    {equippedItem && netDelta !== 0 && (
                                      <div className={`mt-1.5 pt-1.5 border-t border-border/40 text-[11px] font-semibold flex items-center gap-1 ${netDelta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {netDelta > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                        {netDelta > 0 ? `+${netDelta} vs equipado` : `${netDelta} vs equipado`}
                                      </div>
                                    )}
                                    {!equippedItem && cat !== 'consumable' && (
                                      <p className="text-[10px] text-muted-foreground mt-1">Sem item equipado para comparar</p>
                                    )}
                                  </div>
                                )}

                                {/* Level requirement */}
                                {(item.level_required || 1) > 1 && (
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Lock className="w-3 h-3" />
                                    Nível {item.level_required} requerido
                                  </div>
                                )}

                                {/* Sintonização notice */}
                                {item.requer_sintonizacao && (
                                  <p className="text-[10px] text-purple-400">✨ Requer sintonização (épico/lendário)</p>
                                )}

                                {/* Price + buy */}
                                <div className="mt-auto flex flex-col gap-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xl font-bold text-yellow-400">{itemPrice} 🪙</span>
                                    {!canAfford && (
                                      <span className="text-xs text-red-400 flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3" />
                                        Falta {itemPrice - currentGold}
                                      </span>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => {
                                      setBuying(item.id);
                                      buyEquipMutation.mutate(item, {
                                        onSuccess: () => {
                                          toast.success(t('app.shop.toast_buy_success_equip', { name: item.name }));
                                          setBuying(null);
                                        },
                                        onError: (err: Error) => {
                                          toast.error(err.message);
                                          setBuying(null);
                                        },
                                      });
                                    }}
                                    disabled={!canAfford || buying === item.id || isOwned}
                                    className="w-full py-2.5 rounded-xl font-bold text-sm text-foreground transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                    style={{
                                      background: isOwned
                                        ? undefined
                                        : canAfford
                                        ? 'linear-gradient(135deg, hsl(25 95% 53%), hsl(270 60% 55%))'
                                        : undefined,
                                    }}
                                  >
                                    {buying === item.id
                                      ? t('app.shop.button_buying')
                                      : isOwned
                                      ? '✅ Já adquirido'
                                      : !canAfford
                                      ? t('app.shop.button_no_gold')
                                      : t('app.shop.button_buy')}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </TabsContent>
                  );
                })}
              </Tabs>
            )}

            {!isEquipLoading && (shopEquipItems?.length || 0) === 0 && (
              <div className="rounded-xl border border-border bg-card/60 p-6 text-sm text-muted-foreground">
                {t('app.shop.empty_equip')}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
