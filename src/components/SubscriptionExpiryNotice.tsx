import { AlertTriangle, Crown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/hooks/useSubscription";
import { usePaddleCheckout } from "@/hooks/usePaddleCheckout";

/**
 * Aviso amigável mostrado nos últimos dias antes do bloqueio,
 * quando a assinatura está cancelada / past_due / agendada para cancelar.
 * O acesso é mantido até o FINAL do dia do vencimento.
 */
export function SubscriptionExpiryNotice() {
  const { shouldWarn, daysUntilBlock, blockDateLabel, isPastDue, isCanceled } = useSubscription();
  const { openCheckout, loading } = usePaddleCheckout();

  if (!shouldWarn) return null;

  const days = daysUntilBlock ?? 0;
  const isLastDay = days <= 1;

  let title = "Sua aventura continua… por enquanto";
  let message: string;

  if (isPastDue) {
    title = "Houve um problema com seu pagamento";
    message = isLastDay
      ? `Seu acesso será suspenso ao final do dia${blockDateLabel ? ` ${blockDateLabel}` : ""}. Atualize seu pagamento para continuar evoluindo seu herói sem interrupções.`
      : `Seu acesso continua ativo por mais ${days} dia${days === 1 ? "" : "s"} (até o fim do dia${blockDateLabel ? ` ${blockDateLabel}` : ""}). Atualize seu pagamento para não perder seu progresso.`;
  } else if (isCanceled) {
    message = isLastDay
      ? `Sua assinatura termina hoje ao fim do dia${blockDateLabel ? ` ${blockDateLabel}` : ""}. Reative agora para manter XP, missões e classes ativas amanhã.`
      : `Sua assinatura termina em ${days} dia${days === 1 ? "" : "s"} (no fim do dia${blockDateLabel ? ` ${blockDateLabel}` : ""}). Reative para continuar sua jornada sem perder o ritmo.`;
  } else {
    // cancel_at_period_end
    message = isLastDay
      ? `Sua assinatura está agendada para encerrar hoje. Você terá acesso até o fim do dia${blockDateLabel ? ` ${blockDateLabel}` : ""}. Reative para continuar.`
      : `Sua assinatura encerra em ${days} dia${days === 1 ? "" : "s"} (fim do dia${blockDateLabel ? ` ${blockDateLabel}` : ""}). Reative quando quiser para manter tudo ativo.`;
  }

  return (
    <div
      className={`mx-2 mt-2 rounded-lg border px-3 py-2.5 flex items-start gap-3 ${
        isLastDay
          ? "border-destructive/50 bg-destructive/10 text-destructive"
          : "border-amber-500/50 bg-amber-500/10 text-amber-200"
      }`}
      role="status"
      aria-live="polite"
    >
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold font-cinzel">{title}</p>
        <p className="text-[11px] opacity-90 mt-0.5 leading-snug">{message}</p>
      </div>
      <Button
        size="sm"
        variant={isLastDay ? "destructive" : "secondary"}
        className="shrink-0 h-7 text-xs"
        onClick={() => openCheckout({ priceId: "premium_monthly" })}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="h-3 w-3 animate-spin mr-1" />
        ) : (
          <Crown className="h-3 w-3 mr-1" />
        )}
        {isPastDue ? "Atualizar pagamento" : "Reativar"}
      </Button>
    </div>
  );
}
