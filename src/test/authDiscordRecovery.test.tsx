import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import Auth from '@/pages/Auth';

const discord = vi.hoisted(() => ({
  signIn: vi.fn<() => Promise<void>>(),
  native: false,
}));

vi.mock('@/lib/nativeAuth', () => ({
  signInWithDiscord: discord.signIn,
  isNative: () => discord.native,
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ signIn: vi.fn(), signUp: vi.fn() }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: {} } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function renderAuth() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<Auth />));
  return host;
}

function discordButton() {
  return host!.querySelector<HTMLButtonElement>('[data-testid="discord-login"]')!;
}

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.useFakeTimers();
  discord.native = false;
  discord.signIn.mockReset();
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('recuperação do login Discord', () => {
  it('libera retry e mostra erro persistente quando a web não navega', async () => {
    discord.signIn.mockResolvedValue(undefined);
    renderAuth();
    await act(async () => discordButton().click());
    expect(discordButton().disabled).toBe(true);
    await act(async () => vi.advanceTimersByTime(15_000));
    expect(discordButton().disabled).toBe(false);
    expect(host!.querySelector('[role="alert"]')?.textContent).toContain('app.auth.discord_timeout');
    expect(discordButton().textContent).toContain('app.auth.discord_retry');
  });

  it('bloqueia cliques concorrentes e ignora uma rejeição antiga após retry', async () => {
    const old = deferred();
    const current = deferred();
    discord.signIn.mockImplementationOnce(() => old.promise).mockImplementationOnce(() => current.promise);
    renderAuth();
    act(() => { discordButton().click(); discordButton().click(); });
    expect(discord.signIn).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTime(15_000));
    act(() => discordButton().click());
    expect(discord.signIn).toHaveBeenCalledTimes(2);
    await act(async () => old.reject(new Error('https://callback/#access_token=secret')));
    expect(discordButton().disabled).toBe(true);
    expect(host!.querySelector('[role="status"]')?.textContent).toContain('app.auth.discord_waiting');
    await act(async () => current.reject(new Error('upstream request timeout')));
    expect(discordButton().disabled).toBe(false);
    expect(host!.querySelector('[role="alert"]')?.textContent).toContain('app.auth.discord_failed');
    expect(host!.textContent).not.toContain('access_token');
    expect(host!.textContent).not.toContain('upstream request timeout');
  });

  it('libera após cancelar a espera e após voltar sem conclusão', async () => {
    const first = deferred();
    const second = deferred();
    discord.signIn.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
    renderAuth();
    act(() => discordButton().click());
    act(() => host!.querySelector<HTMLButtonElement>('[role="status"] button')!.click());
    expect(discordButton().disabled).toBe(false);
    expect(host!.querySelector('[role="alert"]')?.textContent).toContain('app.auth.discord_cancelled');
    act(() => discordButton().click());
    const hidden = vi.spyOn(document, 'hidden', 'get');
    hidden.mockReturnValue(true);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    hidden.mockReturnValue(false);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    hidden.mockRestore();
    expect(discordButton().disabled).toBe(false);
    expect(host!.querySelector('[role="alert"]')?.textContent).toContain('app.auth.discord_returned');
    await act(async () => { first.resolve(); second.resolve(); });
    expect(host!.querySelector('[role="alert"]')?.textContent).toContain('app.auth.discord_returned');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('libera a interface nativa quando Browser.open retorna', async () => {
    discord.native = true;
    discord.signIn.mockResolvedValue(undefined);
    renderAuth();
    await act(async () => discordButton().click());
    expect(discordButton().disabled).toBe(false);
    expect(host!.querySelector('[role="status"]')?.textContent).toContain('app.auth.discord_opened');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('limpa o timer no unmount e descarta uma resposta tardia', async () => {
    const pending = deferred();
    discord.signIn.mockImplementation(() => pending.promise);
    renderAuth();
    act(() => discordButton().click());
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    act(() => root!.unmount());
    root = null;
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => pending.reject(new Error('late')));
    expect(host!.querySelector('[role="alert"]')).toBeNull();
  });
});
