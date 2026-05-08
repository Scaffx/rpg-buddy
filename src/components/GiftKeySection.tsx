import { useState } from "react";
import { Gift, Copy, Check, KeyRound, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useMyGiftKeys, useRedeemKey } from "@/hooks/useAccessKeys";
import { useSubscription } from "@/hooks/useSubscription";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_code:       "Código inválido. Verifique e tente novamente.",
  already_used:       "Esta chave já foi utilizada.",
  expired:            "Esta chave expirou.",
  not_authenticated:  "Você precisa estar logado.",
};

export function GiftKeySection() {
  const { data: keys = [], isLoading: loadingKeys } = useMyGiftKeys();
  const { subscription } = useSubscription();
  const redeemMutation = useRedeemKey();

  const [redeemCode, setRedeemCode] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const isAnnual = subscription?.price_id?.startsWith("pri_") &&
    import.meta.env.VITE_PADDLE_PRICE_ANNUAL &&
    subscription.price_id === import.meta.env.VITE_PADDLE_PRICE_ANNUAL;

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedId(id);
      toast.success("Código copiado!");
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const handleRedeem = async () => {
    if (!redeemCode.trim()) return;
    const result = await redeemMutation.mutateAsync(redeemCode).catch(() => null);
    if (!result) return;
    if (result.ok) {
      const months = result.grant_months ?? 2;
      toast.success(`✅ ${months} ${months === 1 ? 'mês adicionado' : 'meses adicionados'} à sua assinatura!`);
      setRedeemCode("");
    } else {
      toast.error(ERROR_MESSAGES[result.error ?? ""] ?? "Não foi possível resgatar a chave.");
    }
  };

  const issuedKeys = keys.filter(k => k.status === "issued");
  const redeemedKeys = keys.filter(k => k.status === "redeemed");

  return (
    <div className="space-y-4">
      {/* My issued keys */}
      {(loadingKeys || keys.length > 0 || isAnnual) && (
        <div className="rpg-card bg-accent/5 border-accent/30 space-y-3">
          <div className="flex items-center gap-2">
            <Gift className="w-4 h-4 text-accent" />
            <h3 className="font-cinzel font-semibold text-sm text-foreground">Sua Chave de Presente</h3>
          </div>

          {loadingKeys ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" /> Carregando...
            </div>
          ) : issuedKeys.length > 0 ? (
            <div className="space-y-2">
              {issuedKeys.map(key => (
                <div key={key.id} className="flex items-center gap-2 bg-background/60 rounded-lg border border-border/50 px-3 py-2">
                  <code className="flex-1 font-mono text-sm font-bold tracking-widest text-accent">
                    {key.code}
                  </code>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    +{key.grant_months} meses
                  </span>
                  <button
                    onClick={() => copyCode(key.code, key.id)}
                    className="p-1.5 rounded-md hover:bg-accent/20 text-muted-foreground hover:text-accent transition-colors"
                    title="Copiar código"
                  >
                    {copiedId === key.id
                      ? <Check className="w-3.5 h-3.5 text-green-400" />
                      : <Copy className="w-3.5 h-3.5" />
                    }
                  </button>
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground">
                Compartilhe este código com um amigo. Ele dá {issuedKeys[0]?.grant_months ?? 2} meses de acesso Premium gratuito.
              </p>
            </div>
          ) : redeemedKeys.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              ✅ Sua chave de presente já foi utilizada.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              🎁 Assinantes anuais recebem uma chave de 2 meses para presentear um amigo. Assine o plano anual para obter a sua!
            </p>
          )}
        </div>
      )}

      {/* Redeem a key */}
      <div className="rpg-card bg-primary/5 border-primary/20 space-y-3">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-primary" />
          <h3 className="font-cinzel font-semibold text-sm text-foreground">Resgatar Código</h3>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Recebeu um código de presente? Digite abaixo para ativar meses extras de Premium na sua conta.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={redeemCode}
            onChange={e => setRedeemCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            onKeyDown={e => e.key === "Enter" && handleRedeem()}
            maxLength={12}
            placeholder="XXXXXXXXXXXX"
            className="flex-1 bg-background/60 border border-border/50 rounded-lg px-3 py-2 text-sm font-mono tracking-widest placeholder:tracking-normal placeholder:font-sans focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            onClick={handleRedeem}
            disabled={redeemMutation.isPending || redeemCode.length < 8}
            className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/80 text-primary-foreground text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {redeemMutation.isPending
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <RefreshCw className="w-3.5 h-3.5" />
            }
            Resgatar
          </button>
        </div>
      </div>
    </div>
  );
}
