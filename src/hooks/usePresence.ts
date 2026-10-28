import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 15_000;
const MAX_RETRY_MS = 120_000;

type PendingHeartbeat = {
  controller: AbortController;
  timeoutHandle: number | null;
  cancelReason: 'pause' | 'timeout' | null;
};

/**
 * Mantém o usuário com presença online enquanto a aba estiver aberta:
 * faz heartbeat a cada 30s saudáveis atualizando profiles.last_seen_at via RPC.
 * Usa visibilitychange para parar quando a aba está em segundo plano.
 */
export function usePresenceHeartbeat() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  // Um abort pode liquidar após o cleanup; a guarda sobrevive ao replay do efeito em StrictMode.
  const pendingByUser = useRef(new Map<string, PendingHeartbeat>());
  const onSettled = useRef<((id: string, request: PendingHeartbeat, failed: boolean) => void) | null>(null);

  useEffect(() => {
    if (!userId) return;

    let stopped = false;
    let visible = document.visibilityState === 'visible';
    let timerHandle: number | null = null;
    let failures = 0;

    const clearTimer = () => {
      if (timerHandle !== null) {
        window.clearTimeout(timerHandle);
        timerHandle = null;
      }
    };

    const cancelPending = () => {
      const request = pendingByUser.current.get(userId);
      if (!request) return;
      if (request.timeoutHandle !== null) window.clearTimeout(request.timeoutHandle);
      request.timeoutHandle = null;
      request.cancelReason = 'pause';
      request.controller.abort();
    };

    const beat = () => {
      timerHandle = null;
      if (stopped || !visible || pendingByUser.current.has(userId)) return;

      const request: PendingHeartbeat = {
        controller: new AbortController(), timeoutHandle: null, cancelReason: null,
      };
      pendingByUser.current.set(userId, request);
      request.timeoutHandle = window.setTimeout(() => {
        request.timeoutHandle = null;
        request.cancelReason = 'timeout';
        request.controller.abort();
      }, HEARTBEAT_TIMEOUT_MS);

      void (async () => {
        let failed = true;
        try {
          const { error } = await supabase.rpc('update_my_last_seen').abortSignal(request.controller.signal);
          failed = !!error;
        } catch {
          /* heartbeat silencioso */
        } finally {
          if (request.timeoutHandle !== null) window.clearTimeout(request.timeoutHandle);
          if (pendingByUser.current.get(userId) === request) {
            pendingByUser.current.delete(userId);
            onSettled.current?.(userId, request, failed);
          }
        }
      })();
    };

    const schedule = (delay: number) => {
      if (stopped || !visible) return;
      clearTimer();
      timerHandle = window.setTimeout(beat, delay);
    };

    onSettled.current = (settledId, request, failed) => {
      if (settledId !== userId || stopped || !visible) return;
      if (request.cancelReason === 'pause') {
        schedule(0);
      } else if (failed || request.cancelReason === 'timeout') {
        failures = Math.min(failures + 1, 3);
        schedule(Math.min(HEARTBEAT_INTERVAL_MS * 2 ** (failures - 1), MAX_RETRY_MS));
      } else {
        failures = 0;
        schedule(HEARTBEAT_INTERVAL_MS);
      }
    };

    const onVisibility = () => {
      const nowVisible = document.visibilityState === 'visible';
      if (nowVisible === visible) return;
      visible = nowVisible;
      if (visible) beat();
      else {
        clearTimer();
        cancelPending();
      }
    };

    if (visible) beat();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisibility);
      clearTimer();
      cancelPending();
      onSettled.current = null;
    };
  }, [userId]);
}

/**
 * Helper de UI: dado um last_seen_at ISO string, retorna se está online.
 * Online = último heartbeat < 90s atrás (3x interval pra tolerar lag).
 */
export function isOnline(lastSeenAt: string | null | undefined): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < 90_000;
}
