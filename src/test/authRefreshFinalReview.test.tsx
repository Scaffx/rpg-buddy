import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthDataGate } from '@/lib/authDataGate';
import { AuthContinuityBoundary } from '@/components/auth/AuthContinuityBoundary';
import { RealtimeClient } from '@supabase/realtime-js';

const mocked = vi.hoisted(() => ({
  continuity: { promise: null as Promise<void> | null, resumed: false, sequence: 0, epoch: 0 },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ continuity: mocked.continuity }) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let nativeFetch: typeof fetch;

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  mocked.continuity = { promise: null, resumed: false, sequence: 0, epoch: 0 };
  if (nativeFetch) globalThis.fetch = nativeFetch;
});

describe('revisão final independente da renovação', () => {
  it('não libera resposta privada já iniciada após logout ou troca de identidade', async () => {
    const gate = new AuthDataGate('https://project.example.test', 'public-key');
    let release!: (response: Response) => void;
    nativeFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(() => new Promise<Response>(resolve => { release = resolve; })) as typeof fetch;
    gate.approve('token-a', Date.now() + 60_000);
    const request = gate.fetch('https://project.example.test/rest/v1/private', {
      headers: { authorization: 'Bearer token-a' },
    });
    gate.clear();
    gate.approve('token-b', Date.now() + 60_000);
    release(new Response('{"owner":"a"}', { status: 200 }));
    await expect(request).rejects.toThrow();
  });

  it('não toma foco de uma interação posterior ao restaurar a mesma sessão', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    const render = () => <><button id="new-focus">Continuar</button>
      <AuthContinuityBoundary><input aria-label="Rascunho" /></AuthContinuityBoundary></>;
    root = createRoot(host);
    await act(async () => root!.render(render()));
    const draft = host.querySelector<HTMLInputElement>('input')!;
    draft.focus();
    expect(document.activeElement).toBe(draft);

    let release!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    mocked.continuity = { promise: waiting, resumed: false, sequence: 1, epoch: 0 };
    await act(async () => root!.render(render()));
    const later = host.querySelector<HTMLButtonElement>('#new-focus')!;
    later.focus();
    expect(document.activeElement).toBe(later);

    mocked.continuity = { promise: null, resumed: true, sequence: 2, epoch: 0 };
    await act(async () => { release(); root!.render(render()); });
    expect(document.activeElement).toBe(later);
  });

  it('confirma que disconnect do SDK preserva canal antigo para o próximo connect', async () => {
    const gate = new AuthDataGate('https://project.example.test', 'public-key');
    const realtime = new RealtimeClient('wss://project.example.test/realtime/v1', {
      params: { apikey: 'public-key' },
      accessToken: async () => gate.approvedToken(),
    });
    const oldChannel = realtime.channel('dm-account-a');
    const connect = vi.spyOn(realtime, 'connect').mockImplementation(() => undefined);
    gate.approve('token-a', Date.now() + 60_000);
    await realtime.setAuth('token-a');
    gate.clear();
    gate.pauseRealtime(realtime);
    gate.approve('token-b', Date.now() + 60_000);
    gate.resumeRealtime(realtime, 'token-b', () => realtime.getChannels().length > 0);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(realtime.getChannels()).toContain(oldChannel);
    expect(realtime.accessTokenValue).toBe('token-b');
    expect(connect).toHaveBeenCalledTimes(1);
  });
});
