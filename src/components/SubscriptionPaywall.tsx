import { Crown, Loader2, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePaddleCheckout } from "@/hooks/usePaddleCheckout";
import { useSubscription } from "@/hooks/useSubscription";
import { useLocalizedPricing } from "@/hooks/useLocalizedPricing";

/**
 * Card de paywall com botão de assinatura via Paddle.
 * Mostra preço localizado automaticamente (PricePreview do Paddle).
 */
export function SubscriptionPaywall({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const { openCheckout, loading } = usePaddleCheckout();
  const { isActive, isTrial } = useSubscription();
  const { monthlyFormatted, annualFormatted, monthlyUsd, loading: pricingLoading } = useLocalizedPricing();

  if (isActive) {
    return (
      <Card className="border-primary/40 bg-gradient-to-br from-primary/10 to-transparent p-4">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-primary/20 p-2">
            <Crown className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-cinzel font-semibold">
              {t("pricing.access_active")} {isTrial && <Badge variant="outline" className="ml-1">Trial</Badge>}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t("pricing.access_active_desc")}
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
          <h3 className="font-cinzel text-xl font-bold">{t("pricing.access_plan_title")}</h3>
          <Badge className="bg-primary/20 text-primary border-primary/40 ml-auto">
            <Sparkles className="h-3 w-3 mr-1" />
            {t("pricing.monthly.badge")}
          </Badge>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          {t("pricing.access_plan_subtitle")}
        </p>

        <div className="grid gap-3 mb-4 md:grid-cols-2">
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-foreground">{t("pricing.monthly.name")}</p>
              <Badge variant="outline" className="border-primary/30 text-primary">{t("pricing.monthly.badge")}</Badge>
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="font-cinzel text-2xl font-bold text-primary">
                {pricingLoading ? "..." : monthlyFormatted}
              </span>
              <span className="text-sm text-muted-foreground">{t("pricing.monthly.price_period")}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("pricing.monthly.desc")} • Base: USD {monthlyUsd.toFixed(2)}
            </p>
            <Button
              onClick={() => openCheckout({ priceId: "premium_monthly" })}
              disabled={loading}
              className="mt-3 w-full"
              size="sm"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Crown className="h-4 w-4 mr-2" />}
              {t("pricing.monthly.cta")}
            </Button>
          </div>

          <div className="rounded-xl border border-accent/40 bg-accent/10 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-foreground">{t("pricing.annual.name")}</p>
              <Badge className="bg-accent/20 text-accent border-accent/40">{t("pricing.annual.badge")}</Badge>
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="font-cinzel text-2xl font-bold text-primary">
                {pricingLoading ? "..." : annualFormatted}
              </span>
              <span className="text-sm text-muted-foreground">{t("pricing.annual.price_period")}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t("pricing.annual.desc")}</p>
            <p className="mt-2 text-xs font-medium text-accent">{t("pricing.annual.bonus")}</p>
            <Button
              onClick={() => openCheckout({ priceId: "premium_annual" })}
              disabled={loading}
              className="mt-3 w-full bg-accent text-accent-foreground hover:bg-accent/90"
              size="sm"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Crown className="h-4 w-4 mr-2" />}
              {t("pricing.annual.cta")}
            </Button>
          </div>
        </div>

        <p className="text-[11px] text-center text-muted-foreground mt-2">
          {t("pricing.mor_note")}
        </p>
      </div>
    </Card>
  );
}
