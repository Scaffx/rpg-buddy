import { Crown, Check, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePaddleCheckout } from "@/hooks/usePaddleCheckout";
import { useSubscription } from "@/hooks/useSubscription";

const FEATURES = [
  "Todas as missões diárias e XP ilimitado",
  "Sistema completo de Bosses e Arena PvE",
  "55 classes e árvore de talentos",
  "Loja do Tempo, Inventário e Equipamentos",
  "Ranking mundial e regional",
  "Análises de progresso e gráficos",
  "Suporte prioritário ao herói",
];

/**
 * Card de paywall com botão de assinatura via Paddle.
 * Mostra preço localizado automaticamente (PricePreview do Paddle).
 */
export function SubscriptionPaywall({ compact = false }: { compact?: boolean }) {
  const { openCheckout, loading } = usePaddleCheckout();
  const { isActive, isTrial } = useSubscription();

  if (isActive) {
    return (
      <Card className="border-primary/40 bg-gradient-to-br from-primary/10 to-transparent p-4">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-primary/20 p-2">
            <Crown className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-cinzel font-semibold">
              Premium Ativo {isTrial && <Badge variant="outline" className="ml-1">Trial</Badge>}
            </h3>
            <p className="text-xs text-muted-foreground">
              Você tem acesso completo ao LifeonRPG.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className={`relative overflow-hidden border-primary/40 bg-gradient-to-br from-primary/10 via-card to-card ${compact ? "p-4" : "p-6"}`}>
      <div className="absolute inset-0 pointer-events-none opacity-30">
        <div className="absolute -top-20 -right-20 h-40 w-40 rounded-full bg-primary/40 blur-3xl" />
      </div>

      <div className="relative">
        <div className="flex items-center gap-2 mb-2">
          <Crown className="h-5 w-5 text-primary" />
          <h3 className="font-cinzel text-xl font-bold">LifeonRPG Premium</h3>
          <Badge className="bg-primary/20 text-primary border-primary/40 ml-auto">
            <Sparkles className="h-3 w-3 mr-1" />
            7 dias grátis
          </Badge>
        </div>

        <div className="mb-4">
          <div className="flex items-baseline gap-1">
            <span className="font-cinzel text-3xl font-bold text-primary">R$ 4,90</span>
            <span className="text-sm text-muted-foreground">/mês</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Preço equivalente em USD, EUR, GBP e mais — adaptado à sua região.
          </p>
        </div>

        {!compact && (
          <ul className="space-y-2 mb-5">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm">
                <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        )}

        <Button
          onClick={() => openCheckout({ priceId: "premium_monthly" })}
          disabled={loading}
          className="w-full"
          size="lg"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Crown className="h-4 w-4 mr-2" />
          )}
          Começar 7 dias grátis
        </Button>

        <p className="text-[11px] text-center text-muted-foreground mt-2">
          Cancele quando quiser • Cobrança via Paddle (MoR global)
        </p>
      </div>
    </Card>
  );
}
