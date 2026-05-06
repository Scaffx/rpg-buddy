import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Mantém o usuário com presença online enquanto a aba estiver aberta:
 * faz heartbeat a cada 30s atualizando profiles.last_seen_at via RPC.
 * Usa visibilitychange para parar quando a aba está em segundo plano.
 */
export function usePresenceHeartbeat() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    let intervalHandle: number | null = null;

    const beat = async () => {
      try {
        await (supabase.rpc as any)('update_my_last_seen');
      } catch {
        /* heartbeat silencioso */
      }
    };

    const start = () => {
      if (intervalHandle != null) return;
      beat();
      intervalHandle = window.setInterval(beat, HEARTBEAT_INTERVAL_MS);
    };

    const stop = () => {
      if (intervalHandle != null) {
        window.clearInterval(intervalHandle);
        intervalHandle = null;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') start();
      else stop();
    };

    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    };
  }, [user]);
}

/**
 * Helper de UI: dado um last_seen_at ISO string, retorna se está online.
 * Online = último heartbeat < 90s atrás (3x interval pra tolerar lag).
 */
export function isOnline(lastSeenAt: string | null | undefined): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < 90_000;
}
