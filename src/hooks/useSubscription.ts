import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { getPaddleEnvironment } from "@/lib/paddle";

export interface SubscriptionRow {
  id: string;
  user_id: string;
  paddle_subscription_id: string;
  paddle_customer_id: string;
  product_id: string;
  price_id: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  environment: "sandbox" | "live";
}

/**
 * Retorna a assinatura atual do usuário (mais recente) + flags úteis.
 * Inclui realtime: refaz a query quando há mudanças na tabela subscriptions.
 */
export function useSubscription() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const env = getPaddleEnvironment();

  const query = useQuery({
    queryKey: ["subscription", user?.id, env],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions" as any)
        .select("*")
        .eq("user_id", user!.id)
        .eq("environment", env)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as SubscriptionRow) ?? null;
    },
  });

  // Realtime
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`subscriptions-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "subscriptions", filter: `user_id=eq.${user.id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["subscription", user.id, env] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, env, queryClient]);

  const sub = query.data;
  const now = Date.now();
  const periodEnd = sub?.current_period_end ? new Date(sub.current_period_end).getTime() : null;

  const isActive =
    !!sub &&
    (((sub.status === "active" || sub.status === "trialing" || sub.status === "past_due") &&
      (periodEnd === null || periodEnd > now)) ||
      (sub.status === "canceled" && periodEnd !== null && periodEnd > now));

  const isTrial = sub?.status === "trialing";
  const isCanceled = sub?.status === "canceled";

  return {
    subscription: sub,
    isActive,
    isTrial,
    isCanceled,
    isLoading: query.isLoading,
  };
}
