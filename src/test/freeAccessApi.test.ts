import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

type Api = 'ai-chat' | 'generate-npc-challenges' | 'processar_turno';
type DbResult = { data: unknown; error: null | { message: string } };
type DbCall = { table: string; filters: Array<[string, unknown]>; action: string; payload?: unknown };

function fakeClient(userId: string | null, tables: Record<string, DbResult> = {}) {
  const calls: DbCall[] = [];
  const rpc = vi.fn(async (name: string, args: unknown) => {
    if (name === 'complete_mission') {
      expect(args).toEqual({ p_mission_id: 'mission-1' });
      return { data: { xp_gained: 12, gold_gained: 4 }, error: null };
    }
    throw new Error(`Unexpected RPC: ${name}`);
  });
  const client = {
    auth: { getUser: vi.fn(async () => ({ data: { user: userId ? { id: userId } : null }, error: null })) },
    rpc,
    from(table: string) {
      const call: DbCall = { table, filters: [], action: 'select' };
      calls.push(call);
      const result = () => tables[table] ?? { data: null, error: null };
      const chain = {
        select() { return chain; },
        eq(column: string, value: unknown) { call.filters.push([column, value]); return chain; },
        is() { return chain; },
        order() { return chain; },
        limit() { return chain; },
        insert(payload: unknown) { call.action = 'insert'; call.payload = payload; return chain; },
        single: async () => result(),
        maybeSingle: async () => result(),
        then(resolveResult: (value: DbResult) => unknown, rejectResult?: (error: unknown) => unknown) {
          return Promise.resolve(result()).then(resolveResult, rejectResult);
        },
      };
      return chain;
    },
  };
  return { client, calls, rpc };
}

function loadApi(api: Api, client: ReturnType<typeof fakeClient>['client'], provider = vi.fn()) {
  const source = readFileSync(resolve(process.cwd(), `supabase/functions/${api}/index.ts`), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  } }).outputText;
  let handler: ((request: Request) => Promise<Response>) | undefined;
  const createClient = vi.fn(() => client);
  const deno = {
    env: { get: (name: string) => ({
      SUPABASE_URL: 'https://local.invalid',
      SUPABASE_ANON_KEY: 'anon-test-key',
      SUPABASE_SERVICE_ROLE_KEY: 'service-test-key',
      GOOGLE_AI_KEY: 'provider-test-key',
    } as Record<string, string>)[name] },
    serve: (fn: typeof handler) => { handler = fn; },
  };
  const loadDependency = (id: string) => {
    if (id.startsWith('https://deno.land/std@')) return { serve: deno.serve };
    if (id.startsWith('https://esm.sh/@supabase/supabase-js@')) return { createClient };
    throw new Error(`Unexpected import: ${id}`);
  };
  new Function('require', 'Deno', 'fetch', 'exports', js)(loadDependency, deno, provider, {});
  expect(handler).toBeDefined();
  return { handler: handler!, createClient, provider };
}

function request(api: Api, body: object = {}, token?: string) {
  return new Request(`https://local.invalid/${api}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('free authenticated Edge APIs', () => {
  for (const api of ['ai-chat', 'generate-npc-challenges', 'processar_turno'] as const) {
    it(`${api} rejects a request without a bearer token`, async () => {
      const db = fakeClient('user-1');
      const { handler, createClient, provider } = loadApi(api, db.client);
      expect((await handler(request(api))).status).toBe(401);
      expect(createClient).not.toHaveBeenCalled();
      expect(provider).not.toHaveBeenCalled();
      expect(db.calls).toEqual([]);
    });

    it(`${api} rejects a token without a confirmed user`, async () => {
      const db = fakeClient(null);
      const { handler, provider } = loadApi(api, db.client);
      const body = api === 'ai-chat' ? { messages: [] } : {};
      expect((await handler(request(api, body, 'invalid-token'))).status).toBe(401);
      expect(provider).not.toHaveBeenCalled();
      expect(db.calls).toEqual([]);
      expect(db.rpc).not.toHaveBeenCalled();
    });
  }

  it('ai-chat serves a confirmed user without a subscription RPC and keeps provider limits', async () => {
    const db = fakeClient('user-1');
    const provider = vi.fn(async () => Response.json({ choices: [{ message: { content: 'Olá' } }] }));
    const { handler, createClient } = loadApi('ai-chat', db.client, provider);
    const response = await handler(request('ai-chat', { messages: [] }, 'user-token'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ content: 'Olá' });
    expect(createClient).toHaveBeenCalledWith('https://local.invalid', 'anon-test-key', {
      global: { headers: { Authorization: 'Bearer user-token' } },
    });
    expect(db.rpc).not.toHaveBeenCalled();

    provider.mockResolvedValueOnce(new Response(null, { status: 429 }));
    expect((await handler(request('ai-chat', { messages: [] }, 'user-token'))).status).toBe(429);
  });

  it('ai-chat uses the routine completion RPC for XP and gold', async () => {
    const db = fakeClient('user-1', { missions: { data: { id: 'mission-1', title: 'Rotina' }, error: null } });
    const provider = vi.fn()
      .mockResolvedValueOnce(Response.json({ choices: [{ message: {
        tool_calls: [{ id: 'call-1', function: { name: 'complete_mission', arguments: '{"mission_id":"mission-1"}' } }],
      } }] }))
      .mockResolvedValueOnce(Response.json({ choices: [{ message: { content: 'Concluída' } }] }));
    const { handler } = loadApi('ai-chat', db.client, provider);
    expect((await handler(request('ai-chat', { messages: [] }, 'user-token'))).status).toBe(200);
    expect(db.calls.find((call) => call.table === 'missions')?.filters).toEqual([
      ['id', 'mission-1'], ['user_id', 'user-1'],
    ]);
    expect(db.rpc).toHaveBeenCalledOnce();
    expect(db.rpc).toHaveBeenCalledWith('complete_mission', { p_mission_id: 'mission-1' });
  });

  it('ai-chat treats provider 402 as an operational outage, not user billing', async () => {
    const db = fakeClient('user-1');
    const provider = vi.fn(async () => new Response('private provider detail', { status: 402 }));
    const { handler } = loadApi('ai-chat', db.client, provider);
    const response = await handler(request('ai-chat', { messages: [] }, 'user-token'));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Serviço de IA temporariamente indisponível.' });
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('NPC challenges returns only the authenticated user weekly rows without payment lookup', async () => {
    const existing = [{ id: 'challenge-1', user_id: 'user-1' }];
    const db = fakeClient('user-1', { npc_weekly_challenges: { data: existing, error: null } });
    const { handler, provider } = loadApi('generate-npc-challenges', db.client);
    const response = await handler(request('generate-npc-challenges', { weekToken: '2026-10-26' }, 'user-token'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ challenges: existing });
    expect(db.calls[0].filters).toEqual([['user_id', 'user-1'], ['week_token', '2026-10-26']]);
    expect(db.rpc).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });

  it('NPC challenges accepts an arbitrary week token but only writes scoped challenge metadata', async () => {
    const db = fakeClient('user-1', {
      npc_weekly_challenges: { data: [], error: null },
      missions: { data: [], error: null },
      attributes: { data: [], error: null },
      game_items: { data: [], error: null },
    });
    const provider = vi.fn(async () => new Response(null, { status: 402 }));
    const { handler } = loadApi('generate-npc-challenges', db.client, provider);
    const response = await handler(request('generate-npc-challenges', { weekToken: '2099-09-09' }, 'user-token'));
    expect(response.status).toBe(200);
    // O catálogo fallback atual tem 12 desafios; Midas ainda não tem template.
    expect((await response.json()).challenges).toHaveLength(12);
    const inserted = db.calls.find((call) => call.table === 'npc_weekly_challenges' && call.action === 'insert');
    expect(inserted).toBeDefined();
    expect((inserted!.payload as Array<{ user_id: string; week_token: string }>).every((row) =>
      row.user_id === 'user-1' && row.week_token === '2099-09-09')).toBe(true);
    expect(db.calls.filter((call) => call.action !== 'select').map((call) => call.table)).toEqual(['npc_weekly_challenges']);
    expect(db.rpc).not.toHaveBeenCalled();
    expect(provider).toHaveBeenCalledOnce();
  });

  it('combat preserves server ownership and rejects a different user combat', async () => {
    const db = fakeClient('user-1', {
      user_inventory: { data: [], error: null },
      user_health_stats: { data: { current_mp: 10, max_mp: 10 }, error: null },
      combates_ativos: { data: { personagem_id: 'user-2' }, error: null },
    });
    const { handler, createClient } = loadApi('processar_turno', db.client);
    const response = await handler(request('processar_turno', {
      combate_id: 'combat-2', acao_escolhida: 'atacar', skill_power: 900,
    }, 'user-token'));
    expect(response.status).toBe(403);
    expect(createClient).toHaveBeenCalledWith('https://local.invalid', 'service-test-key', {
      global: { headers: { Authorization: 'Bearer user-token' } },
    });
    expect(db.calls.find((call) => call.table === 'combates_ativos')?.filters).toContainEqual(['id', 'combat-2']);
    expect(db.calls.every((call) => call.action === 'select')).toBe(true);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('combat still rejects a client claimed unowned skill', async () => {
    const db = fakeClient('user-1', {
      user_inventory: { data: [], error: null },
      skill_tree_nodes: { data: null, error: null },
    });
    const { handler } = loadApi('processar_turno', db.client);
    const response = await handler(request('processar_turno', {
      combate_id: 'combat-1', acao_escolhida: 'atacar', skill_id: 'unowned-skill', skill_power: 900,
    }, 'user-token'));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('skill_not_authorized');
    expect(db.calls.some((call) => call.table === 'combates_ativos')).toBe(false);
    expect(db.rpc).not.toHaveBeenCalled();
  });
});
