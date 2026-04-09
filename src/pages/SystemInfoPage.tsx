import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AppLayout from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollText, Lightbulb, Loader2, MessageSquarePlus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

function useSystemUpdateLogs() {
  return useQuery({
    queryKey: ['system-update-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_update_logs' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });
}

function useMyFeedback() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['system-feedback', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_feedback' as any)
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!user,
  });
}

function useAdminFeedback() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['system-feedback-admin', user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('list_system_feedback_admin');
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!user,
    retry: false,
  });
}

export default function SystemInfoPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: logs, isLoading: loadingLogs } = useSystemUpdateLogs();
  const { data: feedbackList, isLoading: loadingFeedback } = useMyFeedback();
  const { data: adminFeedback, isLoading: loadingAdminFeedback, isError: adminFeedbackDenied } = useAdminFeedback();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [updatingFeedbackId, setUpdatingFeedbackId] = useState<string | null>(null);

  const createFeedback = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Não autenticado');
      if (!title.trim() || !message.trim()) {
        throw new Error('Preencha título e sugestão.');
      }

      const { error } = await supabase.from('system_feedback' as any).insert({
        user_id: user.id,
        title: title.trim(),
        message: message.trim(),
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      setTitle('');
      setMessage('');
      queryClient.invalidateQueries({ queryKey: ['system-feedback'] });
      toast({ title: 'Sugestão enviada', description: 'Sua sugestão ficou salva para análise depois.' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao enviar', description: error.message, variant: 'destructive' });
    },
  });

  const updateFeedbackStatus = useMutation({
    mutationFn: async ({ feedbackId, status }: { feedbackId: string; status: string }) => {
      setUpdatingFeedbackId(feedbackId);
      const { error } = await (supabase.rpc as any)('update_system_feedback_status', {
        feedback_id: feedbackId,
        next_status: status,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-feedback-admin'] });
      toast({ title: 'Status atualizado', description: 'Feedback atualizado com sucesso.' });
      setUpdatingFeedbackId(null);
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao atualizar', description: error.message, variant: 'destructive' });
      setUpdatingFeedbackId(null);
    },
  });

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-primary text-glow">Informações do Sistema</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Consulte atualizações recentes e envie ideias de melhoria para o sistema.
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.25fr_0.9fr] gap-6">
          <section className="bg-card border border-border rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <ScrollText className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-bold text-foreground">Logs de atualização</h2>
            </div>

            {loadingLogs ? (
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            ) : (logs || []).length > 0 ? (
              <div className="space-y-3">
                {(logs || []).map((log: any) => (
                  <div
                    key={log.id}
                    className={`rounded-lg border p-4 ${log.is_highlighted ? 'bg-primary/10 border-primary/30' : 'bg-muted/20 border-border'}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-bold text-foreground">{log.title}</p>
                        <p className="text-xs text-muted-foreground">{log.version_tag} • {new Date(log.created_at).toLocaleDateString('pt-BR')}</p>
                      </div>
                      {log.is_highlighted && (
                        <span className="text-[10px] px-2 py-1 rounded-full border border-primary/40 text-primary bg-primary/10">
                          Destaque
                        </span>
                      )}
                    </div>
                    {log.summary && <p className="text-sm text-foreground mt-3">{log.summary}</p>}
                    {log.details && <p className="text-xs text-muted-foreground mt-2">{log.details}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum log de atualização disponível.</p>
            )}
          </section>

          <section className="space-y-6">
            <div className="bg-card border border-border rounded-xl p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-yellow-400" />
                <h2 className="text-lg font-bold text-foreground">Sugira melhorias</h2>
              </div>

              <div className="space-y-3">
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Título da sugestão"
                />
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Descreva sua ideia, bug ou melhoria que você gostaria de ver no sistema"
                  className="min-h-32"
                />
                <Button
                  onClick={() => createFeedback.mutate()}
                  disabled={createFeedback.isPending}
                  className="w-full gap-2"
                >
                  {createFeedback.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquarePlus className="w-4 h-4" />}
                  Enviar sugestão
                </Button>
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-6 space-y-4">
              <h2 className="text-base font-bold text-foreground">Suas sugestões enviadas</h2>
              {loadingFeedback ? (
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              ) : (feedbackList || []).length > 0 ? (
                <div className="space-y-3">
                  {(feedbackList || []).map((item: any) => (
                    <div key={item.id} className="rounded-lg border border-border bg-muted/20 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-foreground">{item.title}</p>
                          <p className="text-xs text-muted-foreground mt-1">{new Date(item.created_at).toLocaleString('pt-BR')}</p>
                        </div>
                        <span className="text-[10px] px-2 py-1 rounded-full border border-border text-muted-foreground uppercase">
                          {item.status}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-3">{item.message}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Você ainda não enviou nenhuma sugestão.</p>
              )}
            </div>

            {!adminFeedbackDenied && (
              <div className="bg-card border border-border rounded-xl p-6 space-y-4">
                <h2 className="text-base font-bold text-foreground">Painel administrativo de sugestões</h2>
                <p className="text-xs text-muted-foreground">
                  Visível para contas com `app_metadata.role = admin` no Supabase Auth.
                </p>
                {loadingAdminFeedback ? (
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                ) : (adminFeedback || []).length > 0 ? (
                  <div className="space-y-3">
                    {(adminFeedback || []).map((item: any) => (
                      <div key={item.id} className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-foreground">{item.title}</p>
                            <p className="text-xs text-muted-foreground mt-1">Usuário: {item.user_id}</p>
                            <p className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString('pt-BR')}</p>
                          </div>
                          <span className="text-[10px] px-2 py-1 rounded-full border border-border text-muted-foreground uppercase">
                            {item.status}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">{item.message}</p>
                        <div className="flex gap-2">
                          {['novo', 'avaliando', 'planejado', 'feito'].map((status) => (
                            <Button
                              key={status}
                              size="sm"
                              variant="outline"
                              disabled={updatingFeedbackId === item.id || item.status === status}
                              onClick={() => updateFeedbackStatus.mutate({ feedbackId: item.id, status })}
                            >
                              {status}
                            </Button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhuma sugestão recebida ainda.</p>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
