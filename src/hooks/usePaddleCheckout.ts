import { useState } from "react";
import { initializePaddle, getPaddlePriceId } from "@/lib/paddle";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

interface OpenCheckoutOptions {
  priceId: string;
  successUrl?: string;
}

export function usePaddleCheckout() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const openCheckout = async ({ priceId, successUrl }: OpenCheckoutOptions) => {
    if (!user) {
      toast.error("Você precisa estar logado para assinar.");
      return;
    }
    setLoading(true);
    try {
      await initializePaddle();
    } catch (err) {
      console.error("[Paddle] initializePaddle failed:", err);
      toast.error("Falha ao carregar o sistema de pagamento. Verifique sua conexão.");
      setLoading(false);
      return;
    }

    let paddlePriceId: string;
    try {
      paddlePriceId = await getPaddlePriceId(priceId);
    } catch (err) {
      console.error("[Paddle] getPaddlePriceId failed:", err);
      toast.error("Não foi possível encontrar o plano de assinatura. Entre em contato com o suporte.");
      setLoading(false);
      return;
    }

    try {
      window.Paddle.Checkout.open({
        items: [{ priceId: paddlePriceId, quantity: 1 }],
        customer: user.email ? { email: user.email } : undefined,
        customData: { userId: user.id },
        settings: {
          displayMode: "overlay",
          successUrl: successUrl || `${window.location.origin}/dashboard?checkout=success`,
          allowLogout: false,
          variant: "one-page",
          theme: "dark",
        },
      });
    } catch (err) {
      console.error("[Paddle] Checkout.open failed:", err);
      toast.error("Não foi possível abrir o checkout. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return { openCheckout, loading };
}
