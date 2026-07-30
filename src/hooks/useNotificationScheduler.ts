import { useCallback, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useProfile, useHealthStats } from './useProfile';
import {
  decideNotification,
  pickMessage,
  detectReactiveTriggers,
  isHpLow,
  isFatigueHigh,
  type NotificationKind,
  type ScheduledRecord,
  type VitalsSnapshot,
} from '@/lib/notifications';

/**
 * Agendador de notificações.
 *
 * Notificação LOCAL, não push: todos os gatilhos são calculáveis com dados que
 * o aparelho já tem, então não há servidor, token nem cron — e funciona offline.
 * Push com FCM só valeria para algo que o aparelho não tem como saber (um evento
 * de portal global, por exemplo).
 *
 * O ciclo é: ao abrir o app, apaga o que estava agendado e reagenda a partir do
 * estado real. Assim, quem bebeu água deixa de receber a cobrança de água — o
 * pior tipo de notificação é a que chega depois de a pessoa já ter feito.
 */

const CHANNEL_ID = 'lifeonrpg-lembretes';
/** Faixa fixa de ids, para nunca colidir com notificação de outra origem. */
const ID_BASE = 4200;

const KIND_IDS: Record<NotificationKind, number> = {
  missions_pending: ID_BASE + 1,
  fatigue_high: ID_BASE + 2,
  hp_low: ID_BASE + 3,
  water: ID_BASE + 4,
  meal: ID_BASE + 5,
  journal_empty: ID_BASE + 6,
};

/** Quando cada categoria faz sentido no dia. Reativas disparam perto de agora. */
const KIND_HOUR: Record<NotificationKind, number | 'soon'> = {
  meal: 12,
  water: 16,
  missions_pending: 20,
  journal_empty: 21,
  fatigue_high: 'soon',
  hp_low: 'soon',
};

function nextOccurrence(hour: number | 'soon', now: Date): Date {
  if (hour === 'soon') return new Date(now.getTime() + 30 * 60_000);
  const d = new Date(now);
  d.setHours(hour, 0, 0, 0);
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
  return d;
}

export function useNotificationScheduler() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { data: health } = useHealthStats();
  const running = useRef(false);
  // Última leitura de vitais, para saber o que MUDOU e não só o que está ruim.
  const prevVitals = useRef<VitalsSnapshot | null>(null);

  const reschedule = useCallback(async () => {
    if (!user || !profile || running.current) return;
    if (!Capacitor.isNativePlatform()) return;
    if ((profile as { notifications_enabled?: boolean }).notifications_enabled === false) return;

    running.current = true;
    try {
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== 'granted') return;

      // Canal Android: sem ele o sistema usa o padrão e a pessoa não consegue
      // ajustar som/importância separado do resto.
      try {
        await LocalNotifications.createChannel({
          id: CHANNEL_ID,
          name: 'Lembretes do herói',
          description: 'Missões, descanso e âncoras do dia',
          importance: 3,
        });
      } catch {
        /* iOS não tem canais */
      }

      // Limpa o que estava agendado: o estado mudou desde a última vez.
      const pendentes = await LocalNotifications.getPending();
      const meus = pendentes.notifications.filter((n) => Object.values(KIND_IDS).includes(n.id));
      if (meus.length > 0) {
        await LocalNotifications.cancel({ notifications: meus.map((n) => ({ id: n.id })) });
      }

      const now = new Date();

      // Gatilhos verdadeiros, a partir do estado real.
      const pending: NotificationKind[] = [];

      const maxHp = Number((health as { max_hp?: number } | undefined)?.max_hp ?? 100);
      const curHp = Number((health as { current_hp?: number } | undefined)?.current_hp ?? maxHp);
      const fatigue = Number((health as { fatigue?: number } | undefined)?.fatigue ?? 0);
      const meals = Number((health as { meals_completed?: number } | undefined)?.meals_completed ?? 0);
      const water = Number((health as { water_completed_ml?: number } | undefined)?.water_completed_ml ?? 0);
      const waterTarget = Number((health as { water_target_ml?: number } | undefined)?.water_target_ml ?? 2000);

      const vitals: VitalsSnapshot = {
        hpRatio: maxHp > 0 ? curHp / maxHp : 1,
        fatigue,
      };
      if (isHpLow(vitals)) pending.push('hp_low');
      if (isFatigueHigh(vitals)) pending.push('fatigue_high');
      if (meals === 0) pending.push('meal');
      if (waterTarget > 0 && water / waterTarget < 0.5) pending.push('water');

      // Reativo: o que CRUZOU o limiar desde a última leitura. Cair no portal
      // deixa o herói com 1 de HP e exausto — esse aviso vale muito mais na
      // hora do que num horário fixo à tarde.
      const urgent = detectReactiveTriggers(prevVitals.current, vitals);
      prevVitals.current = vitals;

      const { count: missoesAbertas } = await supabase
        .from('missions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('completed', false);
      if ((missoesAbertas ?? 0) > 0) pending.push('missions_pending');

      const { data: logRows } = await supabase
        .from('notification_log')
        .select('kind, sent_at')
        .eq('user_id', user.id)
        .gte('sent_at', new Date(now.getTime() - 48 * 3600_000).toISOString())
        .order('sent_at', { ascending: false });

      const history: ScheduledRecord[] = (logRows ?? []).map((r) => ({
        kind: r.kind as NotificationKind,
        sentAt: String(r.sent_at),
      }));

      const decision = decideNotification(
        pending,
        {
          now,
          quiet: {
            sleepTime: (health as { sleep_time?: string } | undefined)?.sleep_time ?? null,
            wakeTime: (health as { wake_time?: string } | undefined)?.wake_time ?? null,
          },
          restMode: Boolean((health as { rest_mode_enabled?: boolean } | undefined)?.rest_mode_enabled),
          history,
          mutedKinds:
            ((profile as { notification_muted_kinds?: string[] } | undefined)?.notification_muted_kinds ??
              []) as NotificationKind[],
        },
        urgent,
      );

      if (!decision.allowed) return;

      const msg = pickMessage(decision.kind, now);
      const at = nextOccurrence(KIND_HOUR[decision.kind], now);

      await LocalNotifications.schedule({
        notifications: [
          {
            id: KIND_IDS[decision.kind],
            title: msg.title,
            body: msg.body,
            channelId: CHANNEL_ID,
            schedule: { at, allowWhileIdle: false },
            extra: { kind: decision.kind },
          },
        ],
      });

      await supabase.from('notification_log').insert({
        user_id: user.id,
        kind: decision.kind,
        sent_at: at.toISOString(),
      });
    } catch (err) {
      // Notificação nunca pode quebrar o app.
      console.warn('[notificacoes] falha ao reagendar:', err);
    } finally {
      running.current = false;
    }
  }, [user, profile, health]);

  useEffect(() => {
    void reschedule();
  }, [reschedule]);

  // Abrir o app pela notificação marca a abertura: é o número que diz se a
  // categoria traz alguém de volta ou só incomoda.
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !user) return;
    const handle = LocalNotifications.addListener('localNotificationActionPerformed', (evt) => {
      const kind = (evt.notification.extra as { kind?: string } | undefined)?.kind;
      if (!kind) return;
      void supabase
        .from('notification_log')
        .update({ opened_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('kind', kind)
        .is('opened_at', null)
        .order('sent_at', { ascending: false })
        .limit(1);
    });
    return () => {
      void handle.then((h) => h.remove());
    };
  }, [user]);

  return { reschedule };
}
