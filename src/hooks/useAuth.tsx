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
    let freshEventVersion = 0;
    const startedAtVersion = freshEventVersion;
    let bootstrapTimedOut = false;

    const acceptSession = (nextSession: Session | null, nextUser: User | null) => {
      if (!mounted) return;
      setSession(nextSession);
      setUser(nextUser);
      setAuthError(false);
      setLoading(false);
    };

    const failConfirmation = () => {
      if (!mounted) return;
      // Do not sign out or touch stored credentials on a transient auth failure.
      setSession(null);
      setUser(null);
      setAuthError(true);
      setLoading(false);
    };

    setAuthError(false);
    setLoading(true);

    // 0) No app, o retorno do OAuth chega por deep link. Registrar aqui garante
    //    que o listener exista antes de qualquer tela de login montar — se o
    //    Android reabrir o app pelo link, o evento não se perde.
    //    A sessão resultante entra pelo onAuthStateChange abaixo.
    initDeepLinkAuth();

    const bootstrapTimer = setTimeout(() => {
      if (!mounted || freshEventVersion !== startedAtVersion) return;
      bootstrapTimedOut = true;
      failConfirmation();
    }, AUTH_BOOTSTRAP_TIMEOUT_MS);

    // Subscribe before the initial read so fresh login/logout events can win it.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted || event === 'INITIAL_SESSION') return;
      freshEventVersion += 1;
      clearTimeout(bootstrapTimer);
      acceptSession(nextSession, nextSession?.user ?? null);
    });

    // getSession reads storage. Confirm its user once with the Auth server before
    // exposing app_metadata to the UI; never call Auth methods inside the listener.
    void (async () => {
      try {
        const sessionResult = await supabase.auth.getSession();
        if (!mounted || bootstrapTimedOut || freshEventVersion !== startedAtVersion) return;
        if (sessionResult.error) throw sessionResult.error;

        const initialSession = sessionResult.data.session;
        if (!initialSession) {
          acceptSession(null, null);
          return;
        }
        if (!initialSession.access_token) {
          throw new Error('Session token could not be confirmed');
        }

        const userResult = await supabase.auth.getUser(initialSession.access_token);
        if (!mounted || bootstrapTimedOut || freshEventVersion !== startedAtVersion) return;
        if (userResult.error) throw userResult.error;
        const verifiedUser = userResult.data.user;
        if (!verifiedUser || verifiedUser.id !== initialSession.user.id) {
          throw new Error('Session user could not be confirmed');
        }
        acceptSession({ ...initialSession, user: verifiedUser }, verifiedUser);
      } catch {
        if (!bootstrapTimedOut && freshEventVersion === startedAtVersion) failConfirmation();
      } finally {
        clearTimeout(bootstrapTimer);
      }
    })();

    return () => {
      mounted = false;
      clearTimeout(bootstrapTimer);
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
