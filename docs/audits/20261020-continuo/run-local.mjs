import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

// Disposable local PostgreSQL only. Databases and cluster are left intact for review.
const root = resolve(import.meta.dirname, '../../..');
const out = import.meta.dirname;
const psql = 'C:/Program Files/PostgreSQL/17/bin/psql.exe';
const createdb = 'C:/Program Files/PostgreSQL/17/bin/createdb.exe';
const port = '55620';
const suffix = process.argv[2] ?? '3a46';
if (!/^[a-z0-9_]+$/.test(suffix)) throw Error('invalid disposable database suffix');
const suites = {
  [`integration_review_continuo_${suffix}`]: [
    'src/test/sql/auto_adventure_fixture.sql',
    'supabase/migrations/20261019194052_auto_adventure.sql',
    'src/test/sql/boss_auto_fixture.sql',
    'supabase/migrations/20261019205224_boss_auto_entitlements.sql',
    'supabase/migrations/20261019211310_auto_adventure_reachable_catalog.sql',
    'src/test/sql/continuous_adventure_fixture.sql',
    'supabase/migrations/20261020040128_continuous_adventure_battle_engine.sql',
    'src/test/sql/continuous_adventure_assert.sql',
    ...(suffix === '3a46' ? [] : ['src/test/sql/continuous_adventure_advance_clock_assert.sql']),
  ],
  [`integration_review_portal_${suffix}`]: [
    'src/test/sql/portal_coop_fixture.sql',
    'supabase/migrations/20261020040235_portal_coop_authoritative.sql',
    'src/test/sql/portal_coop_assert.sql',
  ],
};

const summary = [];
for (const [db, files] of Object.entries(suites)) {
  const create = spawnSync(createdb, ['-h', '127.0.0.1', '-p', port, '-U', 'postgres', db], { encoding: 'utf8' });
  summary.push(`${db} create exit=${create.status ?? 1} ${create.stderr.trim()}`);
  if (create.status !== 0) break;
  for (const file of files) {
    const sql = readFileSync(resolve(root, file), 'utf8').replace(/\r\n/g, '\n');
    const hash = createHash('sha256').update(sql).digest('hex');
    const result = spawnSync(psql, ['-X', '-v', 'ON_ERROR_STOP=1', '-q', '-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', db, '-f', '-'], {
      input: sql, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    });
    const line = `${db} ${file} sha256_lf=${hash} exit=${result.status ?? 1}`;
    summary.push(line);
    writeFileSync(resolve(out, `${db}-${file.split('/').at(-1)}.log`), `${line}\n${result.stdout}\n${result.stderr}`);
    if (result.status !== 0) break;
  }
}
writeFileSync(resolve(out, suffix === '3a46' ? 'local-suite.log' : `local-suite-${suffix}.log`), summary.join('\n') + '\n');
console.log(summary.join('\n'));
if (summary.some(line => /exit=[1-9]/.test(line))) process.exit(1);
