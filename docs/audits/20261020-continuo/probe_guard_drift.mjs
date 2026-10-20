import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const db = 'integration_review_guard_b_3a46';
const args = ['-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', '55620', '-U', 'postgres', '-d', db, '-f', '-'];
const psql = 'C:/Program Files/PostgreSQL/17/bin/psql.exe';
const create = spawnSync('C:/Program Files/PostgreSQL/17/bin/createdb.exe',
  ['-h', '127.0.0.1', '-p', '55620', '-U', 'postgres', db], { encoding: 'utf8' });
if (create.status !== 0) throw Error(`createdb exit ${create.status}: ${create.stderr}`);
const steps = [
  'src/test/sql/portal_coop_fixture.sql',
  'docs/audits/20261020-continuo/probe_portal_guard_drift.sql',
  'supabase/migrations/20261020040235_portal_coop_authoritative.sql',
  'docs/audits/20261020-continuo/probe_portal_guard_after.sql',
];
const log = [`${db} create exit=${create.status}`];
for (const file of steps) {
  const sql = readFileSync(resolve(root, file), 'utf8').replace(/\r\n/g, '\n');
  const result = spawnSync(psql, args, { input: sql, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  log.push(`${file} exit=${result.status ?? 1}\n${result.stdout}\n${result.stderr}`);
  if (result.status !== 0) break;
}
writeFileSync(resolve(import.meta.dirname, 'guard-drift.log'), log.join('\n'));
console.log(log.join('\n'));
if (log.some(line => /exit=[1-9]/.test(line))) process.exit(1);
