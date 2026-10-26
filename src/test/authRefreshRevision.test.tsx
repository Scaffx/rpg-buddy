import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RealtimeClient } from '@supabase/realtime-js';
import { AuthDataGate } from '@/lib/authDataGate';
import { AuthContinuityBoundary } from '@/components/auth/AuthContinuityBoundary';

const mocked = vi.hoisted(() => ({
  continuity: { promise: null as Promise<void> | null, resumed: false, sequence: 0, epoch: 0 },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ continuity: mocked.continuity }) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const origin = 'https://revision.example.test';
const dataUrl = `${origin}/rest/v1/private`;
const bearer = (token: string, signal?: AbortSignal) => ({ headers: { authorization: `Bearer ${token}` }, signal });
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
let originalFetch: typeof fetch;
let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  mocked.continuity = { promise: null, resumed: false, sequence: 0, epoch: 0 };
  if (originalFetch) globalThis.fetch = originalFetch;
});

describe('ajustes finais do gate de dados', () => {
  it('rejeita uma resposta A em voo após clear e aprovação B, mesmo se o fetch ignorar abort', async () => {
    const gate = new AuthDataGate(origin, 'public-key');
    let release!: (response: Response) => void;
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(() => new Promise<Response>(resolve => { release = resolve; })) as typeof fetch;
    gate.approve('token-a', Date.now() + 60_000, 'binding-a');
    const request = gate.fetch(dataUrl, bearer('token-a'));
    gate.clear();
    gate.approve('token-b', Date.now() + 60_000, 'binding-b');
    release(new Response('{"owner":"a"}', { status: 200 }));
    await expect(request).rejects.toThrow('authorization changed');
  });

  it('entrega resposta iniciada no token antigo após renovação confirmada do mesmo vínculo', async () => {
    const gate = new AuthDataGate(origin, 'public-key');
    let release!: (response: Response) => void;
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(() => new Promise<Response>(resolve => { release = resolve; })) as typeof fetch;
    gate.approve('old', Date.now() + 60_000, 'uid|iss|session');
    const request = gate.fetch(dataUrl, bearer('old'));
    gate.consider('fresh');
    gate.approve('fresh', Date.now() + 60_000, 'uid|iss|session');
    release(new Response('{"ok":true}', { status: 200 }));
    expect((await request).status).toBe(200);
  });

  it('logout invalida a entrega pendente e uma aprovação posterior não a revive', async () => {
    const gate = new AuthDataGate(origin, 'public-key');
    let release!: (response: Response) => void;
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(() => new Promise<Response>(resolve => { release = resolve; })) as typeof fetch;
    gate.approve('old', Date.now() + 60_000, 'binding-a');
    const request = gate.fetch(dataUrl, bearer('old'));
    gate.clear();
    await expect(request).rejects.toThrow('authorization changed');
    gate.approve('old', Date.now() + 60_000, 'binding-a');
    release(new Response('{"owner":"a"}', { status: 200 }));
    await tick();
  });

  it('abort do chamador encerra prontamente fetch em voo', async () => {
    const gate = new AuthDataGate(origin, 'public-key');
    const controller = new AbortController();
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(() => new Promise<Response>(() => undefined)) as typeof fetch;
    gate.approve('old', Date.now() + 60_000);
    const request = gate.fetch(dataUrl, bearer('old', controller.signal));
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('ajustes finais de continuidade', () => {
  const render = () => <><button id="later">Outra ação</button>
    <AuthContinuityBoundary><input aria-label="Rascunho" /><div id="scroller" style={{ height: 10, overflow: 'auto' }}><div style={{ height: 100 }} /></div></AuthContinuityBoundary></>;

  it('preserva foco normal no retorno da mesma sessão e respeita foco escolhido depois', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root!.render(render()));
    const draft = host.querySelector<HTMLInputElement>('input')!;
    draft.focus();
    let release!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    mocked.continuity = { promise: waiting, resumed: false, sequence: 1, epoch: 0 };
    await act(async () => root!.render(render()));
    mocked.continuity = { promise: null, resumed: true, sequence: 2, epoch: 0 };
    await act(async () => { release(); root!.render(render()); });
    expect(document.activeElement).toBe(draft);

    let releaseAgain!: () => void;
    const waitingAgain = new Promise<void>(resolve => { releaseAgain = resolve; });
    mocked.continuity = { promise: waitingAgain, resumed: false, sequence: 3, epoch: 0 };
    await act(async () => root!.render(render()));
    const later = host.querySelector<HTMLButtonElement>('#later')!;
    later.focus();
    mocked.continuity = { promise: null, resumed: true, sequence: 4, epoch: 0 };
    await act(async () => { releaseAgain(); root!.render(render()); });
    expect(document.activeElement).toBe(later);
  });

  it('restaura rolagem sem nova escolha e preserva rolagem após gesto posterior', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root!.render(render()));
    const scroller = host.querySelector<HTMLDivElement>('#scroller')!;
    scroller.scrollTop = 42;
    let release!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    mocked.continuity = { promise: waiting, resumed: false, sequence: 1, epoch: 0 };
    await act(async () => root!.render(render()));
    scroller.scrollTop = 0;
    mocked.continuity = { promise: null, resumed: true, sequence: 2, epoch: 0 };
    await act(async () => { release(); root!.render(render()); });
    expect(scroller.scrollTop).toBe(42);

    let releaseAgain!: () => void;
    const waitingAgain = new Promise<void>(resolve => { releaseAgain = resolve; });
    mocked.continuity = { promise: waitingAgain, resumed: false, sequence: 3, epoch: 0 };
    await act(async () => root!.render(render()));
    window.dispatchEvent(new WheelEvent('wheel'));
    scroller.scrollTop = 10;
    mocked.continuity = { promise: null, resumed: true, sequence: 4, epoch: 0 };
    await act(async () => { releaseAgain(); root!.render(render()); });
    expect(scroller.scrollTop).toBe(10);
  });
});

describe('ajustes finais de Realtime', () => {
  const client = (gate: AuthDataGate) => new RealtimeClient('wss://revision.example.test/realtime/v1', {
    params: { apikey: 'public-key' },
    accessToken: async () => gate.approvedToken(),
  });

  it('retira canal A antes de reconectar B e preserva canal B criado durante a limpeza', async () => {
    const gate = new AuthDataGate(origin, 'public-key');
    const realtime = client(gate);
    const oldChannel = realtime.channel('account-a');
    const connect = vi.spyOn(realtime, 'connect').mockImplementation(() => undefined);
    gate.approve('token-a', Date.now() + 60_000, 'binding-a');
    await realtime.setAuth('token-a');
    gate.clear();
    gate.pauseRealtime(realtime);
    gate.approve('token-b', Date.now() + 60_000, 'binding-b');
    const newChannel = realtime.channel('account-b');
    gate.resumeRealtime(realtime, 'token-b', () => realtime.getChannels().length > 0);
    await tick();
    expect(realtime.getChannels()).not.toContain(oldChannel);
    expect(realtime.getChannels()).toContain(newChannel);
    expect(realtime.accessTokenValue).toBe('token-b');
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('não autoriza connect enquanto a retirada dos canais antigos está pendente', async () => {
    const gate = new AuthDataGate(origin, 'public-key');
    let finishCleanup!: () => void;
    const realtime = {
      disconnect: vi.fn().mockResolvedValue('ok'),
      removeAllChannels: vi.fn(() => new Promise<void>(resolve => { finishCleanup = resolve; })),
      setAuth: vi.fn().mockResolvedValue(undefined),
      connect: vi.fn(),
    };
    gate.approve('token-a', Date.now() + 60_000, 'binding-a');
    gate.clear();
    gate.pauseRealtime(realtime);
    gate.approve('token-b', Date.now() + 60_000, 'binding-b');
    gate.resumeRealtime(realtime, 'token-b', () => true);
    await tick();
    expect(gate.canConnectRealtime()).toBe(false);
    expect(gate.canSetRealtimeAuth('token-b')).toBe(false);
    expect(realtime.setAuth).not.toHaveBeenCalled();
    expect(realtime.connect).not.toHaveBeenCalled();
    finishCleanup();
    await tick();
    expect(gate.canConnectRealtime()).toBe(true);
    expect(gate.canSetRealtimeAuth('token-b')).toBe(true);
    expect(realtime.connect).toHaveBeenCalledTimes(1);
  });

  it('mantém canais no expire e os retoma depois de renovar o mesmo vínculo', async () => {
    const gate = new AuthDataGate(origin, 'public-key');
    const realtime = client(gate);
    const retained = realtime.channel('account-a');
    const connect = vi.spyOn(realtime, 'connect').mockImplementation(() => undefined);
    gate.approve('old', Date.now() + 60_000, 'binding-a');
    await realtime.setAuth('old');
    gate.expire();
    gate.pauseRealtime(realtime);
    gate.approve('fresh', Date.now() + 60_000, 'binding-a');
    gate.resumeRealtime(realtime, 'fresh', () => realtime.getChannels().length > 0);
    await tick();
    expect(realtime.getChannels()).toContain(retained);
    expect(realtime.accessTokenValue).toBe('fresh');
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('logout remove canal antigo e não reconecta sem nova autorização', async () => {
    const gate = new AuthDataGate(origin, 'public-key');
    const realtime = client(gate);
    const retained = realtime.channel('account-a');
    const connect = vi.spyOn(realtime, 'connect').mockImplementation(() => undefined);
    gate.approve('old', Date.now() + 60_000);
    gate.clear();
    gate.pauseRealtime(realtime);
    gate.resumeRealtime(realtime, 'old', () => realtime.getChannels().length > 0);
    await tick();
    expect(realtime.getChannels()).not.toContain(retained);
    expect(connect).not.toHaveBeenCalled();
  });
});
