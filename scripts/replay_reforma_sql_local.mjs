import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

// Local composition replay only. Each source is normalized to Git's LF form so
// guarded function hashes are independent of Windows checkout line endings.
const migrations = [
  '20261019193625_progressao_reversao_checklist.sql',
  '20261019194052_auto_adventure.sql',
  '20261019200215_mission_priority_daily_caps.sql',
  '20261019204003_close_forged_xp_buff_and_npc_undo.sql',
  '20261019204951_mission_priority_paid_cap_lock_order.sql',
  '20261019205224_boss_auto_entitlements.sql',
  '20261019205347_guard_mission_completion_schedule_and_undo_after_paid_cap.sql',
  '20261019210026_inventory_authorship.sql',
  '20261019210221_attribute_award_receipts.sql',
  '20261019211310_auto_adventure_reachable_catalog.sql',
  '20261019212523_restore_unpaid_weekly_milestone_after_target_edit.sql',
];

const database = process.argv[2];
const port = process.argv[3];
const stopBeforeA6 = process.argv[4] === '--stop-before-a6';
if (!database?.startsWith('integration_') || !/^\d{2,5}$/.test(port ?? '') ||
    (process.argv[4] && !stopBeforeA6)) {
  console.error('Usage: node scripts/replay_reforma_sql_local.mjs integration_<db> <local-port> [--stop-before-a6]');
  process.exit(2);
}

const psql = process.env.PSQL17 ?? (process.platform === 'win32'
  ? 'C:/Program Files/PostgreSQL/17/bin/psql.exe'
  : 'psql');

for (const name of stopBeforeA6 ? migrations.slice(0, -1) : migrations) {
  const path = resolve('supabase/migrations', name);
  const sql = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  const sha256 = createHash('sha256').update(sql).digest('hex');
  const result = spawnSync(psql, [
    '-X', '-v', 'ON_ERROR_STOP=1', '-1', '-h', '127.0.0.1', '-p', port,
    '-U', 'postgres', '-d', database, '-f', '-',
  ], { input: sql, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const code = result.status ?? 1;
  console.log(`${name} sha256_lf=${sha256} exit=${code}`);
  if (code !== 0) {
    console.error(result.stderr || result.error?.message || result.stdout);
    process.exit(code);
  }
}
