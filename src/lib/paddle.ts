import { supabase } from "@/integrations/supabase/client";

const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN;

declare global {
  interface Window {
    Paddle: any;
  }
}

export function getPaddleEnvironment(): "sandbox" | "live" {
  return clientToken?.startsWith("test_") ? "sandbox" : "live";
}

let paddleInitialized = false;

export async function initializePaddle() {
  if (paddleInitialized) return;

  if (!clientToken) {
    throw new Error("VITE_PAYMENTS_CLIENT_TOKEN is not set");
  }

  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.onload = () => {
      const paddleJsEnvironment = getPaddleEnvironment() === "sandbox" ? "sandbox" : "production";
      window.Paddle.Environment.set(paddleJsEnvironment);
      window.Paddle.Initialize({
        token: clientToken,
        eventCallback: (event: any) => {
          if (event.name === "checkout.error" || event.type === "error") {
            console.error("[Paddle] Checkout event error:", JSON.stringify(event));
          } else {
            console.log("[Paddle] Event:", event.name, event);
          }
        },
      });
      paddleInitialized = true;
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// Optional direct price ID overrides via env vars (bypasses API lookup)
// e.g. VITE_PADDLE_PRICE_MONTHLY=pri_01xxx  VITE_PADDLE_PRICE_ANNUAL=pri_01yyy
const PRICE_ID_MAP: Record<string, string | undefined> = {
  premium_monthly: import.meta.env.VITE_PADDLE_PRICE_MONTHLY,
  premium_annual:  import.meta.env.VITE_PADDLE_PRICE_ANNUAL,
};

export async function getPaddlePriceId(priceId: string): Promise<string> {
  // If a direct Paddle price ID is configured in env, use it immediately
  const direct = PRICE_ID_MAP[priceId] ?? (priceId.startsWith('pri_') ? priceId : undefined);
  if (direct) return direct;

  // Fallback: resolve via edge function (requires external_id configured in Paddle)
  const environment = getPaddleEnvironment();
  const { data, error } = await supabase.functions.invoke("get-paddle-price", {
    body: { priceId, environment },
  });
  if (error || !data?.paddleId) {
    throw new Error(`Failed to resolve price "${priceId}": ${error?.message ?? 'not found'}`);
  }
  return data.paddleId;
}
