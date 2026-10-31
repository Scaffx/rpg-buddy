// Local PG17 reduced fixture only. Installs the historical weekly evaluator and
// start trigger omitted by progressao_live_fixture.sql, without replaying old
// migrations over the current completion wrapper.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const database = process.argv[2];
const port = process.argv[3];
if (!database?.startsWith('integration_d1_') || !/^\d{2,5}$/.test(port ?? '')) {
  console.error('Usage: node prepare_predecessors.mjs integration_d1_<db> <local-port>');
  process.exit(2);
}
const oldWeekly = readFileSync(resolve('supabase/migrations/20260727200031_weekly_mission_started_at.sql'), 'utf8').replace(/\r\n/g, '\n');
const oldClosure = readFileSync(resolve('supabase/migrations/20260727172109_weekly_mission_closure.sql'), 'utf8').replace(/\r\n/g, '\n');
const statusMigration = readFileSync(resolve('supabase/migrations/20261020020920_normalize_mission_status_for_completion.sql'), 'utf8').replace(/\r\n/g, '\n');
const capMigration = readFileSync(resolve('supabase/migrations/20260728033416_flexible_mission_target_cap.sql'), 'utf8').replace(/\r\n/g, '\n');
function extract(sql, signature) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${signature}`);
  if (start < 0 || sql.indexOf(`CREATE OR REPLACE FUNCTION ${signature}`, start + 1) >= 0) throw new Error(`ambiguous function ${signature}`);
  const end = sql.indexOf('\n$$;', start);
  if (end < 0) throw new Error(`unterminated function ${signature}`);
  return sql.slice(start, end + 4);
}
function extractDelimited(sql, prefix, delimiter) {
  const start = sql.indexOf(prefix);
  if (start < 0 || sql.indexOf(prefix, start + 1) >= 0) throw new Error(`ambiguous function ${prefix}`);
  const end = sql.indexOf(`\n${delimiter};`, start);
  if (end < 0) throw new Error(`unterminated function ${prefix}`);
  return sql.slice(start, end + delimiter.length + 2);
}
const tableSql = `
-- This reduced fixture originally omitted the live mission-table RLS and two
-- unrelated BEFORE triggers. Recreate their exact sources for preflight only.
ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can create own missions" ON public.missions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own missions" ON public.missions FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Users can update own missions" ON public.missions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can view own missions" ON public.missions FOR SELECT USING (auth.uid() = user_id);
${extractDelimited(statusMigration, 'CREATE FUNCTION private.normalize_mission_status()', '$normalize$')}
REVOKE ALL ON FUNCTION private.normalize_mission_status() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER before_mission_status_normalize BEFORE INSERT OR UPDATE ON public.missions
  FOR EACH ROW EXECUTE FUNCTION private.normalize_mission_status();
${extract(capMigration, 'public._sync_weekly_mission_target_cap()')}
REVOKE ALL ON FUNCTION public._sync_weekly_mission_target_cap() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public._sync_weekly_mission_target_cap() TO service_role;
CREATE TRIGGER sync_weekly_mission_target_cap BEFORE INSERT OR UPDATE OF frequency_type,target_count,max_count
  ON public.missions FOR EACH ROW EXECUTE FUNCTION public._sync_weekly_mission_target_cap();
`;
const sql = `
ALTER TABLE public.profiles ADD COLUMN streak_protector_max integer DEFAULT 3,
  ADD COLUMN streak_protector_charges integer DEFAULT 2,
  ADD COLUMN streak_protector_week text,
  ADD COLUMN streak_current_days integer DEFAULT 0;
ALTER TABLE public.missions ADD COLUMN failed_date date;
${extract(oldWeekly, 'public._set_mission_weekly_started_at()')}
REVOKE ALL ON FUNCTION public._set_mission_weekly_started_at() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public._set_mission_weekly_started_at() TO service_role;
CREATE TRIGGER set_mission_weekly_started_at BEFORE INSERT OR UPDATE OF frequency_type,weekly_started_at
  ON public.missions FOR EACH ROW EXECUTE FUNCTION public._set_mission_weekly_started_at();
${extract(oldWeekly, 'public._evaluate_weekly_missions(')}
REVOKE ALL ON FUNCTION public._evaluate_weekly_missions(uuid,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public._evaluate_weekly_missions(uuid,date) TO service_role;
${extract(oldClosure, 'public.check_weekly_mission_failures()')}
REVOKE ALL ON FUNCTION public.check_weekly_mission_failures() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.check_weekly_mission_failures() TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.complete_mission(uuid,date), public.undo_mission(uuid,date) TO service_role;
${tableSql}
`;
const psql = process.env.PSQL17 ?? (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/17/bin/psql.exe' : 'psql');
const result = spawnSync(psql, ['-X','-v','ON_ERROR_STOP=1','-1','-h','127.0.0.1','-p',port,'-U','postgres','-d',database,'-f','-'],
  { input: process.argv.includes('--table-only') ? tableSql : sql, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
process.exit(result.status ?? 1);
