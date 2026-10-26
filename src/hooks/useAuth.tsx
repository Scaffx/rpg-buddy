import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { initDeepLinkAuth } from '@/lib/nativeAuth';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  authError: boolean;
  retryAuth: () => void;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const AUTH_BOOTSTRAP_TIMEOUT_MS = 15_000;

function tokenClaims(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
    const claims: unknown = JSON.parse(atob(padded));
    return claims && typeof claims === 'object' && !Array.isArray(claims)
      ? claims as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function confirmedTokenExpiry(token: string): number | null {
  const exp = tokenClaims(token)?.exp;
  return typeof exp === 'number' && Number.isSafeInteger(exp) && exp > 0 && exp <= Number.MAX_SAFE_INTEGER / 1000
    ? exp * 1000 : null;
}

function sameRefreshBinding(previousToken: string, candidateToken: string, confirmedUserId: string): boolean {
  const previous = tokenClaims(previousToken);
  const candidate = tokenClaims(candidateToken);
  // These unverified claims can deny continuity, never grant it. getUser below
  // remains the authority for the candidate token and its user.
  return !!previous && !!candidate && previous.sub === confirmedUserId && candidate.sub === confirmedUserId &&
    typeof previous.iss === 'string' && previous.iss.length > 0 && candidate.iss === previous.iss &&
    typeof previous.session_id === 'string' && previous.session_id.length > 0 &&
    candidate.session_id === previous.session_id;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const retryAuth = useCallback(() => {
    setSession(null);
    setUser(null);
    setLoading(true);
    setAuthError(false);
    setRetryCount(count => count + 1);
  }, []);

  useEffect(() => {
    let mounted = true;
    let version = 0;
    let sawNonInitialEvent = false;
    let confirmationTimer: ReturnType<typeof setTimeout> | undefined;
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    let confirmedToken: string | null = null;
    let confirmedUserId: string | null = null;
    let confirmedExpiresAt: number | null = null;
    let confirmedSession: Session | null = null;
    let pendingConfirmation: { token: string; userId: string; version: number } | null = null;

    const isCurrent = (requestVersion: number) => mounted && version === requestVersion;
    const clearWatchdog = () => clearTimeout(confirmationTimer);
    const watchConfirmedExpiry = () => {
      clearTimeout(expiryTimer);
      if (!confirmedToken || confirmedExpiresAt === null) return;
      const remaining = confirmedExpiresAt - Date.now();
      expiryTimer = setTimeout(() => {
        if (!mounted) return;
        if (confirmedExpiresAt !== null && confirmedExpiresAt <= Date.now()) {
          failConfirmation(version);
        } else {
          watchConfirmedExpiry();
        }
      }, Math.max(0, Math.min(remaining, 2_147_483_647)));
    };

    const acceptSession = (requestVersion: number, nextSession: Session | null, nextUser: User | null) => {
      if (!isCurrent(requestVersion)) return;
      clearWatchdog();
      pendingConfirmation = null;
      confirmedSession = nextSession;
      confirmedToken = nextSession?.access_token ?? null;
      confirmedUserId = nextUser?.id ?? null;
      // Read exp only after getUser confirmed these exact token bytes.
      confirmedExpiresAt = confirmedToken ? confirmedTokenExpiry(confirmedToken) : null;
      // Auth may retry refresh silently; expiry cannot depend on another event.
      watchConfirmedExpiry();
      setSession(nextSession);
      setUser(nextUser);
      setAuthError(false);
      setLoading(false);
    };

    const failConfirmation = (requestVersion: number) => {
      if (!isCurrent(requestVersion)) return;
      clearWatchdog();
      version += 1; // A failed request must never restore access later.
      clearTimeout(expiryTimer);
      pendingConfirmation = null;
      confirmedSession = null;
      confirmedToken = null;
      confirmedUserId = null;
      confirmedExpiresAt = null;
      // Do not sign out or touch stored credentials on a transient auth failure.
      setSession(null);
      setUser(null);
      setAuthError(true);
      setLoading(false);
    };

    const armWatchdog = (requestVersion: number, deadline = AUTH_BOOTSTRAP_TIMEOUT_MS) => {
      clearWatchdog();
      confirmationTimer = setTimeout(() => failConfirmation(requestVersion), Math.min(AUTH_BOOTSTRAP_TIMEOUT_MS, deadline));
    };

    const confirmSession = (
      candidate: Session,
      requestVersion: number,
      resetWatchdog: boolean,
      keepVisible = false,
      expectedRefreshUserId: string | null = null,
      refreshBindingValid = true,
    ) => {
      if (!isCurrent(requestVersion)) return;
      const token = candidate.access_token;
      const claimedUserId = candidate.user?.id;
      if (!keepVisible) {
        // A new session may originate from storage; hide it until Auth confirms it.
        confirmedSession = null;
        confirmedToken = null;
        confirmedUserId = null;
        confirmedExpiresAt = null;
        clearTimeout(expiryTimer);
        setSession(null);
        setUser(null);
        setAuthError(false);
        setLoading(true);
      }
      pendingConfirmation = token && claimedUserId ? { token, userId: claimedUserId, version: requestVersion } : null;
      if (resetWatchdog) armWatchdog(requestVersion, keepVisible ? confirmedExpiresAt! - Date.now() : AUTH_BOOTSTRAP_TIMEOUT_MS);

      // GoTrue awaits its subscribers while holding the auth lock. Defer the
      // network request until the synchronous callback has returned.
      queueMicrotask(() => {
        void (async () => {
          try {
            if (!isCurrent(requestVersion)) return;
            if (!token || !claimedUserId) throw new Error('Session identity is incomplete');
            const result = await supabase.auth.getUser(token);
            if (!isCurrent(requestVersion)) return;
            if (result.error) throw result.error;
            const verifiedUser = result.data.user;
            if (!verifiedUser || verifiedUser.id !== claimedUserId) {
              throw new Error('Session user could not be confirmed');
            }
            if (expectedRefreshUserId && verifiedUser.id !== expectedRefreshUserId) {
              throw new Error('Refreshed session changed identity');
            }
            if (!refreshBindingValid) {
              throw new Error('Refreshed session changed binding');
            }
            const tokenExpiry = confirmedTokenExpiry(token);
            if (tokenExpiry !== null && tokenExpiry <= Date.now()) {
              throw new Error('Session token expired');
            }
            if (keepVisible && confirmedExpiresAt !== null && confirmedExpiresAt <= Date.now()) {
              throw new Error('Confirmed session expired during revalidation');
            }
            // Focus revalidation keeps the exact confirmed session; a renewed
            // token becomes visible only after Auth has verified its own bytes.
            const acceptedSession = keepVisible && token === confirmedToken && confirmedSession
              ? confirmedSession : candidate;
            acceptSession(requestVersion, { ...acceptedSession, user: verifiedUser }, verifiedUser);
          } catch {
            failConfirmation(requestVersion);
          }
        })();
      });
    };

    setAuthError(false);
    setLoading(true);
    setSession(null);
    setUser(null);

    // 0) No app, o retorno do OAuth chega por deep link. Registrar aqui garante
    //    que o listener exista antes de qualquer tela de login montar — se o
    //    Android reabrir o app pelo link, o evento não se perde.
    //    A sessão resultante entra pelo onAuthStateChange abaixo.
    initDeepLinkAuth();

    const bootstrapVersion = ++version;
    armWatchdog(bootstrapVersion);

    // Subscribe before the initial read; every session event requires remote
    // confirmation because SIGNED_IN can also come from persisted storage.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      if (event === 'INITIAL_SESSION') {
        if (!nextSession || sawNonInitialEvent) return;
      } else {
        sawNonInitialEvent = true;
      }
      const token = nextSession?.access_token;
      const claimedUserId = nextSession?.user?.id;
      if (token && claimedUserId && pendingConfirmation?.version === version &&
          pendingConfirmation.token === token && pendingConfirmation.userId === claimedUserId &&
          (!confirmedToken || (confirmedExpiresAt !== null && confirmedExpiresAt > Date.now()))) {
        // Focus can re-emit the same pending session. Keep its original deadline and result.
        return;
      }
      if (event === 'SIGNED_IN' && pendingConfirmation?.version === version &&
          pendingConfirmation.token !== confirmedToken && token === confirmedToken &&
          claimedUserId === confirmedUserId && confirmedExpiresAt !== null && confirmedExpiresAt > Date.now()) {
        // A delayed focus notification must not supersede a newer refresh.
        return;
      }
      const expectedRefreshUserId = event === 'TOKEN_REFRESHED' ? confirmedUserId : null;
      const refreshBindingValid = event !== 'TOKEN_REFRESHED' || !confirmedToken || !confirmedUserId ||
        (!!token && sameRefreshBinding(confirmedToken, token, confirmedUserId));
      const keepVisible = (event === 'TOKEN_REFRESHED' || (event === 'SIGNED_IN' && token === confirmedToken)) &&
        !!token && !!claimedUserId && !!confirmedToken && claimedUserId === confirmedUserId &&
        confirmedExpiresAt !== null && confirmedExpiresAt > Date.now() && refreshBindingValid;
      const eventVersion = ++version;
      if (!nextSession) {
        acceptSession(eventVersion, null, null);
        return;
      }
      confirmSession(nextSession, eventVersion, true, keepVisible, expectedRefreshUserId, refreshBindingValid);
    });

    // getSession reads storage; its user gets the same confirmation as events.
    void (async () => {
      try {
        const sessionResult = await supabase.auth.getSession();
        if (!isCurrent(bootstrapVersion)) return;
        if (sessionResult.error) throw sessionResult.error;

        const initialSession = sessionResult.data.session;
        if (!initialSession) {
          acceptSession(bootstrapVersion, null, null);
          return;
        }
        confirmSession(initialSession, bootstrapVersion, false);
      } catch {
        failConfirmation(bootstrapVersion);
      }
    })();

    return () => {
      mounted = false;
      clearWatchdog();
      clearTimeout(expiryTimer);
      subscription.unsubscribe();
    };
  }, [retryCount]);

  const signUp = async (email: string, password: string, displayName?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName || 'Aventureiro' } },
    });
    if (error) throw error;
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, authError, retryAuth, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
