import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useAppPermissions } from '@/hooks/useAppPermissions';
import { KIND_PRIORITY, MAX_PER_DAY, type NotificationKind } from '@/lib/notifications';

/**
 * Ajustes de notificação, por categoria.
 *
 * Existir separado por categoria não é capricho: sem isso, quem se incomoda com
 * UM tipo de aviso desliga TODOS — e aí o canal se perde inteiro. Poder calar só
 * a cobrança de água mantém o resto vivo.
 */

const LABELS: Record<NotificationKind, { title: string; desc: string }> = {
  missions_pending: { title: 'Missões do dia', desc: 'Quando ainda há missão em aberto' },
  fatigue_high: { title: 'Exaustão', desc: 'Quando a fadiga sobe demais' },
  hp_low: { title: 'Vida baixa', desc: 'Quando o herói volta ferido' },
  water: { title: 'Hidratação', desc: 'Quando o consumo de água está atrasado' },
  meal: { title: 'Refeições', desc: 'Quando nenhuma refeição foi registrada' },
  journal_empty: { title: 'Diário vazio', desc: 'Quando o dia passou sem nenhum registro' },
};

export default function NotificationSettings() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const { notifications: permission, isNative, requestNotifications } = useAppPermissions();

  const enabled = (profile as { notifications_enabled?: boolean } | undefined)?.notifications_enabled !== false;
  const muted = ((profile as { notification_muted_kinds?: string[] } | undefined)?.notification_muted_kinds ??
    []) as NotificationKind[];

  const save = useMutation({
    mutationFn: async (patch: { notifications_enabled?: boolean; notification_muted_kinds?: string[] }) => {
      if (!user) throw new Error('Não autenticado');
      const { error } = await supabase.from('profiles').update(patch as never).eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile'] }),
    onError: () => toast.error('Não foi possível salvar agora.'),
  });

  const toggleKind = (kind: NotificationKind) => {
    const next = muted.includes(kind) ? muted.filter((k) => k !== kind) : [...muted, kind];
    save.mutate({ notification_muted_kinds: next });
  };

  return (
    <div className="p-4 pt-0 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-2">
          {enabled ? (
            <Bell className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          ) : (
            <BellOff className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          )}
          <div>
            <p className="text-sm font-semibold text-foreground">Lembretes</p>
            <p className="text-[11px] text-muted-foreground">
              No máximo {MAX_PER_DAY} por dia, e nunca durante seu horário de sono.
            </p>
          </div>
        </div>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => save.mutate({ notifications_enabled: e.target.checked })}
          disabled={save.isPending}
          className="h-4 w-4 accent-primary cursor-pointer mt-1 shrink-0"
        />
      </div>

      {/* O app pode estar com os lembretes ligados e mesmo assim mudo, se a
          permissão do sistema foi negada. Dizer isso evita a impressão de que
          o ajuste não funciona. */}
      {enabled && isNative && permission !== 'granted' && (
        <button
          onClick={() => void requestNotifications()}
          className="w-full text-left rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2"
        >
          <p className="text-[11px] text-amber-300 font-semibold">
            O sistema está bloqueando os lembretes
          </p>
          <p className="text-[10px] text-amber-200/80">
            {permission === 'denied'
              ? 'Libere as notificações do LifeOnRPG nos ajustes do aparelho.'
              : 'Tocar aqui para permitir.'}
          </p>
        </button>
      )}

      {enabled && (
        <div className="space-y-1.5 pl-6">
          {KIND_PRIORITY.map((kind) => {
            const on = !muted.includes(kind);
            return (
              <label
                key={kind}
                className="flex items-center justify-between gap-3 cursor-pointer py-0.5"
              >
                <span>
                  <span className="text-xs text-foreground">{LABELS[kind].title}</span>
                  <span className="block text-[10px] text-muted-foreground">{LABELS[kind].desc}</span>
                </span>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggleKind(kind)}
                  disabled={save.isPending}
                  className="h-3.5 w-3.5 accent-primary cursor-pointer shrink-0"
                />
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
