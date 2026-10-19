import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const releaseDir = resolve(process.cwd(), 'supabase/releases/20261019/processar_turno');
const published = readFileSync(resolve(releaseDir, 'published-v33.ts'), 'utf8');
const patched = readFileSync(resolve(releaseDir, 'index.ts'), 'utf8');

type Call = { table: string; action: string; payload?: unknown; columns?: string };
type Fixture = { priorVictory?: boolean; weeklyClaimed?: boolean; authenticated?: boolean; winning?: boolean };

function fakeClient(fixture: Fixture) {
  const calls: Call[] = [];
  const combat = {
    id: 'combat-1', personagem_id: 'user-1', hp_atual_boss: fixture.winning ? 1 : 1000,
    hp_atual_personagem: 200, turno_atual: 'player', status: 'em_andamento',
    boss_id: 'boss-1', boss_status: null,
    personagens: { id: 'user-1', ataque_base: fixture.winning ? 100 : 1, defesa_base: 1, nivel: 1, hp_max: 200 },
    bosses: { id: 'boss-1', name: 'Chefe de teste', ataque_base: 1, defesa_base: 0,
      level: 1, hp: fixture.winning ? 1 : 1000, element: '', skills: [], signature_item_name: null },
  };

  function result(call: Call) {
    calls.push(call);
    if (call.action !== 'select') {
      if (call.table === 'combat_turn_logs' && call.action === 'insert') return { data: { id: 'log-1' }, error: null };
      return { data: null, error: null };
    }
    switch (call.table) {
      case 'user_inventory': return { data: call.columns === 'id' ? null : [], error: null };
      case 'player_skill_nodes': return { data: [], error: null };
      case 'user_health_stats': return { data: call.columns?.includes('current_mp')
        ? { current_mp: 50, max_mp: 50 } : { id: 'health-1', max_hp: 200, fatigue: 0 }, error: null };
      case 'combates_ativos': return { data: combat, error: null };
      case 'profiles': return { data: call.columns?.includes('total_xp')
        ? { total_xp: 100, level: 1 } : { inspired_available: false }, error: null };
      case 'combat_turn_logs': return { data: null, error: null };
      case 'boss_battles': return { data: fixture.priorVictory ? { id: 'prior-1' } : null, error: null };
      case 'boss_weekly_loot_claims': return { data: fixture.weeklyClaimed ? { id: 'weekly-1' } : null, error: null };
      case 'user_balance': return { data: { gold: 100 }, error: null };
      case 'user_crafting_materials': return { data: { quantity: 2 }, error: null };
      case 'game_items': return { data: call.columns?.includes('icon, rarity')
        ? { id: 'item-1', name: 'Item de teste', icon: 'test', rarity: 'common' } : null, error: null };
      default: throw new Error(`Unexpected local table: ${call.table}`);
    }
  }

  const client = {
    auth: { getUser: async () => ({ data: { user: fixture.authenticated === false ? null : { id: 'user-1' } }, error: null }) },
    rpc: async (name: string) => {
      expect(name).toBe('has_active_subscription');
      return { data: true, error: null };
    },
    from: (table: string) => {
      let action = 'select';
      let payload: unknown;
      let columns: string | undefined;
      let executed = false;
      let cached: ReturnType<typeof result>;
      const execute = () => {
        if (!executed) {
          cached = result({ table, action, payload, columns });
          executed = true;
        }
        return Promise.resolve(cached);
      };
      const chain = {
        select(value: string) { columns = value; return chain; },
        update(value: unknown) { action = 'update'; payload = value; return chain; },
        insert(value: unknown) { action = 'insert'; payload = value; return chain; },
        eq() { return chain; },
        order() { return chain; },
        limit() { return chain; },
        single: execute,
        maybeSingle: execute,
        then(onFulfilled: (value: ReturnType<typeof result>) => unknown, onRejected?: (error: unknown) => unknown) {
          return execute().then(onFulfilled, onRejected);
        },
      };
      return chain;
    },
  };
  return { client, calls };
}

async function invoke(source: string, fixture: Fixture = {}, method = 'POST') {
  const { client, calls } = fakeClient(fixture);
  let handler: ((request: Request) => Promise<Response>) | undefined;
  const deno = {
    env: { get: (key: string) => ({ SUPABASE_URL: 'https://local.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-only' } as Record<string, string>)[key] },
    serve: (fn: typeof handler) => { handler = fn; },
  };
  const js = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const requireMock = (id: string) => {
    expect(id).toBe('https://esm.sh/@supabase/supabase-js@2.57.4');
    return { createClient: () => client };
  };
  new Function('require', 'Deno', 'exports', js)(requireMock, deno, {});
  expect(handler).toBeDefined();
  const response = await handler!(new Request('https://local.invalid/processar_turno', {
    method,
    headers: method === 'OPTIONS' ? {} : { Authorization: 'Bearer synthetic-user-token', 'Content-Type': 'application/json' },
    ...(method === 'OPTIONS' ? {} : { body: JSON.stringify({ combate_id: 'combat-1', acao_escolhida: 'atacar' }) }),
  }));
  return { response, json: response.status === 200 && method !== 'OPTIONS' ? await response.json() : null, calls };
}

const economicTables = new Set(['boss_battles', 'boss_weekly_loot_claims', 'user_balance', 'user_crafting_materials']);
function expectNoLegacyReward(calls: Call[]) {
  expect(calls.filter((call) => economicTables.has(call.table))).toEqual([]);
  expect(calls.filter((call) => call.table === 'user_inventory' && call.action !== 'select')).toEqual([]);
  expect(calls.filter((call) => call.table === 'profiles' && call.action === 'update'
    && ('total_xp' in (call.payload as object) || 'level' in (call.payload as object)))).toEqual([]);
  expect(calls.filter((call) => call.table === 'activity_log' && call.action === 'insert'
    && ((call.payload as { xp_gained?: number }).xp_gained ?? 0) > 0)).toEqual([]);
  expect(calls.filter((call) => call.table === 'activity_log' && call.action === 'insert'
    && (call.payload as { action?: string }).action !== 'combat_turn')).toEqual([]);
}

describe('published v33 processar_turno release patch', () => {
  beforeEach(() => { vi.spyOn(Math, 'random').mockReturnValue(0.5); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('has exactly one contiguous deletion covering both published reward blocks', () => {
    expect(createHash('sha256').update(published, 'utf8').digest('hex'))
      .toBe('c010dd703c9ebf3676252141d8893333856b38971b7b2debd6e5844851220c01');
    expect(createHash('sha256').update(patched, 'utf8').digest('hex'))
      .toBe('6943cd24afe689cf8fb6f4b39f9a29eeb546cedfd773c38f0f2755c3cc44feba');
    const start = published.indexOf('    const isImmortalBoss = /guerreiro');
    const end = published.indexOf('    return new Response(', start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const deleted = published.slice(start, end);
    expect(deleted).toContain(".from('boss_battles')");
    expect(deleted).toContain(".from('boss_weekly_loot_claims')");
    expect(deleted).toContain(".from('user_inventory').insert");
    expect(patched).toBe(published.slice(0, start) + published.slice(end));
  });

  it.each([
    { priorVictory: false, weeklyClaimed: false },
    { priorVictory: true, weeklyClaimed: false },
    { priorVictory: true, weeklyClaimed: true },
  ])('keeps winning combat contract without legacy rewards: %j', async (fixture) => {
    const old = await invoke(published, { ...fixture, winning: true });
    const next = await invoke(patched, { ...fixture, winning: true });
    expect(old.response.status).toBe(200);
    expect(next.response.status).toBe(200);
    expect(next.response.headers.get('access-control-allow-origin')).toBe('*');
    expect(old.json.status).toBe('vitoria');
    expect(next.json.status).toBe('vitoria');
    expect(Object.keys(next.json).sort()).toEqual(Object.keys(old.json).sort());
    expect(next.json.loot_drop).toBeNull();
    expect({ ...next.json, loot_drop: old.json.loot_drop }).toEqual(old.json);
    expect(next.calls.some((call) => call.table === 'combates_ativos' && call.action === 'update')).toBe(true);
    expect(next.calls.some((call) => call.table === 'combat_turn_logs' && call.action === 'insert')).toBe(true);
    expect(next.calls.some((call) => call.table === 'user_health_stats' && call.action === 'update')).toBe(true);
    expect(old.calls.some((call) => economicTables.has(call.table))).toBe(true);
    if (!fixture.priorVictory) {
      expect(old.calls.some((call) => call.table === 'boss_battles' && call.action === 'insert'
        && (call.payload as { won?: boolean }).won === true)).toBe(true);
      expect(old.calls.some((call) => call.table === 'profiles' && call.action === 'update'
        && 'total_xp' in (call.payload as object))).toBe(true);
      expect(old.calls.some((call) => call.table === 'activity_log' && call.action === 'insert'
        && ((call.payload as { xp_gained?: number }).xp_gained ?? 0) > 0)).toBe(true);
    }
    if (fixture.weeklyClaimed) {
      expect(old.calls.some((call) => call.table === 'user_crafting_materials' && call.action === 'update')).toBe(true);
    } else {
      expect(old.calls.some((call) => call.table === 'boss_weekly_loot_claims' && call.action === 'insert')).toBe(true);
      expect(old.calls.some((call) => call.table === 'user_inventory' && call.action === 'insert')).toBe(true);
    }
    expectNoLegacyReward(next.calls);
  });

  it('keeps an ordinary non-economic combat turn', async () => {
    const { response, json, calls } = await invoke(patched, { winning: false });
    expect(response.status).toBe(200);
    expect(json.status).toBe('em_andamento');
    expect(calls.some((call) => call.table === 'combat_turn_logs' && call.action === 'insert')).toBe(true);
    expectNoLegacyReward(calls);
  });

  it('rejects an unauthenticated user before any table access', async () => {
    const { response, calls } = await invoke(patched, { authenticated: false });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(calls).toEqual([]);
  });

  it('preserves CORS preflight without auth or table access', async () => {
    const { response, calls } = await invoke(patched, {}, 'OPTIONS');
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('access-control-allow-headers')).toContain('authorization');
    expect(calls).toEqual([]);
  });
});
