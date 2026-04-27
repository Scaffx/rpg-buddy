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
      const paddlePriceId = await getPaddlePriceId(priceId);

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
      console.error(err);
      toast.error("Não foi possível abrir o checkout. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return { openCheckout, loading };
}
