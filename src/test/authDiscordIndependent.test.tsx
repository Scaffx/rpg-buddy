import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Auth from '@/pages/Auth';

const oauth = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(),
  isNativePlatform: vi.fn(() => false),
  browserOpen: vi.fn(),
  browserClose: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { signInWithOAuth: oauth.signInWithOAuth } },
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: oauth.isNativePlatform } }));
vi.mock('@capacitor/browser', () => ({
  Browser: { open: oauth.browserOpen, close: oauth.browserClose },
}));
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn() } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ signIn: vi.fn(), signUp: vi.fn() }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: oauth.toast }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ initial: _initial, animate: _animate, transition: _transition, ...props }: React.HTMLAttributes<HTMLDivElement> & {
      initial?: unknown;
      animate?: unknown;
      transition?: unknown;
    }) => <div {...props} />,
  },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

type OAuthResponse = { data: { url: string | null }; error: Error | null };

let host: HTMLDivElement | null = null;
let root: Root | null = null;

async function mount() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<Auth />));
}

function discordButton(): HTMLButtonElement {
  const button = host!.querySelector<HTMLButtonElement>('[data-testid="discord-login"]') ??
    Array.from(host!.querySelectorAll('button')).find((node) =>
      node.textContent?.includes('app.auth.button_discord') ||
      node.textContent?.includes('app.auth.discord_retry'),
    );
  if (!button) throw new Error('Botão Discord não encontrado na página Auth');
  return button;
}

function alertText(): string {
  return host!.querySelector('[role="alert"]')?.textContent?.trim() ?? '';
}

async function clickDiscord() {
  await act(async () => discordButton().click());
}

beforeEach(() => {
  vi.useFakeTimers();
  oauth.signInWithOAuth.mockReset();
  oauth.isNativePlatform.mockReset().mockReturnValue(false);
  oauth.browserOpen.mockReset().mockResolvedValue(undefined);
  oauth.browserClose.mockReset();
  oauth.toast.mockReset();
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
});

describe('revisão independente do login Discord', () => {
  it('recupera o botão e mantém erro seguro visível na página após falha de autorização', async () => {
    const secret = 'https://provider.invalid/authorize?access_token=segredo';
    oauth.signInWithOAuth.mockResolvedValue({ data: { url: null }, error: new Error(secret) });
    await mount();

    await clickDiscord();

    expect(discordButton().disabled).toBe(false);
    expect(alertText()).not.toBe('');
    expect(host!.textContent).not.toContain(secret);
    expect(host!.textContent).not.toContain('segredo');
    expect(JSON.stringify(oauth.toast.mock.calls)).not.toContain('segredo');
  });

  it('libera nova tentativa quando a autorização web fica pendente sem navegação', async () => {
    const pending = deferred<OAuthResponse>();
    oauth.signInWithOAuth.mockReturnValue(pending.promise);
    await mount();

    await clickDiscord();
    expect(discordButton().disabled).toBe(true);
    await act(async () => vi.advanceTimersByTime(14_999));
    expect(discordButton().disabled).toBe(true);
    await act(async () => vi.advanceTimersByTime(1));

    expect(discordButton().disabled).toBe(false);
    expect(alertText()).not.toBe('');
  });

  it('libera nova tentativa se a autorização web resolve sem sair da página', async () => {
    oauth.signInWithOAuth.mockResolvedValue({ data: { url: null }, error: null });
    await mount();

    await clickDiscord();
    await act(async () => vi.advanceTimersByTime(30_000));

    expect(discordButton().disabled).toBe(false);
    expect(alertText()).not.toBe('');
  });

  it('ignora rejeição antiga depois de timeout e preserva a tentativa nova', async () => {
    const first = deferred<OAuthResponse>();
    const second = deferred<OAuthResponse>();
    oauth.signInWithOAuth.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await mount();

    await clickDiscord();
    await act(async () => vi.advanceTimersByTime(30_000));
    expect(discordButton().disabled).toBe(false);
    await clickDiscord();
    expect(discordButton().disabled).toBe(true);
    const priorMessage = alertText();

    await act(async () => first.reject(new Error('erro antigo com token=privado')));

    expect(discordButton().disabled).toBe(true);
    expect(alertText()).toBe(priorMessage);
    expect(host!.textContent).not.toContain('privado');
  });

  it('permite parar a espera e descarta o retorno antigo antes de um novo clique', async () => {
    const first = deferred<OAuthResponse>();
    const second = deferred<OAuthResponse>();
    oauth.signInWithOAuth.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await mount();

    await clickDiscord();
    const stop = Array.from(host!.querySelectorAll('button')).find((node) =>
      node.textContent?.includes('app.auth.discord_stop_waiting'),
    );
    expect(stop).toBeDefined();
    await act(async () => stop!.click());
    expect(discordButton().disabled).toBe(false);
    const stoppedMessage = alertText();
    expect(stoppedMessage).not.toBe('');

    await act(async () => first.resolve({ data: { url: null }, error: null }));
    expect(alertText()).toBe(stoppedMessage);
    await clickDiscord();
    expect(oauth.signInWithOAuth).toHaveBeenCalledTimes(2);
    expect(discordButton().disabled).toBe(true);
  });

  it('libera a espera se a pessoa retorna à aba sem concluir o login', async () => {
    oauth.signInWithOAuth.mockReturnValue(deferred<OAuthResponse>().promise);
    await mount();
    await clickDiscord();

    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    try {
      await act(async () => document.dispatchEvent(new Event('visibilitychange')));
      hidden.mockReturnValue(false);
      await act(async () => document.dispatchEvent(new Event('visibilitychange')));
      expect(discordButton().disabled).toBe(false);
      expect(alertText()).not.toBe('');
    } finally {
      hidden.mockRestore();
    }
  });

  it('impede clique duplo na mesma renderização e descarta conclusão após desmontagem', async () => {
    const pending = deferred<OAuthResponse>();
    oauth.signInWithOAuth.mockReturnValue(pending.promise);
    await mount();

    await act(async () => {
      const button = discordButton();
      button.click();
      button.click();
    });
    expect(oauth.signInWithOAuth).toHaveBeenCalledTimes(1);

    await act(async () => root!.unmount());
    root = null;
    const callsBefore = oauth.toast.mock.calls.length;
    await act(async () => pending.reject(new Error('rejeição depois do unmount')));
    await act(async () => vi.advanceTimersByTime(30_000));
    expect(oauth.toast.mock.calls.length).toBe(callsBefore);
  });

  it('mantém o contrato nativo de deep link e abertura do navegador do sistema', async () => {
    oauth.isNativePlatform.mockReturnValue(true);
    oauth.signInWithOAuth.mockResolvedValue({
      data: { url: 'https://discord.com/oauth2/authorize?client_id=teste' },
      error: null,
    });
    await mount();

    await clickDiscord();

    expect(oauth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'discord',
      options: {
        redirectTo: 'com.scaffx.lifeonrpg://login-callback',
        skipBrowserRedirect: true,
      },
    });
    expect(oauth.browserOpen).toHaveBeenCalledWith({
      url: 'https://discord.com/oauth2/authorize?client_id=teste',
    });
    expect(discordButton().disabled).toBe(false);
  });
});
