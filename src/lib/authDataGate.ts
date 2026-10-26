/** Network boundary for the Supabase client's data APIs. Auth itself must stay reachable. */
export class AuthDataGate {
  private approved: { token: string; expiresAt: number } | null = null;
  private candidate: string | null = null;
  private waiters = new Set<() => void>();
  private realtimeEpoch = 0;
  private realtimePause: Promise<unknown> = Promise.resolve();

  constructor(private readonly baseUrl: string, private readonly publicKey: string) {}

  approvedToken() {
    return this.approved && this.approved.expiresAt > Date.now() ? this.approved.token : null;
  }

  consider(token: string) {
    this.candidate = token;
    this.wake();
  }

  expire() {
    this.approved = null;
    this.wake();
  }

  approve(token: string, expiresAt: number) {
    this.approved = { token, expiresAt };
    this.candidate = null;
    this.wake();
  }

  clear() {
    this.approved = null;
    this.candidate = null;
    this.wake();
  }

  pauseRealtime(client: { disconnect: () => Promise<unknown> }) {
    this.realtimeEpoch++;
    let disconnect: Promise<unknown>;
    try {
      disconnect = Promise.resolve(client.disconnect());
    } catch {
      disconnect = Promise.resolve();
    }
    this.realtimePause = Promise.allSettled([this.realtimePause, disconnect]).then(() => undefined);
  }

  resumeRealtime(
    client: { setAuth: (token: string) => Promise<unknown>; connect: () => void },
    token: string,
    hasChannels: () => boolean,
  ) {
    const epoch = ++this.realtimeEpoch;
    void this.realtimePause.then(async () => {
      if (epoch !== this.realtimeEpoch || this.approvedToken() !== token) return;
      await client.setAuth(token);
      if (epoch === this.realtimeEpoch && this.approvedToken() === token && hasChannels()) client.connect();
    }).catch(() => undefined);
  }

  private wake() {
    for (const wake of this.waiters) wake();
  }

  private authorization(input: RequestInfo | URL, init?: RequestInit) {
    const inherited = typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined;
    return new Headers(init?.headers ?? inherited).get('authorization');
  }

  private isAuthUrl(input: RequestInfo | URL) {
    try {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input.toString() : input.url);
      const base = new URL(this.baseUrl);
      return url.origin === base.origin && url.pathname.startsWith(`${base.pathname.replace(/\/$/, '')}/auth/v1/`);
    } catch { return false; }
  }

  async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    if (this.isAuthUrl(input)) return fetch(input, init);
    const header = this.authorization(input, init);
    const token = /^Bearer (.+)$/i.exec(header ?? '')?.[1];
    const signal = init?.signal ?? (typeof Request !== 'undefined' && input instanceof Request ? input.signal : undefined);
    if (signal?.aborted) throw new DOMException('Request aborted', 'AbortError');
    // Public calls use the project key, with ordinary RLS. A user JWT can never
    // become public simply because confirmation failed.
    if (token === this.publicKey) return fetch(input, init);
    if (!token) throw new Error('Data request has no approved authorization');

    const permitted = () => this.approvedToken() === token;
    if (!permitted()) {
      if (this.candidate !== token) throw new Error('Data request token was not approved');
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = (error?: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          this.waiters.delete(check);
          signal?.removeEventListener('abort', abort);
          if (error) reject(error); else resolve();
        };
        const abort = () => finish(new DOMException('Request aborted', 'AbortError'));
        const check = () => {
          if (signal?.aborted) abort();
          else if (permitted()) finish();
          else if (this.candidate !== token) finish(new Error('Data request token was not approved'));
        };
        const timer = setTimeout(() => finish(new Error('Data request confirmation timed out')), 15_000);
        this.waiters.add(check);
        signal?.addEventListener('abort', abort, { once: true });
        check();
      });
    }
    if (signal?.aborted) throw new DOMException('Request aborted', 'AbortError');
    if (!permitted()) throw new Error('Data request token expired or changed');
    return fetch(input, init);
  }
}

export const authDataGate = new AuthDataGate(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);
