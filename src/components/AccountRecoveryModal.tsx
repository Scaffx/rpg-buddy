import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, User, Sword, Star } from "lucide-react";

interface OrphanedProfile {
  old_user_id: string;
  display_name: string;
  level: number;
  total_xp: number;
  avatar_url: string | null;
}

interface AccountRecoveryModalProps {
  open: boolean;
  onClose: () => void;
}

export function AccountRecoveryModal({ open, onClose }: AccountRecoveryModalProps) {
  const [profiles, setProfiles] = useState<OrphanedProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState<string | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase
      .rpc("get_orphaned_profiles")
      .then(({ data, error }) => {
        if (error) console.error("get_orphaned_profiles:", error);
        setProfiles((data as OrphanedProfile[]) ?? []);
        setLoading(false);
      });
  }, [open]);

  const handleRecover = async (oldUserId: string) => {
    if (!user) return;
    setRecovering(oldUserId);
    try {
      const { data, error } = await supabase.functions.invoke("recover-account", {
        body: { old_user_id: oldUserId },
      });

      if (error) {
        // Extrair mensagem real do corpo da resposta (supabase-js esconde atrás de FunctionsHttpError)
        let msg = error.message;
        try {
          const body = await (error as any).context?.json?.();
          if (body?.error) msg = body.error;
        } catch { /* ignora erro de parse */ }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);

      toast({
        title: "Conta recuperada!",
        description: "Seus dados foram restaurados com sucesso.",
      });

      // Invalidar todas as queries para forçar reload dos dados
      await queryClient.invalidateQueries();
      onClose();
      window.location.reload();
    } catch (err: any) {
      toast({
        title: "Erro na recuperação",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setRecovering(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            <Sword className="w-5 h-5" />
            Recuperar Conta Antiga
          </DialogTitle>
          <DialogDescription>
            Encontramos perfis do servidor anterior. Selecione o seu para recuperar
            todo o progresso (level, XP, missões, inventário, etc.).
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : profiles.length === 0 ? (
            <p className="text-center text-muted-foreground py-6 text-sm">
              Nenhum perfil antigo disponível para recuperação.
            </p>
          ) : (
            profiles.map((p) => (
              <div
                key={p.old_user_id}
                className="flex items-center gap-3 p-3 rounded-lg border border-border bg-secondary/30 hover:bg-secondary/60 transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center flex-shrink-0">
                  {p.avatar_url ? (
                    <img src={p.avatar_url} alt={p.display_name} className="w-full h-full rounded-full object-cover" />
                  ) : (
                    <User className="w-5 h-5 text-primary" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground truncate">{p.display_name}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Star className="w-3 h-3 text-yellow-500" />
                    <span>Nível {p.level}</span>
                    <span>·</span>
                    <span>{p.total_xp.toLocaleString()} XP</span>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleRecover(p.old_user_id)}
                  disabled={recovering !== null}
                  className="flex-shrink-0"
                >
                  {recovering === p.old_user_id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Sou eu"
                  )}
                </Button>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={recovering !== null}>
            Começar do zero
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
