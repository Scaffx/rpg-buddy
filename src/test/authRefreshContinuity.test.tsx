import { act, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Session, User } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { useIsAdmin } from '@/hooks/useIsAdmin';

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  listener: null as ((event: string, session: Session | null) => void) | null,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: {
    getSession: auth.getSession,
    getUser: auth.getUser,
    onAuthStateChange: (listener: (event: string, session: Session | null) => void) => {
      auth.listener = listener;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    },
  } },
}));
vi.mock('@/lib/nativeAuth', () => ({ initDeepLinkAuth: vi.fn() }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const member = (id: string, role = 'user') => ({ id, app_metadata: { role } }) as unknown as User;
const tokenFor = (id: string, seconds: number, overrides: Record<string, unknown> = {}) =>
  `header.${btoa(JSON.stringify({ sub: id, iss: 'https://project.supabase.co/auth/v1', session_id: 'session-a', exp: Math.floor(Date.now() / 1000) + seconds, ...overrides }))}.sig`;
const session = (user: User, token: string) => ({
  user, access_token: token, expires_at: Math.floor(Date.now() / 1000) + 3600,
}) as Session;
const verified = (user: User) => ({ data: { user }, error: null });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let mounts = 0;
let unmounts = 0;

function Scene() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    mounts++;
    return () => { unmounts++; };
  }, []);
  return <section data-testid="scene" style={{ height: 200, overflowY: 'auto' }}>
    <input aria-label="Rascunho" />
    <button onClick={() => setCount(value => value + 1)}>Contar</button>
    <output data-testid="count">{count}</output>
  </section>;
}

function Gate() {
  const { user, session: current, loading, authError, retryAuth } = useAuth();
  const { isAdmin } = useIsAdmin();
  return <>
    <output data-testid="state">{authError ? 'retry' : loading ? 'loading' : user?.id ?? 'guest'}</output>
    <output data-testid="token">{current?.access_token ?? 'none'}</output>
    <output data-testid="admin">{isAdmin ? 'admin' : 'denied'}</output>
    <button data-testid="retry" onClick={retryAuth}>Retry</button>
    {!loading && !authError && user ? <Scene /> : null}
  </>;
}

function read(testId: string) {
  return host!.querySelector(`[data-testid="${testId}"]`)!.textContent;
}

async function mount(initial: Session) {
  auth.getSession.mockResolvedValue({ data: { session: initial }, error: null });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<AuthProvider><Gate /></AuthProvider>));
}

async function event(name: string, next: Session | null) {
  await act(async () => auth.listener!(name, next));
}

async function flush() {
  await act(async () => { await Promise.resolve(); });
}

async function advance(milliseconds: number) {
  await act(async () => vi.advanceTimersByTime(milliseconds));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-26T18:00:00.000Z'));
  auth.getSession.mockReset();
  auth.getUser.mockReset();
  auth.listener = null;
  mounts = 0;
  unmounts = 0;
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
});

describe('TOKEN_REFRESHED sem reset da rota', () => {
  it('preserva cena, rascunho, scroll e foco enquanto confirma o novo token da mesma pessoa', async () => {
    const oldToken = tokenFor('hero', 30);
    const newToken = tokenFor('hero', 90);
    const refresh = deferred<ReturnType<typeof verified>>();
    auth.getUser.mockResolvedValueOnce(verified(member('hero'))).mockReturnValueOnce(refresh.promise);
    await mount(session(member('hero'), oldToken));
    const scene = host!.querySelector<HTMLElement>('[data-testid="scene"]')!;
    const input = scene.querySelector('input')!;
    await act(async () => { scene.querySelector('button')!.click(); input.value = 'rascunho'; input.focus(); scene.scrollTop = 37; });

    await event('TOKEN_REFRESHED', session(member('hero', 'admin'), newToken));
    expect(auth.getUser).toHaveBeenLastCalledWith(newToken);
    expect(read('state')).toBe('hero');
    expect(read('token')).toBe(oldToken);
    expect(read('admin')).toBe('denied');
    expect(host!.querySelector('[data-testid="scene"]')).toBe(scene);
    expect(read('count')).toBe('1');
    expect(input.value).toBe('rascunho');
    expect(scene.scrollTop).toBe(37);
    expect(document.activeElement).toBe(input);
    expect(mounts).toBe(1);
    expect(unmounts).toBe(0);

    refresh.resolve(verified(member('hero')));
    await flush();
    expect(read('state')).toBe('hero');
    expect(read('token')).toBe(newToken);
    expect(read('admin')).toBe('denied');
    expect(host!.querySelector('[data-testid="scene"]')).toBe(scene);
    expect(document.activeElement).toBe(input);
    expect(unmounts).toBe(0);
  });

  it('não deixa duplicatas alongarem o prazo e corta a sessão antiga no vencimento', async () => {
    const oldToken = tokenFor('hero', 20);
    const newToken = tokenFor('hero', 90);
    const refresh = deferred<ReturnType<typeof verified>>();
    auth.getUser.mockResolvedValueOnce(verified(member('hero'))).mockReturnValueOnce(refresh.promise);
    await mount(session(member('hero'), oldToken));
    await event('TOKEN_REFRESHED', session(member('hero'), newToken));
    await advance(10_000);
    await event('TOKEN_REFRESHED', session(member('hero'), newToken));
    expect(auth.getUser).toHaveBeenCalledTimes(2);
    expect(read('state')).toBe('hero');
    await advance(5_000);
    expect(read('state')).toBe('retry');
    expect(read('token')).toBe('none');
    refresh.resolve(verified(member('hero')));
    await flush();
    expect(read('state')).toBe('retry');
  });

  it('troca o prazo somente depois da confirmação e ignora o timer antigo', async () => {
    const oldToken = tokenFor('hero', 3);
    const newToken = tokenFor('hero', 8);
    const refresh = deferred<ReturnType<typeof verified>>();
    auth.getUser.mockResolvedValueOnce(verified(member('hero'))).mockReturnValueOnce(refresh.promise);
    await mount(session(member('hero'), oldToken));
    const scene = host!.querySelector('[data-testid="scene"]');
    await event('TOKEN_REFRESHED', session(member('hero'), newToken));
    await advance(1_000);
    refresh.resolve(verified(member('hero')));
    await flush();
    expect(read('token')).toBe(newToken);
    await advance(2_000);
    expect(read('state')).toBe('hero');
    expect(host!.querySelector('[data-testid="scene"]')).toBe(scene);
    await advance(5_000);
    expect(read('state')).toBe('retry');
  });

  it('corta a continuidade quando o token antigo vence antes da resposta remota', async () => {
    const oldToken = tokenFor('hero', 2);
    const newToken = tokenFor('hero', 90);
    const refresh = deferred<ReturnType<typeof verified>>();
    auth.getUser.mockResolvedValueOnce(verified(member('hero'))).mockReturnValueOnce(refresh.promise);
    await mount(session(member('hero'), oldToken));
    await event('TOKEN_REFRESHED', session(member('hero'), newToken));
    await advance(2_000);
    expect(read('state')).toBe('retry');
    expect(read('token')).toBe('none');
    refresh.resolve(verified(member('hero')));
    await flush();
    expect(read('state')).toBe('retry');
  });

  it('recusa UID diferente mesmo que Auth confirme o UID alegado pelo evento', async () => {
    const oldToken = tokenFor('hero', 30);
    const newToken = tokenFor('other', 90);
    const refresh = deferred<ReturnType<typeof verified>>();
    auth.getUser.mockResolvedValueOnce(verified(member('hero'))).mockReturnValueOnce(refresh.promise);
    await mount(session(member('hero'), oldToken));
    await event('TOKEN_REFRESHED', session(member('other', 'admin'), newToken));
    expect(auth.getUser).toHaveBeenLastCalledWith(newToken);
    expect(read('state')).toBe('loading');
    expect(read('token')).toBe('none');
    expect(host!.querySelector('[data-testid="scene"]')).toBeNull();
    refresh.resolve(verified(member('other', 'admin')));
    await flush();
    expect(read('state')).toBe('retry');
    expect(read('admin')).toBe('denied');
  });

  it.each([
    ['sub diferente com metadata da pessoa anterior', { sub: 'other' }],
    ['outra sessão', { session_id: 'session-b' }],
    ['outro emissor', { iss: 'https://other.supabase.co/auth/v1' }],
    ['session_id ausente', { session_id: undefined }],
    ['iss ausente', { iss: undefined }],
  ])('bloqueia %s antes do getUser e recusa o resultado', async (_label, claims) => {
    const oldToken = tokenFor('hero', 30);
    const candidateToken = tokenFor('hero', 90, claims);
    const refresh = deferred<ReturnType<typeof verified>>();
    auth.getUser.mockResolvedValueOnce(verified(member('hero'))).mockReturnValueOnce(refresh.promise);
    await mount(session(member('hero'), oldToken));
    await event('TOKEN_REFRESHED', session(member('hero', 'admin'), candidateToken));
    expect(auth.getUser).toHaveBeenLastCalledWith(candidateToken);
    expect(read('state')).toBe('loading');
    expect(read('token')).toBe('none');
    expect(host!.querySelector('[data-testid="scene"]')).toBeNull();
    refresh.resolve(verified(member('hero')));
    await flush();
    expect(read('state')).toBe('retry');
    expect(read('admin')).toBe('denied');
  });

  it('bloqueia JWT de outra pessoa mesmo com Session.user falsificado como usuário anterior', async () => {
    const oldToken = tokenFor('hero', 30);
    const otherToken = tokenFor('other', 90);
    const refresh = deferred<ReturnType<typeof verified>>();
    auth.getUser.mockResolvedValueOnce(verified(member('hero'))).mockReturnValueOnce(refresh.promise);
    await mount(session(member('hero'), oldToken));
    await event('TOKEN_REFRESHED', session(member('hero', 'admin'), otherToken));
    expect(read('state')).toBe('loading');
    expect(read('token')).toBe('none');
    expect(read('admin')).toBe('denied');
    expect(host!.querySelector('[data-testid="scene"]')).toBeNull();
    refresh.resolve(verified(member('other', 'admin')));
    await flush();
    expect(read('state')).toBe('retry');
    expect(read('admin')).toBe('denied');
  });

  it('não preserva a rota quando falta session_id no JWT anteriormente confirmado', async () => {
    const oldToken = tokenFor('hero', 30, { session_id: undefined });
    const newToken = tokenFor('hero', 90);
    const refresh = deferred<ReturnType<typeof verified>>();
    auth.getUser.mockResolvedValueOnce(verified(member('hero'))).mockReturnValueOnce(refresh.promise);
    await mount(session(member('hero'), oldToken));
    await event('TOKEN_REFRESHED', session(member('hero'), newToken));
    expect(read('state')).toBe('loading');
    expect(read('token')).toBe('none');
    refresh.resolve(verified(member('hero')));
    await flush();
    expect(read('state')).toBe('retry');
  });

  it('mantém SIGNED_IN de token diferente bloqueado mesmo com o mesmo vínculo', async () => {
    const oldToken = tokenFor('hero', 30);
    const newToken = tokenFor('hero', 90);
    const signIn = deferred<ReturnType<typeof verified>>();
    auth.getUser.mockResolvedValueOnce(verified(member('hero'))).mockReturnValueOnce(signIn.promise);
    await mount(session(member('hero'), oldToken));
    await event('SIGNED_IN', session(member('hero', 'admin'), newToken));
    expect(read('state')).toBe('loading');
    expect(read('token')).toBe('none');
    expect(read('admin')).toBe('denied');
    signIn.resolve(verified(member('hero')));
    await flush();
    expect(read('state')).toBe('hero');
    expect(read('token')).toBe(newToken);
  });

  it('ignora SIGNED_IN tardio do token anterior enquanto a renovação mais recente aguarda', async () => {
    const oldToken = tokenFor('hero', 30);
    const newToken = tokenFor('hero', 90);
    const refresh = deferred<ReturnType<typeof verified>>();
    auth.getUser.mockResolvedValueOnce(verified(member('hero'))).mockReturnValueOnce(refresh.promise);
    await mount(session(member('hero'), oldToken));
    const scene = host!.querySelector('[data-testid="scene"]');
    await event('TOKEN_REFRESHED', session(member('hero'), newToken));
    await event('SIGNED_IN', session(member('hero'), oldToken));
    expect(auth.getUser).toHaveBeenCalledTimes(2);
    expect(read('state')).toBe('hero');
    expect(read('token')).toBe(oldToken);
    expect(host!.querySelector('[data-testid="scene"]')).toBe(scene);
    refresh.resolve(verified(member('hero')));
    await flush();
    expect(read('token')).toBe(newToken);
    expect(host!.querySelector('[data-testid="scene"]')).toBe(scene);
  });

  it('revoga a sessão anterior se a confirmação remota falha', async () => {
    const oldToken = tokenFor('hero', 30);
    const newToken = tokenFor('hero', 90);
    const refresh = deferred<ReturnType<typeof verified>>();
    auth.getUser.mockResolvedValueOnce(verified(member('hero'))).mockReturnValueOnce(refresh.promise);
    await mount(session(member('hero'), oldToken));
    await event('TOKEN_REFRESHED', session(member('hero'), newToken));
    expect(read('state')).toBe('hero');
    refresh.reject(new Error('Auth indisponível'));
    await flush();
    expect(read('state')).toBe('retry');
    expect(read('token')).toBe('none');
    expect(host!.querySelector('[data-testid="scene"]')).toBeNull();
  });

  it('dá precedência ao logout e ignora a confirmação tardia', async () => {
    const oldToken = tokenFor('hero', 30);
    const newToken = tokenFor('hero', 90);
    const refresh = deferred<ReturnType<typeof verified>>();
    auth.getUser.mockResolvedValueOnce(verified(member('hero'))).mockReturnValueOnce(refresh.promise);
    await mount(session(member('hero'), oldToken));
    await event('TOKEN_REFRESHED', session(member('hero'), newToken));
    await event('SIGNED_OUT', null);
    refresh.resolve(verified(member('hero')));
    await flush();
    expect(read('state')).toBe('guest');
    expect(read('token')).toBe('none');
    expect(host!.querySelector('[data-testid="scene"]')).toBeNull();
  });
});
