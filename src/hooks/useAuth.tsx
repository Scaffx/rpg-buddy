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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const retryAuth = useCallback(() => setRetryCount(count => count + 1), []);

  useEffect(() => {
    let mounted = true;
    let version = 0;
    let sawNonInitialEvent = false;
    let confirmationTimer: ReturnType<typeof setTimeout> | undefined;

    const isCurrent = (requestVersion: number) => mounted && version === requestVersion;
    const clearWatchdog = () => clearTimeout(confirmationTimer);

    const acceptSession = (requestVersion: number, nextSession: Session | null, nextUser: User | null) => {
      if (!isCurrent(requestVersion)) return;
      clearWatchdog();
      setSession(nextSession);
      setUser(nextUser);
      setAuthError(false);
      setLoading(false);
    };

    const failConfirmation = (requestVersion: number) => {
      if (!isCurrent(requestVersion)) return;
      clearWatchdog();
      version += 1; // A failed request must never restore access later.
      // Do not sign out or touch stored credentials on a transient auth failure.
      setSession(null);
      setUser(null);
      setAuthError(true);
      setLoading(false);
    };

    const armWatchdog = (requestVersion: number) => {
      clearWatchdog();
      confirmationTimer = setTimeout(() => failConfirmation(requestVersion), AUTH_BOOTSTRAP_TIMEOUT_MS);
    };

    const confirmSession = (candidate: Session, requestVersion: number, resetWatchdog: boolean) => {
      if (!isCurrent(requestVersion)) return;
      // A session event may originate from storage. Hide its user until Auth
      // confirms the token and identity, including on SIGNED_IN and refresh.
      setSession(null);
      setUser(null);
      setAuthError(false);
      setLoading(true);
      if (resetWatchdog) armWatchdog(requestVersion);

      // GoTrue awaits its subscribers while holding the auth lock. Defer the
      // network request until the synchronous callback has returned.
      queueMicrotask(() => {
        void (async () => {
          try {
            if (!isCurrent(requestVersion)) return;
            const token = candidate.access_token;
            const claimedUserId = candidate.user?.id;
            if (!token || !claimedUserId) throw new Error('Session identity is incomplete');
            const result = await supabase.auth.getUser(token);
            if (!isCurrent(requestVersion)) return;
            if (result.error) throw result.error;
            const verifiedUser = result.data.user;
            if (!verifiedUser || verifiedUser.id !== claimedUserId) {
              throw new Error('Session user could not be confirmed');
            }
            acceptSession(requestVersion, { ...candidate, user: verifiedUser }, verifiedUser);
          } catch {
            failConfirmation(requestVersion);
          }
        })();
      });
    };

    setAuthError(false);
    setLoading(true);

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
      const eventVersion = ++version;
      if (!nextSession) {
        acceptSession(eventVersion, null, null);
        return;
      }
      confirmSession(nextSession, eventVersion, true);
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
