// Replays A12's untouched assertions against P13's live-shaped talent schema.
// Transactional defaults turn the older fixture's learned talents into active
// equipment and fill newly required catalogue fields; the source assertions
// remain unchanged. The perfect-day source variant is a separate SQL file.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const [database, port] = process.argv.slice(2);
if (!database?.startsWith('integration_') || !/^\d{2,5}$/.test(port ?? '')) {
  throw new Error('Usage: node scripts/run_reforma_a12_composed.mjs integration_<db> <local-port>');
}
const psql = process.env.PSQL17 ?? (process.platform === 'win32'
  ? 'C:/Program Files/PostgreSQL/17/bin/psql.exe' : 'psql');
const setup = `BEGIN;
ALTER TABLE public.talentos_disponiveis
  ALTER COLUMN nome SET DEFAULT gen_random_uuid()::text,
  ALTER COLUMN descricao SET DEFAULT 'A12 composition fixture';
ALTER TABLE public.talentos_jogador ALTER COLUMN equipped SET DEFAULT true;`;
for (const name of [
  '20261019_effect_undo_assertions.sql',
  '20261019_effect_undo_health.sql',
]) {
  const source = readFileSync(resolve('supabase/tests', name), 'utf8').replace(/\r\n/g, '\n');
  if ((source.match(/^BEGIN;$/gm) ?? []).length !== 1) throw new Error(`${name}: transaction marker drift`);
  const sql = source.replace(/^BEGIN;$/m, setup);
  const result = spawnSync(psql, [
    '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', port,
    '-U', 'postgres', '-d', database, '-f', '-',
  ], { input: sql, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const code = result.status ?? 1;
  console.log(`${name} equipped_fixture=true exit=${code}`);
  if (code !== 0) {
    console.error(result.stderr || result.error?.message || result.stdout);
    process.exit(code);
  }
}
