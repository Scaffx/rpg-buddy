/** Network boundary for the Supabase client's data APIs. Auth itself must stay reachable. */
export class AuthDataGate {
  private approved: { token: string; expiresAt: number; anchor: string } | null = null;
  private candidate: string | null = null;
  private waiters = new Set<() => void>();
  private authorizationGeneration = 0;
  private inFlight = new Set<() => void>();
  private realtimeEpoch = 0;
  private realtimePause: Promise<unknown> = Promise.resolve();
  private retireRealtimeChannels = false;
  private realtimeReady = false;
  private realtimeCleanupSafe = true;
  private realtimePauseComplete = true;
  private realtimePauseSequence = 0;

  constructor(private readonly baseUrl: string, private readonly publicKey: string) {}

  approvedToken() {
    return this.approved && this.approved.expiresAt > Date.now() ? this.approved.token : null;
  }

  consider(token: string) {
    this.candidate = token;
    this.wake();
  }

  expire() {
    this.realtimeEpoch++;
    this.realtimeReady = false;
    this.approved = null;
    this.wake();
  }

  approve(token: string, expiresAt: number, verifiedAnchor = token) {
    if (this.approved && this.approved.anchor !== verifiedAnchor) this.invalidate();
    this.approved = { token, expiresAt, anchor: verifiedAnchor };
    this.candidate = null;
    this.wake();
  }

  clear() {
    this.invalidate();
    this.realtimeEpoch++;
    this.realtimeReady = false;
    this.realtimePauseComplete = false;
    this.approved = null;
    this.candidate = null;
    this.retireRealtimeChannels = true;
    this.wake();
  }

  private invalidate() {
    this.authorizationGeneration++;
    for (const cancel of this.inFlight) cancel();
  }

  pauseRealtime(client: { disconnect: () => Promise<unknown>; removeAllChannels?: () => Promise<unknown> }) {
    this.realtimeEpoch++;
    const pauseSequence = ++this.realtimePauseSequence;
    this.realtimeReady = false;
    this.realtimePauseComplete = false;
    let disconnect: Promise<unknown>;
    try {
      disconnect = Promise.resolve(client.disconnect());
    } catch (error) {
      disconnect = Promise.reject(error);
    }
    const retire = this.retireRealtimeChannels;
    this.retireRealtimeChannels = false;
    let removal: Promise<unknown> = Promise.resolve();
    if (retire && client.removeAllChannels) {
      try { removal = Promise.resolve(client.removeAllChannels()); }
      catch (error) { removal = Promise.reject(error); }
    }
    this.realtimePause = Promise.allSettled([this.realtimePause, disconnect, removal]).then(results => {
      if (results[1].status === 'rejected' || (retire && results[2].status === 'rejected')) {
        this.realtimeCleanupSafe = false;
      } else if (retire) {
        this.realtimeCleanupSafe = true;
      }
      if (pauseSequence === this.realtimePauseSequence) this.realtimePauseComplete = true;
    });
  }

  resumeRealtime(
    client: { setAuth: (token: string) => Promise<unknown>; connect: () => void },
    token: string,
    hasChannels: () => boolean,
  ) {
    const epoch = ++this.realtimeEpoch;
    void this.realtimePause.then(async () => {
      if (epoch !== this.realtimeEpoch || !this.realtimeCleanupSafe || this.approvedToken() !== token) return;
      await client.setAuth(token);
      if (epoch !== this.realtimeEpoch || !this.realtimeCleanupSafe || this.approvedToken() !== token) return;
      this.realtimeReady = true;
      if (hasChannels()) client.connect();
    }).catch(() => undefined);
  }

  canConnectRealtime() {
    return this.realtimeReady && this.realtimePauseComplete && this.realtimeCleanupSafe && !!this.approvedToken();
  }

  canSetRealtimeAuth(token?: string | null) {
    const approved = this.approvedToken();
    return !this.retireRealtimeChannels && this.realtimePauseComplete && this.realtimeCleanupSafe &&
      !!approved && (!token || token === approved);
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
    let startGeneration = this.authorizationGeneration;
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
          else if (permitted()) {
            startGeneration = this.authorizationGeneration;
            finish();
          } else if (this.candidate !== token) finish(new Error('Data request token was not approved'));
          else if (startGeneration !== this.authorizationGeneration) finish(new Error('Data request authorization changed'));
        };
        const timer = setTimeout(() => finish(new Error('Data request confirmation timed out')), 15_000);
        this.waiters.add(check);
        signal?.addEventListener('abort', abort, { once: true });
        check();
      });
    }
    if (signal?.aborted) throw new DOMException('Request aborted', 'AbortError');
    if (startGeneration !== this.authorizationGeneration || !permitted()) throw new Error('Data request token expired or changed');
    const anchor = this.approved!.anchor;
    const generation = this.authorizationGeneration;
    const controller = new AbortController();
    let cancel!: (error?: Error) => void;
    const invalidated = new Promise<never>((_resolve, reject) => {
      cancel = (error = new Error('Data request authorization changed')) => {
        controller.abort();
        reject(error);
      };
    });
    const abort = () => cancel(new DOMException('Request aborted', 'AbortError'));
    signal?.addEventListener('abort', abort, { once: true });
    this.inFlight.add(cancel);
    try {
      const response = await Promise.race([fetch(input, { ...init, signal: controller.signal }), invalidated]);
      if (signal?.aborted) throw new DOMException('Request aborted', 'AbortError');
      if (generation !== this.authorizationGeneration || this.approved?.anchor !== anchor || !this.approvedToken()) {
        throw new Error('Data response authorization changed');
      }
      return response;
    } finally {
      this.inFlight.delete(cancel);
      signal?.removeEventListener('abort', abort);
    }
  }
}

export const authDataGate = new AuthDataGate(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);
