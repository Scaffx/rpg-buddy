import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const origin = 'https://quarantine.example.test';
const publicKey = 'fixture-public-key';
const authUrl = `${origin}/auth/v1/user`;
const dataUrl = `${origin}/rest/v1/profiles`;
const candidate = 'fixture-candidate-token';
const replacement = 'fixture-replacement-token';

type ClientOptions = {
  auth: { storage: Storage; persistSession: boolean; autoRefreshToken: boolean };
  global: { fetch: typeof fetch };
  realtime: { accessToken: () => Promise<string | null>; fetch?: typeof fetch };
};

const mock = vi.hoisted(() => ({
  createClient: vi.fn<(_url: string, _key: string, _options: ClientOptions) => unknown>(),
}));

vi.mock('@supabase/supabase-js', () => ({ createClient: mock.createClient }));

const bearer = (token: string, signal?: AbortSignal) => ({
  headers: { authorization: `Bearer ${token}` },
  signal,
});

let originalFetch: typeof fetch;
let network: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', origin);
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', publicKey);
  mock.createClient.mockReset();
  originalFetch = globalThis.fetch;
  network = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
  globalThis.fetch = network;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function boot(options?: { disconnect?: () => Promise<unknown> }) {
  const nativeSetAuth = vi.fn().mockResolvedValue(undefined);
  const nativeConnect = vi.fn();
  const nativeDisconnect = vi.fn(options?.disconnect ?? (() => Promise.resolve()));
  const realtime = {
    setAuth: nativeSetAuth,
    connect: nativeConnect,
    disconnect: nativeDisconnect,
  };
  mock.createClient.mockReturnValue({ realtime });

  // Import the production client module, not a recreated wrapper. Only createClient is mocked.
  const { supabase } = await import('@/integrations/supabase/client');
  const { authDataGate } = await import('@/lib/authDataGate');
  const config = mock.createClient.mock.calls[0][2];
  return { supabase, authDataGate, config, nativeSetAuth, nativeConnect, nativeDisconnect };
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

describe('real Supabase client module quarantine', () => {
  it('keeps remote Auth and the exact public key usable while holding a candidate JWT', async () => {
    const { config, authDataGate } = await boot();
    expect(mock.createClient).toHaveBeenCalledWith(origin, publicKey, expect.any(Object));
    expect(config.auth).toMatchObject({ persistSession: true, autoRefreshToken: true });
    expect(config.auth.storage).toBe(localStorage);

    await config.global.fetch(authUrl, bearer(candidate));
    await config.global.fetch(dataUrl, bearer(publicKey));
    await expect(config.global.fetch(dataUrl, bearer(`${publicKey}-suffix`))).rejects.toThrow();
    // The SDK may emit its token before the App has even called consider().
    await expect(config.global.fetch(dataUrl, bearer(candidate))).rejects.toThrow();
    expect(network).toHaveBeenCalledTimes(2);

    authDataGate.consider(candidate);
    const pending = config.global.fetch(dataUrl, bearer(candidate));
    await Promise.resolve();
    expect(network).toHaveBeenCalledTimes(2);
    expect(await config.realtime.accessToken()).toBeNull();

    authDataGate.approve(candidate, Date.now() + 60_000);
    await pending;
    expect(network).toHaveBeenCalledTimes(3);
    expect(await config.realtime.accessToken()).toBe(candidate);
  });

  it('does not replay rejected, aborted or timed out requests under a later approval', async () => {
    const { config, authDataGate } = await boot();

    authDataGate.consider(candidate);
    const rejected = config.global.fetch(dataUrl, bearer(candidate));
    authDataGate.clear();
    authDataGate.consider(replacement);
    await expect(rejected).rejects.toThrow();
    authDataGate.approve(replacement, Date.now() + 60_000);
    expect(network).not.toHaveBeenCalled();

    const controller = new AbortController();
    authDataGate.consider(candidate);
    const aborted = config.global.fetch(dataUrl, bearer(candidate, controller.signal));
    controller.abort();
    await expect(aborted).rejects.toMatchObject({ name: 'AbortError' });
    authDataGate.approve(candidate, Date.now() + 60_000);
    expect(network).not.toHaveBeenCalled();

    vi.useFakeTimers();
    authDataGate.consider(replacement);
    const timedOut = expect(config.global.fetch(dataUrl, bearer(replacement))).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(15_000);
    await timedOut;
    authDataGate.approve(replacement, Date.now() + 60_000);
    expect(network).not.toHaveBeenCalled();
  });

  it('refuses a previously approved token after its expiry', async () => {
    const { config, authDataGate } = await boot();
    authDataGate.approve(candidate, Date.now() - 1);
    expect(await config.realtime.accessToken()).toBeNull();
    await expect(config.global.fetch(dataUrl, bearer(candidate))).rejects.toThrow();
    expect(network).not.toHaveBeenCalled();
  });

  it('closes a live socket in the same turn as the SDK candidate setAuth', async () => {
    let connected = true;
    const disconnect = vi.fn(async () => { connected = false; });
    const { supabase, nativeSetAuth, nativeConnect, nativeDisconnect } = await boot({ disconnect });

    // This call models the SDK's Auth subscriber firing before the App subscriber.
    const call = supabase.realtime.setAuth(candidate);
    expect(nativeSetAuth).not.toHaveBeenCalled();
    expect(nativeConnect).not.toHaveBeenCalled();
    expect(nativeDisconnect).toHaveBeenCalledTimes(1);
    expect(connected).toBe(false);
    await call;
  });

  it('does not resume a paused socket after logout or a newer approval', async () => {
    let finishDisconnect!: () => void;
    let disconnectCount = 0;
    const { supabase, authDataGate, nativeSetAuth, nativeConnect, nativeDisconnect } = await boot({
      disconnect: () => {
        disconnectCount++;
        return disconnectCount === 1
          ? new Promise<void>(resolve => { finishDisconnect = resolve; })
          : Promise.resolve();
      },
    });

    authDataGate.pauseRealtime(supabase.realtime);
    await Promise.resolve();
    authDataGate.approve(candidate, Date.now() + 60_000);
    authDataGate.resumeRealtime(supabase.realtime, candidate, () => true);
    authDataGate.clear();
    authDataGate.pauseRealtime(supabase.realtime);
    finishDisconnect();
    await tick();
    expect(nativeSetAuth).not.toHaveBeenCalled();
    expect(nativeConnect).not.toHaveBeenCalled();
    expect(nativeDisconnect).toHaveBeenCalledTimes(2);

    authDataGate.pauseRealtime(supabase.realtime);
    await tick();
    authDataGate.approve(candidate, Date.now() + 60_000);
    authDataGate.resumeRealtime(supabase.realtime, candidate, () => true);
    authDataGate.approve(replacement, Date.now() + 60_000);
    authDataGate.resumeRealtime(supabase.realtime, replacement, () => true);
    await tick();
    expect(nativeSetAuth).toHaveBeenCalledTimes(1);
    expect(nativeSetAuth).toHaveBeenCalledWith(replacement);
    expect(nativeConnect).toHaveBeenCalledTimes(1);
  });

  it('blocks the app-style Realtime broadcast fallback after logout', async () => {
    const priorApproved = 'fixture-prior-approved-token';
    const { RealtimeClient } = await import('@supabase/realtime-js');
    mock.createClient.mockImplementation((_url, _key, config) => ({
      realtime: new RealtimeClient('wss://quarantine.example.test/realtime/v1', {
        params: { apikey: publicKey },
        accessToken: config.realtime.accessToken,
        fetch: config.realtime.fetch,
      }),
    }));
    const { supabase } = await import('@/integrations/supabase/client');
    const { authDataGate } = await import('@/lib/authDataGate');

    authDataGate.approve(priorApproved, Date.now() + 60_000);
    await supabase.realtime.setAuth(priorApproved);
    authDataGate.clear();
    authDataGate.pauseRealtime(supabase.realtime);
    await tick();

    network.mockResolvedValue(new Response('{}', { status: 202 }));
    const channel = supabase.realtime.channel('fixture-private', { config: { private: true } });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      await channel.send({ type: 'broadcast', event: 'probe', payload: { fixture: true } });
    } finally {
      warn.mockRestore();
    }
    expect(network).not.toHaveBeenCalled();
  });
});
