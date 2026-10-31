import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const PURCHASE_TYPES = ['compra_loja', 'compra_equipamento', 'compra_pet', 'compra_bau_abertura'];

export function usePurchaseHistory(open: boolean) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['purchase-history', user?.id],
    enabled: open && !!user,
    retry: false,
    queryFn: async () => {
      if (!user) throw new Error('Faça login para consultar suas compras.');
      const { data, error } = await supabase
        .from('gold_history')
        .select('id, type, amount, reason, created_at')
        .eq('user_id', user.id)
        .in('type', PURCHASE_TYPES)
        .lte('amount', 0)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });
}
