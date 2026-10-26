import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { authDataGate } from '@/lib/authDataGate';
import { initDeepLinkAuth } from '@/lib/nativeAuth';

type Continuity = { promise: Promise<void> | null; resumed: boolean; sequence: number; epoch: number };
interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  authError: boolean;
  continuity: Continuity;
  retryAuth: () => void;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const CONFIRMATION_TIMEOUT_MS = 15_000;

function tokenClaims(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
    const claims: unknown = JSON.parse(atob(padded));
    return claims && typeof claims === 'object' && !Array.isArray(claims)
      ? claims as Record<string, unknown> : null;
  } catch { return null; }
}

function tokenExpiry(token: string): number | null {
  const exp = tokenClaims(token)?.exp;
  return typeof exp === 'number' && Number.isSafeInteger(exp) && exp > 0 && exp <= Number.MAX_SAFE_INTEGER / 1000
    ? exp * 1000 : null;
}

type Binding = { userId: string; issuer: string; sessionId: string };
function bindingFor(token: string, userId: string): Binding | null {
  const claims = tokenClaims(token);
  return claims?.sub === userId && typeof claims.iss === 'string' && !!claims.iss &&
    typeof claims.session_id === 'string' && !!claims.session_id
    ? { userId, issuer: claims.iss, sessionId: claims.session_id } : null;
}
function matchesBinding(token: string, binding: Binding): boolean {
  const candidate = bindingFor(token, binding.userId);
  return !!candidate && candidate.issuer === binding.issuer && candidate.sessionId === binding.sessionId;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [continuity, setContinuity] = useState<Continuity>({ promise: null, resumed: false, sequence: 0, epoch: 0 });
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
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    let deadlineAt: number | null = null;
    let confirmedSession: Session | null = null;
    let confirmedToken: string | null = null;
    let confirmedBinding: Binding | null = null;
    let confirmedExpiry: number | null = null;
    let pending: { token: string; userId: string; version: number } | null = null;
    let hold: { binding: Binding; resolve: () => void; promise: Promise<void> } | null = null;

    const current = (requestVersion: number) => mounted && version === requestVersion;
    const pauseRealtime = () => {
      if (supabase.realtime) authDataGate.pauseRealtime(supabase.realtime);
    };
    const resumeRealtime = (token: string) => {
      if (!supabase.realtime) return;
      authDataGate.resumeRealtime(supabase.realtime, token, () => !!supabase.getChannels?.().length);
    };
    const settleHold = (resumed: boolean) => {
      if (!hold) return;
      const previous = hold;
      hold = null;
      if (mounted) setContinuity(state => ({ promise: null, resumed, sequence: state.sequence + 1, epoch: state.epoch + (resumed ? 0 : 1) }));
      previous.resolve();
    };
    const hideExpired = () => {
      if (!confirmedSession || !confirmedBinding || hold) return;
      let resolve!: () => void;
      const promise = new Promise<void>(done => { resolve = done; });
      hold = { binding: confirmedBinding, promise, resolve };
      setContinuity(state => ({ ...state, promise, resumed: false, sequence: state.sequence + 1 }));
      confirmedSession = null;
      confirmedExpiry = null;
      authDataGate?.expire();
      pauseRealtime();
      setSession(null);
      setUser(null);
      setAuthError(false);
      setLoading(true);
    };
    const fail = (requestVersion: number) => {
      if (!current(requestVersion)) return;
      version += 1;
      clearTimeout(watchdog);
      clearTimeout(expiryTimer);
      deadlineAt = null;
      pending = null;
      confirmedSession = null;
      confirmedBinding = null;
      confirmedToken = null;
      confirmedExpiry = null;
      authDataGate?.clear();
      pauseRealtime();
      settleHold(false);
      setSession(null);
      setUser(null);
      setAuthError(true);
      setLoading(false);
    };
    const armWatchdog = (requestVersion: number, keepDeadline: boolean) => {
      if (!keepDeadline || deadlineAt === null) deadlineAt = Date.now() + CONFIRMATION_TIMEOUT_MS;
      clearTimeout(watchdog);
      watchdog = setTimeout(() => fail(requestVersion), Math.max(0, deadlineAt - Date.now()));
    };
    const watchExpiry = () => {
      clearTimeout(expiryTimer);
      if (confirmedExpiry === null) return;
      const watchedExpiry = confirmedExpiry;
      expiryTimer = setTimeout(() => {
        if (!mounted || confirmedExpiry !== watchedExpiry) return;
        if (document.hidden) return; // Visible-tab event opens a bounded wait.
        if (watchedExpiry > Date.now()) { watchExpiry(); return; }
        if (!confirmedBinding) { fail(version); return; }
        hideExpired();
        if (!pending) armWatchdog(version, false);
      }, Math.max(0, Math.min(watchedExpiry - Date.now(), 2_147_483_647)));
    };
    const accept = (requestVersion: number, next: Session | null, verified: User | null) => {
      if (!current(requestVersion)) return;
      clearTimeout(watchdog);
      deadlineAt = null;
      pending = null;
      confirmedSession = next;
      confirmedToken = next?.access_token ?? null;
      confirmedBinding = next && verified ? bindingFor(next.access_token, verified.id) : null;
      confirmedExpiry = next ? tokenExpiry(next.access_token) : null;
      watchExpiry();
      if (next && confirmedExpiry !== null) {
        authDataGate?.approve(next.access_token, confirmedExpiry);
        resumeRealtime(next.access_token);
      } else {
        authDataGate?.clear();
        pauseRealtime();
      }
      settleHold(!!next);
      setSession(next);
      setUser(verified);
      setAuthError(false);
      setLoading(false);
    };
    const confirm = (candidate: Session, requestVersion: number, keepVisible: boolean, retain: boolean, keepDeadline: boolean, expected: Binding | null, strictBinding: boolean) => {
      if (!current(requestVersion)) return;
      const token = candidate.access_token;
      const claimedUserId = candidate.user?.id;
      if (token) authDataGate?.consider(token);
      pauseRealtime();
      if (!keepVisible) {
        if (retain && !hold) hideExpired();
        if (!retain) {
          if (confirmedSession && !hold) setContinuity(state => ({ ...state, resumed: false, epoch: state.epoch + 1 }));
          settleHold(false);
          confirmedSession = null;
          confirmedBinding = null;
          confirmedToken = null;
          confirmedExpiry = null;
        }
        clearTimeout(expiryTimer);
        authDataGate?.expire();
        setSession(null);
        setUser(null);
        setAuthError(false);
        setLoading(true);
      }
      pending = token && claimedUserId ? { token, userId: claimedUserId, version: requestVersion } : null;
      armWatchdog(requestVersion, keepDeadline);
      // GoTrue holds its auth lock while notifying subscribers.
      queueMicrotask(() => {
        void (async () => {
          try {
            if (!current(requestVersion)) return;
            if (!token || !claimedUserId) throw new Error('Incomplete session identity');
            const result = await supabase.auth.getUser(token);
            if (!current(requestVersion)) return;
            if (result.error) throw result.error;
            const verified = result.data.user;
            if (!verified || verified.id !== claimedUserId) throw new Error('Identity mismatch');
            const expiresAt = tokenExpiry(token);
            if (expiresAt === null || expiresAt <= Date.now()) throw new Error('Expired candidate');
            if (strictBinding && (!expected || verified.id !== expected.userId || !matchesBinding(token, expected))) {
              throw new Error('Refresh binding changed');
            }
            if (hold && (!expected || verified.id !== hold.binding.userId || !matchesBinding(token, hold.binding))) {
              settleHold(false);
            }
            const accepted = keepVisible && confirmedSession?.access_token === token ? confirmedSession : candidate;
            accept(requestVersion, { ...accepted, user: verified }, verified);
          } catch { fail(requestVersion); }
        })();
      });
    };

    authDataGate?.clear();
    pauseRealtime();
    setAuthError(false);
    setLoading(true);
    setSession(null);
    setUser(null);
    initDeepLinkAuth();
    const bootstrapVersion = ++version;
    armWatchdog(bootstrapVersion, false);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      if (!mounted) return;
      if (event === 'INITIAL_SESSION') {
        if (!next || sawNonInitialEvent) return;
      } else sawNonInitialEvent = true;
      const token = next?.access_token;
      const claimedUserId = next?.user?.id;
      if (token && claimedUserId && pending?.version === version && pending.token === token && pending.userId === claimedUserId) return;
      if (event === 'SIGNED_IN' && pending && token === confirmedSession?.access_token && claimedUserId === confirmedBinding?.userId) return;
      if (event === 'SIGNED_IN' && token && token === confirmedToken && confirmedBinding &&
          (hold || (confirmedExpiry !== null && confirmedExpiry <= Date.now()))) {
        if (!hold) {
          hideExpired();
          armWatchdog(version, false);
        }
        return;
      }
      const eventVersion = ++version;
      if (!next) { accept(eventVersion, null, null); return; }
      const expected = hold?.binding ?? confirmedBinding;
      const sameBinding = !!token && !!expected && matchesBinding(token, expected) && claimedUserId === expected.userId;
      const oldValid = confirmedExpiry !== null && confirmedExpiry > Date.now();
      const keepVisible = !!confirmedSession && oldValid && sameBinding &&
        (event === 'TOKEN_REFRESHED' || (event === 'SIGNED_IN' && token === confirmedSession.access_token));
      const retain = sameBinding && (!!hold || !!confirmedSession);
      const strictBinding = event === 'TOKEN_REFRESHED' && (!!confirmedSession || !!hold);
      const keepDeadline = !!hold || !!pending;
      confirm(next, eventVersion, keepVisible, retain, keepDeadline, expected, strictBinding);
    });
    void (async () => {
      try {
        const result = await supabase.auth.getSession();
        if (!current(bootstrapVersion)) return;
        if (result.error) throw result.error;
        if (!result.data.session) { accept(bootstrapVersion, null, null); return; }
        confirm(result.data.session, bootstrapVersion, false, false, true, null, false);
      } catch { fail(bootstrapVersion); }
    })();
    const onVisibility = () => {
      if (document.hidden || !mounted || confirmedExpiry === null) return;
      if (confirmedExpiry <= Date.now()) {
        if (confirmedBinding) {
          hideExpired();
          if (!pending) armWatchdog(version, false);
        } else fail(version);
      } else watchExpiry();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      mounted = false;
      clearTimeout(watchdog);
      clearTimeout(expiryTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      pending = null;
      authDataGate?.clear();
      pauseRealtime();
      settleHold(false);
      subscription.unsubscribe();
    };
  }, [retryCount]);

  const signUp = async (email: string, password: string, displayName?: string) => {
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName || 'Aventureiro' } } });
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
  return <AuthContext.Provider value={{ user, session, loading, authError, continuity, retryAuth, signUp, signIn, signOut }}>
    {children}
  </AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
