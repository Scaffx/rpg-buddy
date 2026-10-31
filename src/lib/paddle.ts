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
let paddleInitialization: Promise<void> | null = null;

export async function initializePaddle() {
  if (paddleInitialized) return;

  if (!clientToken) {
    throw new Error("VITE_PAYMENTS_CLIENT_TOKEN is not set");
  }
  if (paddleInitialization) return paddleInitialization;
  const loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      if (error) {
        script.remove();
        reject(error);
      } else {
        paddleInitialized = true;
        resolve();
      }
    };
    const timer = window.setTimeout(() => finish(new Error("O carregamento do pagamento demorou demais. Tente novamente.")), 15_000);
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.onload = () => {
      if (settled) return;
      try {
        const paddleJsEnvironment = getPaddleEnvironment() === "sandbox" ? "sandbox" : "production";
        window.Paddle.Environment.set(paddleJsEnvironment);
        window.Paddle.Initialize({
          token: clientToken,
          eventCallback: (event: { name?: string; type?: string }) => {
            if (event.name === "checkout.error" || event.type === "error") console.error("[Paddle] Falha no checkout.");
          },
        });
        finish();
      } catch { finish(new Error("Não foi possível inicializar o pagamento seguro.")); }
    };
    script.onerror = () => finish(new Error("Não foi possível carregar o pagamento seguro."));
    document.head.appendChild(script);
  });
  paddleInitialization = loading;
  try { await loading; }
  finally { if (paddleInitialization === loading) paddleInitialization = null; }
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
