import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import AppLayout from '@/components/AppLayout';
import { toast } from 'sonner';
import {
  ShoppingBag, Clock, History,
  Shield, Tv, BedDouble, Utensils, Gamepad2, UsersRound,
  FlaskConical, Sparkles, Zap, HeartPulse, Skull,
} from 'lucide-react';

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  Shield, Tv, BedDouble, Utensils, Gamepad2, UsersRound,
  FlaskConical, Sparkles, Zap, HeartPulse, Clock, Skull,
};

const COLOR_MAP: Record<string, string> = {
  cyan: 'text-cyan-400',
  green: 'text-emerald-400',
  purple: 'text-purple-400',
  orange: 'text-orange-400',
  pink: 'text-pink-400',
};

const COLOR_GLOW: Record<string, string> = {
  cyan: 'shadow-cyan-500/20',
  green: 'shadow-emerald-500/20',
  purple: 'shadow-purple-500/20',
  orange: 'shadow-orange-500/20',
  pink: 'shadow-pink-500/20',
};

export default function ShopPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [buying, setBuying] = useState<string | null>(null);

  const { data: items = [] } = useQuery({
    queryKey: ['shop-items'],
    queryFn: async () => {
      const { data, error } = await supabase.from('shop_items').select('*');
      if (error) throw error;
      return data;
    },
  });

  const { data: balance } = useQuery({
    queryKey: ['user-balance'],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('user_balance')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        const { data: newBalance, error: insertError } = await supabase
          .from('user_balance')
          .insert({ user_id: user.id, balance_percent: 100 })
          .select()
          .single();
        if (insertError) throw insertError;
        return newBalance;
      }
      return data;
    },
    enabled: !!user,
  });

  const buyMutation = useMutation({
    mutationFn: async (item: any) => {
      if (!user || !balance) throw new Error('Não autenticado');
      if (balance.balance_percent < item.cost_percent) {
        throw new Error('Saldo insuficiente!');
      }

      const newBalance = balance.balance_percent - item.cost_percent;
      const { error: balError } = await supabase
        .from('user_balance')
        .update({ balance_percent: newBalance, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
      if (balError) throw balError;

      let expiresAt: string | null = null;
      const durMap: Record<string, number> = {
        '50m': 50 * 60 * 1000,
        '1h': 60 * 60 * 1000,
        '1h30m': 90 * 60 * 1000,
        '2h': 2 * 60 * 60 * 1000,
        '3h': 3 * 60 * 60 * 1000,
        '12h': 12 * 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
      };
      if (item.duration && durMap[item.duration]) {
        expiresAt = new Date(Date.now() + durMap[item.duration]).toISOString();
      }

      const { error: buffError } = await supabase.from('user_buffs').insert({
        user_id: user.id,
        item_id: item.id,
        expires_at: expiresAt,
      });
      if (buffError) throw buffError;
    },
    onSuccess: (_, item) => {
      queryClient.invalidateQueries({ queryKey: ['user-balance'] });
      queryClient.invalidateQueries({ queryKey: ['user-buffs'] });
      toast.success(`${item.name} comprado com sucesso!`);
      setBuying(null);
    },
    onError: (err: Error) => {
      toast.error(err.message);
      setBuying(null);
    },
  });

  const handleBuy = (item: any) => {
    setBuying(item.id);
    buyMutation.mutate(item);
  };

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
                  Loja do <span className="text-cyan-400">Tempo</span>
                </h1>
                <p className="text-sm text-muted-foreground">COMPRE TEMPO E EQUILÍBRIO</p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-4 py-2">
              <span className="text-sm text-muted-foreground">SEU SALDO</span>
              <span className="text-xl font-bold text-emerald-400">
                {balance?.balance_percent ?? 100}%
              </span>
            </div>
          </div>

          <p className="text-center text-sm text-muted-foreground italic" style={{ textShadow: '0 0 20px hsl(270 60% 55% / 0.4)' }}>
            "O tempo é seu maior ativo. Adquira pausas, proteção e equilíbrio para evoluir com sabedoria."
          </p>

          <div className="flex justify-end">
            <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <History className="w-4 h-4 text-orange-400" />
              Histórico de Compras
            </button>
          </div>
        </div>

        {/* Items Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item: any) => {
            const IconComp = ICON_MAP[item.icon] || ShoppingBag;
            const colorClass = COLOR_MAP[item.icon_color] || 'text-cyan-400';
            const glowClass = COLOR_GLOW[item.icon_color] || '';
            const canAfford = (balance?.balance_percent ?? 100) >= item.cost_percent;

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
                    <span className="text-2xl font-bold text-primary">{item.cost_percent}%</span>
                    <span className="flex items-center gap-1 text-xs text-emerald-400">
                      <Clock className="w-3.5 h-3.5" />
                      {item.duration}
                    </span>
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
                  {buying === item.id ? 'COMPRANDO...' : !canAfford ? 'SALDO INSUFICIENTE' : 'COMPRAR'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
