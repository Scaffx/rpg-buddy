import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const releaseDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(releaseDir, '../../..');
const manifest = JSON.parse(readFileSync(resolve(releaseDir, 'manifest.json'), 'utf8'));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function replaceOnce(source, oldText, newText, label) {
  assert(source.includes(oldText), `Missing ${label}`);
  assert(!source.includes(oldText, source.indexOf(oldText) + 1), `Repeated ${label}`);
  return source.replace(oldText, newText);
}

function removeUntil(source, start, end, label) {
  const startIndex = source.indexOf(start);
  assert(startIndex >= 0, `Missing ${label} start`);
  const endIndex = source.indexOf(end, startIndex);
  assert(endIndex > startIndex, `Missing ${label} end`);
  return source.slice(0, startIndex) + source.slice(endIndex);
}

function expectedPatch(name, source) {
  if (name === 'processar_turno') {
    source = replaceOnce(source,
      "const SUBSCRIPTION_ENV = Deno.env.get('PADDLE_ENVIRONMENT') === 'sandbox' ? 'sandbox' : 'live';\n", '', 'combat environment');
    source = removeUntil(source, 'const ensureActiveSubscriptionOrThrow = async', 'const detectSkillElement', 'combat payment helper');
    source = replaceOnce(source, '    await ensureActiveSubscriptionOrThrow(supabase, user.id);\n\n', '', 'combat payment call');
    source = removeUntil(source,
      "    if (error instanceof Error && (error as Error & { code?: string }).code === 'PAYWALL_LOCKED') {",
      "    console.error('processar_turno error:'", 'combat payment catch');
    return source;
  }

  source = replaceOnce(source,
    'const SUBSCRIPTION_ENV = Deno.env.get("PADDLE_ENVIRONMENT") === "sandbox" ? "sandbox" : "live";\n', '', `${name} environment`);
  source = removeUntil(source, 'async function ensureActiveSubscriptionOrThrow',
    name === 'ai-chat' ? 'serve(async' : 'function buildFallbackChallenges', `${name} payment helper`);
  if (name === 'generate-npc-challenges') {
    source = replaceOnce(source,
      '    if (!userId) {\n      throw new Error("Usuário inválido.");\n    }\n\n    await ensureActiveSubscriptionOrThrow(supabase, userId);',
      '    if (!userId) {\n      return new Response(JSON.stringify({ error: "Usuário inválido." }), {\n        status: 401,\n        headers: { ...corsHeaders, "Content-Type": "application/json" },\n      });\n    }', 'NPC auth and payment call');
    source = removeUntil(source,
      '    if (error instanceof Error && (error as Error & { code?: string }).code === "PAYWALL_LOCKED") {',
      '    const message = error instanceof Error', 'NPC payment catch');
    return source.endsWith('\n') ? source : `${source}\n`;
  }
  source = replaceOnce(source, '    await ensureActiveSubscriptionOrThrow(supa, userId);\n\n', '', `${name} payment call`);
  source = replaceOnce(source,
    '        if (aiResp.status === 402) {\n' +
    '          return new Response(JSON.stringify({ error: "Créditos de IA esgotados." }), {\n' +
    '            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },\n' +
    '          });\n' +
    '        }',
    '        if (aiResp.status === 402) {\n' +
    '          console.error("AI provider credit error:", aiResp.status);\n' +
    '          return new Response(JSON.stringify({ error: "Serviço de IA temporariamente indisponível." }), {\n' +
    '            status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },\n' +
    '          });\n' +
    '        }', `${name} provider credit response`);
  source = removeUntil(source,
    '    if (e instanceof Error && (e as Error & { code?: string }).code === "PAYWALL_LOCKED") {',
    '    console.error("ai-chat error:"', `${name} payment catch`);
  return source;
}

for (const [name, item] of Object.entries(manifest.functions)) {
  const live = readFileSync(resolve(releaseDir, item.live_file));
  const base = readFileSync(resolve(releaseDir, item.base_file));
  const patched = readFileSync(resolve(releaseDir, item.patched_file));
  const working = readFileSync(resolve(root, item.working_file));
  assert.equal(sha256(live), item.live_sha256, `${name} LIVE hash drift`);
  assert.equal(sha256(base), item.base_sha256, `${name} base hash drift`);
  assert.equal(sha256(patched), item.patched_sha256, `${name} patched hash drift`);
  assert.equal(sha256(working), item.patched_sha256, `${name} working copy drift`);
  const actual = patched.toString('utf8');
  const expected = expectedPatch(name, base.toString('utf8'));
  if (actual !== expected) {
    let firstDiff = 0;
    while (firstDiff < actual.length && actual[firstDiff] === expected[firstDiff]) firstDiff++;
    throw new Error(`${name} unexpected base diff at ${firstDiff}: actual=${JSON.stringify(actual.slice(firstDiff - 40, firstDiff + 80))}, expected=${JSON.stringify(expected.slice(firstDiff - 40, firstDiff + 80))}`);
  }
  assert(!/has_active_subscription|PADDLE_ENVIRONMENT|PAYWALL_LOCKED/.test(patched.toString('utf8')), `${name} paywall remains`);
  if (name === 'processar_turno') {
    assert(!/add_xp_to_user|add_gold_to_user|xp_history|gold_history|boss_battles|boss_weekly_loot_claims/.test(patched.toString('utf8')), 'combat reward path remains');
  } else {
    assert(!/add_xp_to_user|add_gold_to_user|\.from\(["']xp_history["']\)|\.from\(["']gold_history["']\)/.test(patched.toString('utf8')), `${name} direct reward path remains`);
  }
  console.log(`${name}: LIVE v${item.live_version}, verify_jwt=${item.verify_jwt}, archive/base hashes and selective diff PASS`);
}

console.log('All Edge release files match their documented bases and working sources.');
