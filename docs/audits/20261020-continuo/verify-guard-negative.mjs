import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const psql = 'C:/Program Files/PostgreSQL/17/bin/psql.exe';
const createdb = 'C:/Program Files/PostgreSQL/17/bin/createdb.exe';
const tag = process.argv[2] ?? 'fixed503';
if (!/^[a-z0-9_]+$/.test(tag)) throw Error('invalid disposable database suffix');
const log = [];
let failed = false;

function run(db, file) {
  const sql = readFileSync(resolve(root, file), 'utf8').replace(/\r\n/g, '\n');
  return spawnSync(psql, ['-X', '-v', 'ON_ERROR_STOP=1', '-q', '-h', '127.0.0.1', '-p', '55620', '-U', 'postgres', '-d', db, '-f', '-'], {
    input: sql, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  });
}

for (const [caseName, mutation] of [
  ['noop', 'docs/audits/20261020-continuo/probe_portal_guard_drift.sql'],
  ['binding', 'docs/audits/20261020-continuo/probe_portal_guard_binding.sql'],
]) {
  const db = `integration_review_guard_${caseName}_${tag}`;
  const create = spawnSync(createdb, ['-h', '127.0.0.1', '-p', '55620', '-U', 'postgres', db], { encoding: 'utf8' });
  log.push(`${db} createdb exit=${create.status ?? 1}\n${create.stderr}`);
  if (create.status !== 0) { failed = true; break; }
  for (const file of ['src/test/sql/portal_coop_fixture.sql', mutation]) {
    const result = run(db, file);
    log.push(`${db} ${file} exit=${result.status ?? 1}\n${result.stdout}\n${result.stderr}`);
    if (result.status !== 0) { failed = true; break; }
  }
  if (failed) break;
  const migrated = run(db, 'supabase/migrations/20261020040235_portal_coop_authoritative.sql');
  log.push(`${db} migration expected_exit=3 actual_exit=${migrated.status ?? 1}\n${migrated.stdout}\n${migrated.stderr}`);
  if (migrated.status !== 3 || !migrated.stderr.includes('Profile guard')) failed = true;
  const check = spawnSync(psql, ['-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', '55620', '-U', 'postgres', '-d', db,
    '-Atc', "SELECT to_regclass('public.portal_coop_config') IS NULL"], { encoding: 'utf8' });
  log.push(`${db} no_ddl exit=${check.status ?? 1} value=${check.stdout.trim()}\n${check.stderr}`);
  if (check.status !== 0 || check.stdout.trim() !== 't') failed = true;
}
writeFileSync(resolve(import.meta.dirname, `guard-negative-${tag}.log`), log.join('\n'));
console.log(log.filter(line => line.includes('exit=') || line.includes('no_ddl')).join('\n').slice(0, 3500));
if (failed) process.exit(1);
