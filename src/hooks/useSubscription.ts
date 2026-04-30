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
 * Se não encontrar nenhuma subscription, cria automaticamente um trial de 7 dias.
 * Inclui realtime: refaz a query quando há mudanças na tabela subscriptions.
 */
export function useSubscription() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const env = getPaddleEnvironment();

  const query = useQuery({
    queryKey: ["subscription", user?.id, env],
    enabled: !!user,
    staleTime: 30_000,
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

      // Se não encontrou nenhuma subscription, cria trial automaticamente
      if (!data) {
        await (supabase.rpc as any)("ensure_trial_subscription");
        // Busca novamente após criar
        const { data: fresh } = await supabase
          .from("subscriptions" as any)
          .select("*")
          .eq("user_id", user!.id)
          .eq("environment", env)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        return (fresh as unknown as SubscriptionRow) ?? null;
      }

      return data as unknown as SubscriptionRow;
    },
  });

  // Realtime
  useEffect(() => {
    if (!user) return;
    const topic = `realtime:subscriptions-${user.id}`;

    for (const existingChannel of supabase.getChannels()) {
      if (existingChannel.topic === topic) {
        supabase.removeChannel(existingChannel);
      }
    }

    const channel = supabase.channel(`subscriptions-${user.id}`);

    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "subscriptions", filter: `user_id=eq.${user.id}` },
      () => {
        queryClient.invalidateQueries({ queryKey: ["subscription", user.id, env] });
      }
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, env, queryClient]);

  const sub = query.data;
  const now = Date.now();

  const periodEndRaw = sub?.current_period_end ? new Date(sub.current_period_end) : null;
  const graceEnd = periodEndRaw
    ? new Date(
        periodEndRaw.getFullYear(),
        periodEndRaw.getMonth(),
        periodEndRaw.getDate(),
        23, 59, 59, 999
      ).getTime()
    : null;

  const withinGrace = graceEnd === null || graceEnd > now;

  const isActive =
    !!sub &&
    (((sub.status === "active" || sub.status === "trialing" || sub.status === "past_due") &&
      withinGrace) ||
      (sub.status === "canceled" && graceEnd !== null && graceEnd > now));

  const isTrial = sub?.status === "trialing";
  const isCanceled = sub?.status === "canceled";
  const isPastDue = sub?.status === "past_due";

  const msPerDay = 1000 * 60 * 60 * 24;
  const daysUntilBlock = graceEnd !== null
    ? Math.max(0, Math.ceil((graceEnd - now) / msPerDay))
    : null;

  const shouldWarn =
    isActive &&
    daysUntilBlock !== null &&
    daysUntilBlock <= 3 &&
    (isCanceled || isPastDue || sub?.cancel_at_period_end === true);

  const blockDateLabel = periodEndRaw
    ? periodEndRaw.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })
    : null;

  return {
    subscription: sub,
    isActive,
    isTrial,
    isCanceled,
    isPastDue,
    daysUntilBlock,
    shouldWarn,
    blockDateLabel,
    isLoading: query.isLoading,
  };
}


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
  const ensuredRef = useRef(false);

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

  // Safety net: se o usuário não tiver subscription, cria o trial automaticamente (uma única vez)
  useEffect(() => {
    if (!user || query.isLoading || query.data !== null || ensuredRef.current) return;
    // query.data === null significa que buscou e não encontrou nada
    if (query.fetchStatus === "idle") {
      ensuredRef.current = true;
      (supabase.rpc as any)("ensure_trial_subscription").then(() => {
        queryClient.invalidateQueries({ queryKey: ["subscription", user.id, env] });
      });
    }
  }, [user, query.isLoading, query.data, query.fetchStatus, env, queryClient]);

  // Realtime
  useEffect(() => {
    if (!user) return;
    const topic = `realtime:subscriptions-${user.id}`;

    for (const existingChannel of supabase.getChannels()) {
      if (existingChannel.topic === topic) {
        supabase.removeChannel(existingChannel);
      }
    }

    const channel = supabase.channel(`subscriptions-${user.id}`);

    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "subscriptions", filter: `user_id=eq.${user.id}` },
      () => {
        queryClient.invalidateQueries({ queryKey: ["subscription", user.id, env] });
      }
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, env, queryClient]);

  const sub = query.data;
  const now = Date.now();

  // Carência: usuário mantém acesso até o FINAL do dia (23:59:59.999 local)
  // do vencimento. Ex: vence dia 21 -> bloqueia somente após 23:59 do dia 21.
  const periodEndRaw = sub?.current_period_end ? new Date(sub.current_period_end) : null;
  const graceEnd = periodEndRaw
    ? new Date(
        periodEndRaw.getFullYear(),
        periodEndRaw.getMonth(),
        periodEndRaw.getDate(),
        23, 59, 59, 999
      ).getTime()
    : null;

  const withinGrace = graceEnd === null || graceEnd > now;

  const isActive =
    !!sub &&
    (((sub.status === "active" || sub.status === "trialing" || sub.status === "past_due") &&
      withinGrace) ||
      (sub.status === "canceled" && graceEnd !== null && graceEnd > now));

  const isTrial = sub?.status === "trialing";
  const isCanceled = sub?.status === "canceled";
  const isPastDue = sub?.status === "past_due";

  // Dias restantes até o bloqueio (arredondado para cima — o dia atual conta como 1)
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysUntilBlock = graceEnd !== null
    ? Math.max(0, Math.ceil((graceEnd - now) / msPerDay))
    : null;

  // Janela de aviso amigável: 3 dias antes ou se cancelada/past_due
  const shouldWarn =
    isActive &&
    daysUntilBlock !== null &&
    daysUntilBlock <= 3 &&
    (isCanceled || isPastDue || sub?.cancel_at_period_end === true);

  const blockDateLabel = periodEndRaw
    ? periodEndRaw.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })
    : null;

  return {
    subscription: sub,
    isActive,
    isTrial,
    isCanceled,
    isPastDue,
    daysUntilBlock,
    shouldWarn,
    blockDateLabel,
    isLoading: query.isLoading,
  };
}
