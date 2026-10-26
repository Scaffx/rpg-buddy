import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthDataGate } from '@/lib/authDataGate';

const origin = 'https://project.example.test';
const key = 'public-key';
const dataUrl = origin + '/rest/v1/profile';
const authUrl = origin + '/auth/v1/user';
const request = (token: string, signal?: AbortSignal) => ({
  headers: { authorization: 'Bearer ' + token },
  signal,
});
const response = new Response('{}', { status: 200 });
let nativeFetch: typeof fetch;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  nativeFetch = globalThis.fetch;
  fetchMock = vi.fn().mockResolvedValue(response);
  globalThis.fetch = fetchMock;
});
afterEach(() => { globalThis.fetch = nativeFetch; vi.useRealTimers(); });

describe('AuthDataGate', () => {
  it('allows Auth and exact public-key calls while refusing unconfirmed user JWTs', async () => {
    const gate = new AuthDataGate(origin, key);
    await gate.fetch(authUrl, request('unverified'));
    await gate.fetch(dataUrl, request(key));
    await expect(gate.fetch(dataUrl, request('unverified'))).rejects.toThrow('not approved');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('holds a candidate until approved and never sends an older token under a new approval', async () => {
    const gate = new AuthDataGate(origin, key);
    gate.approve('old', Date.now() + 1000);
    gate.consider('next');
    await gate.fetch(dataUrl, request('old'));
    const candidate = gate.fetch(dataUrl, request('next'));
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    gate.approve('next', Date.now() + 1000);
    await candidate;
    await expect(gate.fetch(dataUrl, request('old'))).rejects.toThrow('not approved');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects an aborted pending request without issuing network I/O', async () => {
    const gate = new AuthDataGate(origin, key);
    const controller = new AbortController();
    gate.consider('next');
    const pending = gate.fetch(dataUrl, request('next', controller.signal));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    gate.approve('next', Date.now() + 1000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects pending requests on failed confirmation and after confirmed expiry', async () => {
    vi.useFakeTimers();
    const gate = new AuthDataGate(origin, key);
    gate.consider('next');
    const pending = gate.fetch(dataUrl, request('next'));
    gate.clear();
    await expect(pending).rejects.toThrow('not approved');
    gate.approve('next', Date.now() + 1000);
    vi.advanceTimersByTime(1000);
    await expect(gate.fetch(dataUrl, request('next'))).rejects.toThrow('not approved');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reconnects retained Realtime channels only after pause finishes and token approval remains current', async () => {
    const gate = new AuthDataGate(origin, key);
    let finishDisconnect!: (value: string) => void;
    const disconnect = vi.fn().mockReturnValue(new Promise<string>(resolve => { finishDisconnect = resolve; }));
    const realtime = { disconnect, setAuth: vi.fn().mockResolvedValue(undefined), connect: vi.fn() };
    gate.pauseRealtime(realtime);
    gate.approve('next', Date.now() + 1000);
    gate.resumeRealtime(realtime, 'next', () => true);
    await Promise.resolve();
    expect(realtime.setAuth).not.toHaveBeenCalled();
    finishDisconnect('ok');
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(realtime.setAuth).toHaveBeenCalledWith('next');
    expect(realtime.connect).toHaveBeenCalledTimes(1);
  });
});
