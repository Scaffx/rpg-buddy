import { useEffect, useState } from "react";
import { Download, AlertTriangle, X, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAppUpdate } from "@/hooks/useAppUpdate";
import { APP_VERSION } from "@/lib/version";
import { Capacitor } from "@capacitor/core";

const DISMISS_KEY = "lifeonrpg_update_dismissed_for";

/**
 * Modal global de atualização do APK.
 * - Aparece para qualquer versão nova (após 800ms para não brigar com o load inicial).
 * - Se `is_mandatory=true`, não pode ser fechado.
 * - Se opcional, o usuário pode dispensar até reabrir o app (sessionStorage).
 */
export function AppUpdateModal() {
  const { latest, hasUpdate, isMandatory, isLoading } = useAppUpdate();
  const [open, setOpen] = useState(false);
  const [show, setShow] = useState(false);

  // Na web não exibimos modal de atualização — só relevante no APK nativo
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    const t = setTimeout(() => setShow(true), 800);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!isNative || !hasUpdate || !latest || isLoading || !show) return;
    if (isMandatory) {
      setOpen(true);
      return;
    }
    const dismissedFor = sessionStorage.getItem(DISMISS_KEY);
    if (dismissedFor === latest.version) return;
    setOpen(true);
  }, [isNative, hasUpdate, isMandatory, latest, isLoading, show]);

  if (!isNative || !latest || !hasUpdate) return null;

  const handleDownload = () => {
    if (latest.apk_url && latest.apk_url !== "#") {
      window.open(latest.apk_url, "_blank", "noopener,noreferrer");
    }
  };

  const handleDismiss = () => {
    if (isMandatory) return;
    sessionStorage.setItem(DISMISS_KEY, latest.version);
    setOpen(false);
  };

  const apkReady = latest.apk_url && latest.apk_url !== "#";

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleDismiss();
        else setOpen(true);
      }}
    >
      <DialogContent
        className="sm:max-w-md border-primary/40 bg-card/95 backdrop-blur"
        onInteractOutside={(e) => isMandatory && e.preventDefault()}
        onEscapeKeyDown={(e) => isMandatory && e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center justify-between">
            <Badge
              variant="outline"
              className="border-primary/50 bg-primary/10 text-primary"
            >
              <Sparkles className="h-3 w-3 mr-1" />
              {isMandatory ? "Atualização obrigatória" : "Nova versão"}
            </Badge>
            {!isMandatory && (
              <button
                type="button"
                onClick={handleDismiss}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <DialogTitle className="font-cinzel text-xl pt-2">
            {isMandatory && <AlertTriangle className="inline h-5 w-5 mr-1 text-destructive" />}
            LifeonRPG v{latest.version} disponível!
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Você está na versão <strong>v{APP_VERSION}</strong>. Baixe a nova versão para
            aproveitar as últimas melhorias do herói.
          </DialogDescription>
        </DialogHeader>

        {latest.changelog && (
          <div className="rounded-lg border border-border/60 bg-background/50 p-3 text-sm whitespace-pre-line max-h-48 overflow-y-auto">
            {latest.changelog}
          </div>
        )}

        <div className="flex flex-col gap-2 pt-2">
          {apkReady ? (
            <Button onClick={handleDownload} className="w-full" size="lg">
              <Download className="h-4 w-4 mr-2" />
              Baixar APK v{latest.version}
            </Button>
          ) : (
            <Button disabled className="w-full" size="lg" variant="secondary">
              APK em preparação — aguarde publicação
            </Button>
          )}
          {!isMandatory && (
            <Button onClick={handleDismiss} variant="ghost" size="sm">
              Lembrar mais tarde
            </Button>
          )}
          {isMandatory && (
            <p className="text-xs text-center text-destructive">
              Esta atualização é obrigatória para continuar usando o app.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
