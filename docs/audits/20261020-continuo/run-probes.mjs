import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const psql = 'C:/Program Files/PostgreSQL/17/bin/psql.exe';
const suffix = process.argv[2] ?? '3a46';
if (!/^[a-z0-9_]+$/.test(suffix)) throw Error('invalid disposable database suffix');
const probes = [
  [`integration_review_continuo_${suffix}`, 'probe_adventure_legacy.sql'],
  [`integration_review_continuo_${suffix}`, 'probe_adventure_offline.sql'],
  ...(suffix === '3a46' ? [[`integration_review_continuo_${suffix}`, 'probe_advance_pending_catchup.sql']] : []),
  ...(suffix === '3a46' ? [] : [[`integration_review_continuo_${suffix}`, 'probe_advance_clock_fixed.sql']]),
  [`integration_review_portal_${suffix}`, 'probe_portal_dual_boss.sql'],
  [`integration_review_portal_${suffix}`, 'probe_portal_membership.sql'],
  [`integration_review_portal_${suffix}`, 'probe_portal_reward_replay.sql'],
];
const lines = [];
for (const [db, file] of probes) {
  const sql = readFileSync(resolve(import.meta.dirname, file), 'utf8').replace(/\r\n/g, '\n');
  const sha = createHash('sha256').update(sql).digest('hex');
  const command = `psql -X -v ON_ERROR_STOP=1 -q -h 127.0.0.1 -p 55620 -U postgres -d ${db} -f ${file}`;
  const result = spawnSync(psql, ['-X', '-v', 'ON_ERROR_STOP=1', '-q', '-h', '127.0.0.1', '-p', '55620', '-U', 'postgres', '-d', db, '-f', '-'], {
    input: sql, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  });
  lines.push(`${command}\nsha256_lf=${sha} exit=${result.status ?? 1}\n${result.stdout}\n${result.stderr}`);
  if (result.status !== 0) break;
}
writeFileSync(resolve(import.meta.dirname, suffix === '3a46' ? 'independent-probes.log' : `independent-probes-${suffix}.log`), lines.join('\n'));
console.log(lines.join('\n'));
if (lines.some(line => /exit=[1-9]/.test(line))) process.exit(1);
