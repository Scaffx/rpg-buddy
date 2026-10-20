import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
const db = process.argv[2];
const port = process.argv[3];
if (!/^integration_cold_[a-z0-9_]+$/.test(db ?? '') || port !== '55579') {
  throw new Error('Expected local integration_cold_* database on port 55579');
}
const dir = 'supabase/migrations';
const names = readdirSync(dir).filter(x => x.startsWith('20261019') && x.endsWith('.sql')).sort();
const cutoff = names.indexOf('20261019220257_undo_mission_derived_effect_receipts.sql');
if (cutoff !== 11) throw new Error(`Expected 11 source migrations before A12, got ${cutoff}`);
for (const name of names.slice(0, cutoff)) {
  const source = readFileSync(join(dir, name), 'utf8').replace(/\r\n/g, '\n');
  const result = spawnSync('C:/Program Files/PostgreSQL/17/bin/psql.exe',
    ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-1', '-h', '127.0.0.1', '-p', port,
      '-U', 'postgres', '-d', db, '-f', '-'],
    { input: source, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  console.log(`${name} exit=${result.status}`);
  if (result.status !== 0) {
    console.error(result.stderr || result.error?.message || result.stdout);
    process.exit(result.status ?? 1);
  }
}
