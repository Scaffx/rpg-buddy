import { StrictMode, act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePresenceHeartbeat } from '@/hooks/usePresence';

type RpcResponse = { data: null; error: Error | null };

const presence = vi.hoisted(() => ({
  user: null as { id: string } | null,
  rpc: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: presence.user }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: presence.rpc },
}));

function controlledRpc(ignoreAbort = false) {
  const signals: AbortSignal[] = [];
  let resolve!: (value: RpcResponse) => void;
  let reject!: (reason: unknown) => void;
  let settled = false;
  const promise = new Promise<RpcResponse>((yes, no) => {
    resolve = (value) => { if (!settled) { settled = true; yes(value); } };
    reject = (reason) => { if (!settled) { settled = true; no(reason); } };
  });
  const builder = Object.assign(promise, {
    abortSignal: (signal: AbortSignal) => {
      signals.push(signal);
      if (!ignoreAbort) {
        if (signal.aborted) reject(new DOMException('Aborted', 'AbortError'));
        else signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      }
      return builder;
    },
  });
  return {
    builder,
    signals,
    resolve: () => resolve({ data: null, error: null }),
    fail: (error = new Error('RPC rejected')) => reject(error),
  };
}

function resolvedRpc(error: Error | null = null) {
  const builder = Object.assign(Promise.resolve({ data: null, error }), {
    abortSignal: () => builder,
  });
  return builder;
}

function rejectedRpc(error = new Error('network down')) {
  const builder = Object.assign(Promise.reject(error), {
    abortSignal: () => builder,
  });
  return builder;
}

async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

async function settle(request: ReturnType<typeof controlledRpc>) {
  await act(async () => { request.resolve(); await Promise.resolve(); });
}

let visible = true;
const mounts: Array<() => void> = [];
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe() {
  usePresenceHeartbeat();
  return null;
}

function mount(strict = false) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const scene = () => strict ? <StrictMode><Probe /></StrictMode> : <Probe />;
  act(() => root.render(scene()));
  let disposed = false;
  const unmount = () => {
    if (disposed) return;
    disposed = true;
    act(() => root.unmount());
    host.remove();
  };
  mounts.push(unmount);
  return { rerender: () => act(() => root.render(scene())), unmount };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-28T12:00:00.000Z'));
  visible = true;
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visible ? 'visible' : 'hidden');
  presence.user = { id: 'hero-a' };
  presence.rpc.mockReset();
  presence.rpc.mockImplementation(() => resolvedRpc());
});

afterEach(() => {
  for (const unmount of mounts.splice(0)) unmount();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('usePresenceHeartbeat', () => {
  it('mantém só uma RPC em voo por mais de 60 s e agenda a próxima após a conclusão', async () => {
    const first = controlledRpc(true);
    presence.rpc.mockReturnValueOnce(first.builder);
    mount();
    expect(presence.rpc).toHaveBeenCalledTimes(1);
    expect(presence.rpc).toHaveBeenCalledWith('update_my_last_seen');

    await advance(90_001);
    expect(presence.rpc).toHaveBeenCalledTimes(1);
    expect(first.signals).toHaveLength(1);
    expect(first.signals[0].aborted).toBe(true);

    await settle(first);
    expect(presence.rpc).toHaveBeenCalledTimes(1);
    await advance(29_999);
    expect(presence.rpc).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(presence.rpc).toHaveBeenCalledTimes(2);
  });

  it('trata {error} como falha e tenta novamente sem loop imediato', async () => {
    const second = controlledRpc(true);
    presence.rpc.mockReturnValueOnce(resolvedRpc(new Error('PostgREST timeout')))
      .mockReturnValueOnce(second.builder);
    mount();
    await advance(1_000);
    expect(presence.rpc).toHaveBeenCalledTimes(1);
    await advance(299_000);
    expect(presence.rpc).toHaveBeenCalledTimes(2);
    await advance(90_001);
    expect(presence.rpc).toHaveBeenCalledTimes(2);
    await settle(second);
  });

  it('aborta a RPC aos 15 s e respeita 30 s de retry quando o abort liquida', async () => {
    const first = controlledRpc();
    const second = controlledRpc(true);
    presence.rpc.mockReturnValueOnce(first.builder).mockReturnValueOnce(second.builder);
    mount();
    await advance(14_999);
    expect(first.signals[0].aborted).toBe(false);
    expect(presence.rpc).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(first.signals[0].aborted).toBe(true);
    expect(presence.rpc).toHaveBeenCalledTimes(1);
    await advance(29_999);
    expect(presence.rpc).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(presence.rpc).toHaveBeenCalledTimes(2);
    await settle(second);
  });

  it('aplica backoff crescente e limitado a rejeições sucessivas', async () => {
    const times: number[] = [];
    const pending = controlledRpc(true);
    presence.rpc.mockImplementation(() => {
      times.push(Date.now());
      return times.length <= 4 ? rejectedRpc() : pending.builder;
    });
    mount();
    await advance(1_200_000);
    expect(times).toHaveLength(5);
    const delays = times.slice(1).map((time, index) => time - times[index]);
    expect(delays).toEqual([30_000, 60_000, 120_000, 120_000]);
    await settle(pending);
  });

  it('pausa ao ocultar a aba e retoma no retorno sem sobrepor RPC pendente', async () => {
    const first = controlledRpc(true);
    const second = controlledRpc(true);
    presence.rpc.mockReturnValueOnce(first.builder).mockReturnValueOnce(second.builder);
    mount();
    visible = false;
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(first.signals[0].aborted).toBe(true);
    await advance(90_001);
    expect(presence.rpc).toHaveBeenCalledTimes(1);

    visible = true;
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(presence.rpc).toHaveBeenCalledTimes(1);
    await settle(first);
    await advance(0);
    expect(presence.rpc).toHaveBeenCalledTimes(2);
    await advance(90_001);
    expect(presence.rpc).toHaveBeenCalledTimes(2);
    await settle(second);
  });

  it('retoma ao mostrar a aba depois que o abort liquida a RPC antiga', async () => {
    const first = controlledRpc();
    const second = controlledRpc(true);
    presence.rpc.mockReturnValueOnce(first.builder).mockReturnValueOnce(second.builder);
    mount();
    visible = false;
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(first.signals[0].aborted).toBe(true);
    await advance(90_000);
    expect(presence.rpc).toHaveBeenCalledTimes(1);
    visible = true;
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(presence.rpc).toHaveBeenCalledTimes(2);
    await advance(90_001);
    expect(presence.rpc).toHaveBeenCalledTimes(2);
    await settle(second);
  });

  it('não reinicia o heartbeat quando o mesmo UID vem em outro objeto user', async () => {
    const first = controlledRpc(true);
    presence.rpc.mockReturnValueOnce(first.builder);
    const { rerender } = mount();
    presence.user = { id: 'hero-a' };
    rerender();
    await advance(90_001);
    expect(presence.rpc).toHaveBeenCalledTimes(1);
    await settle(first);
    await advance(30_000);
    expect(presence.rpc).toHaveBeenCalledTimes(2);
  });

  it('interrompe o ciclo no logout, inclusive após conclusão tardia', async () => {
    const first = controlledRpc(true);
    presence.rpc.mockReturnValueOnce(first.builder);
    const { rerender } = mount();
    presence.user = null;
    rerender();
    expect(first.signals[0].aborted).toBe(true);
    await settle(first);
    await advance(300_000);
    expect(presence.rpc).toHaveBeenCalledTimes(1);
  });

  it('não mantém timer após unmount, inclusive após conclusão tardia', async () => {
    const first = controlledRpc(true);
    presence.rpc.mockReturnValueOnce(first.builder);
    const { unmount } = mount();
    unmount();
    expect(first.signals[0].aborted).toBe(true);
    await settle(first);
    await advance(300_000);
    expect(presence.rpc).toHaveBeenCalledTimes(1);
  });

  it('isola o ciclo do UID antigo quando a conta muda durante uma RPC', async () => {
    const oldRequest = controlledRpc(true);
    const newRequest = controlledRpc(true);
    presence.rpc.mockReturnValueOnce(oldRequest.builder).mockReturnValueOnce(newRequest.builder);
    const { rerender } = mount();
    presence.user = { id: 'hero-b' };
    rerender();
    expect(oldRequest.signals[0].aborted).toBe(true);
    expect(presence.rpc).toHaveBeenCalledTimes(2);
    await settle(oldRequest);
    await advance(90_001);
    expect(presence.rpc).toHaveBeenCalledTimes(2);
    await settle(newRequest);
    await advance(30_000);
    expect(presence.rpc).toHaveBeenCalledTimes(3);
  });

  it('mantém um único ciclo ativo após StrictMode e remount', async () => {
    const { unmount } = mount(true);
    await advance(0);
    const initialCalls = presence.rpc.mock.calls.length;
    expect(initialCalls).toBeGreaterThanOrEqual(1);
    expect(initialCalls).toBeLessThanOrEqual(2);
    await advance(60_000);
    expect(presence.rpc).toHaveBeenCalledTimes(initialCalls + 2);
    unmount();
    await advance(90_000);
    expect(presence.rpc).toHaveBeenCalledTimes(initialCalls + 2);

    const fresh = mount();
    expect(presence.rpc).toHaveBeenCalledTimes(initialCalls + 3);
    fresh.unmount();
  });
});
