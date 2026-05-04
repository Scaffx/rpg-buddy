import https from 'https';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF   = 'jfnospjxdkelxlhcwuia';

if (!TOKEN) {
  console.error('❌ SUPABASE_ACCESS_TOKEN não definido');
  process.exit(1);
}

async function runSQL(label, sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const req = https.request({
      hostname: 'api.supabase.com',
      path: `/v1/projects/${REF}/database/query`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(d);
          if (json.error) {
            console.error(`❌ [${label}] erro:`, json.error);
          } else {
            console.log(`✅ [${label}] OK`);
          }
          resolve(json);
        } catch {
          console.log(`✅ [${label}] resposta:`, d.slice(0, 200));
          resolve(d);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── 1. Criar funções RPC de leaderboard ──────────────────────────────────────
const leaderboardSQL = readFileSync(
  join(__dirname, '../supabase/migrations/20260503030000_leaderboard_rpc_functions.sql'),
  'utf8'
);

console.log('\n📊 Criando funções RPC de leaderboard...');
await runSQL('leaderboard_rpc_functions', leaderboardSQL);

// ── 2. Resetar Esqueleto Campeão ─────────────────────────────────────────────
const resetSQL = `
-- Remove vitórias contra o Esqueleto Campeão (reset do boss)
DELETE FROM public.boss_battles
WHERE won = true
  AND boss_id IN (
    SELECT id FROM public.bosses
    WHERE name ILIKE '%esquelet%'
  );

-- Encerra combates ativos contra o Esqueleto
UPDATE public.combates_ativos
SET status = 'abandonado'
WHERE status = 'em_andamento'
  AND boss_id IN (
    SELECT id FROM public.bosses
    WHERE name ILIKE '%esquelet%'
  );
`;

console.log('\n💀 Resetando Esqueleto Campeão...');
await runSQL('reset_esqueleto', resetSQL);

console.log('\n🎉 Tudo pronto!');
