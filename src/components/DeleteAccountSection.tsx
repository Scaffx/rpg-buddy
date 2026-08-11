import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const CONFIRMACAO = 'EXCLUIR';

/**
 * Exclusão de conta e dados. Exigência da Google Play para todo app que
 * permite criar conta — precisa existir caminho dentro do app, além da
 * página pública em /excluir-conta.
 *
 * Não é pedido de exclusão: a RPC delete_my_account apaga as linhas de
 * todas as tabelas do usuário, os arquivos no storage e o login, na hora.
 */
export default function DeleteAccountSection() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirmacao, setConfirmacao] = useState('');
  const [excluindo, setExcluindo] = useState(false);

  const podeExcluir = confirmacao.trim().toUpperCase() === CONFIRMACAO && !excluindo;

  /**
   * Apaga os arquivos do usuário pela Storage API.
   *
   * Não dá para fazer isso no SQL: o trigger storage.protect_delete() do
   * Supabase recusa DELETE direto em storage.objects, e como tudo roda numa
   * transação só, a exceção derrubava a exclusão inteira — o usuário recebia
   * erro e nada era apagado.
   *
   * Todo upload do app usa o id do usuário como primeiro segmento do caminho,
   * então listar por esse prefixo cobre avatar, fotos de progresso e exames.
   */
  const apagarArquivos = async (userId: string) => {
    for (const bucket of ['avatars', 'body-photos']) {
      const { data, error } = await supabase.storage.from(bucket).list(userId);
      // Bucket inexistente ou sem permissão não pode travar a exclusão: o que
      // não pode falhar é o apagamento dos dados.
      if (error || !data?.length) continue;
      await supabase.storage
        .from(bucket)
        .remove(data.map((f) => `${userId}/${f.name}`));
    }
  };

  const handleDelete = async () => {
    setExcluindo(true);
    try {
      // Arquivos primeiro: depois da RPC não existe mais sessão para autorizar
      // chamada ao storage.
      if (user?.id) await apagarArquivos(user.id);

      const { error } = await supabase.rpc('delete_my_account' as any);
      if (error) throw error;

      toast.success('Conta excluída', {
        description: 'Seus dados foram apagados. Boa jornada, aventureiro.',
      });

      // A sessão já está órfã — o usuário do auth não existe mais.
      await signOut().catch(() => {});
      navigate('/', { replace: true });
    } catch (e: any) {
      toast.error(e.message || 'Não foi possível excluir a conta');
      setExcluindo(false);
    }
  };

  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-foreground">Excluir minha conta</h3>
          <p className="text-xs text-muted-foreground">
            Apaga em definitivo seu herói, missões, progresso, histórico de saúde, fotos e
            mensagens. Não dá para desfazer e não há como recuperar depois.
          </p>
        </div>
      </div>

      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        Excluir minha conta
      </Button>

      <Dialog open={open} onOpenChange={(v) => !excluindo && setOpen(v)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir a conta de vez?</DialogTitle>
            <DialogDescription>
              Tudo que você construiu vai embora: herói, nível, missões, streak, inventário,
              registros de saúde, fotos de progresso, amizades e conversas. A exclusão é
              imediata e permanente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="confirmar-exclusao" className="text-xs text-muted-foreground">
              Digite <span className="font-bold text-foreground">{CONFIRMACAO}</span> para confirmar
            </Label>
            <Input
              id="confirmar-exclusao"
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
              placeholder={CONFIRMACAO}
              autoComplete="off"
              disabled={excluindo}
            />
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={excluindo}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={!podeExcluir}>
              {excluindo ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Excluindo…
                </>
              ) : (
                'Excluir para sempre'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
