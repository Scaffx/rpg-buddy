// Independent negative probe: the historical co-op RPC is still shipped and
// untouched by the eleven 2026-10-19 migrations. Use only an isolated local DB
// seeded with the 20260503 co-op migration before the new chain.
import pg from 'pg';
import { setTimeout as delay } from 'node:timers/promises';

const [database, portText] = process.argv.slice(2);
const port = Number(portText);
if (!database?.startsWith('integration_') || !Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('Usage: node audit_coop_concurrency.mjs integration_<db> <local-port>');
}
const config = { host: '127.0.0.1', port, user: 'postgres', database };
const uid = '88888888-8888-8888-8888-888888888888';
const mid = '88888888-8888-8888-8888-888888888889';
const admin = new pg.Client(config);
await admin.connect();
try {
  await admin.query('BEGIN');
  await admin.query('INSERT INTO auth.users(id,email) VALUES($1,$2)', [uid, 'audit-coop@example.invalid']);
  await admin.query('INSERT INTO public.co_op_missions(id,creator_id,title,description) VALUES($1,$2,$3,$4)',
    [mid, uid, 'Audit', 'Race probe']);
  await admin.query('INSERT INTO public.co_op_mission_members(mission_id,user_id) VALUES($1,$2)', [mid, uid]);
  await admin.query('COMMIT');

  await admin.query('BEGIN');
  await admin.query('SELECT id FROM public.profiles WHERE user_id=$1 FOR UPDATE', [uid]);
  async function claim() {
    const session = new pg.Client(config);
    await session.connect();
    try {
      await session.query('BEGIN');
      await session.query('SET LOCAL ROLE authenticated');
      await session.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [uid]);
      await session.query('SELECT public.complete_co_op_mission($1)', [mid]);
      await session.query('COMMIT');
      return 'success';
    } catch (error) {
      await session.query('ROLLBACK');
      return `error:${error.message}`;
    } finally {
      await session.end();
    }
  }
  const first = claim();
  await delay(150);
  const second = claim();
  await delay(150);
  await admin.query('COMMIT');
  const outcomes = await Promise.all([first, second]);
  const proof = (await admin.query(`
    SELECT (SELECT total_xp FROM public.profiles WHERE user_id=$1) AS total_xp,
           (SELECT count(*)::int FROM public.activity_log WHERE user_id=$1 AND action='co_op_mission_completed') AS activity_rows,
           (SELECT xp_claimed FROM public.co_op_mission_members WHERE mission_id=$2 AND user_id=$1) AS claimed`,
    [uid, mid])).rows[0];
  console.log(`AUDIT_COOP_CONCURRENT_OBSERVED ${JSON.stringify({ outcomes, proof })}`);
  if (proof.total_xp !== 25 || proof.activity_rows !== 1) {
    throw new Error('AUDIT_COOP_DUPLICATE_XP: two concurrent calls credited one collective mission twice');
  }
} finally {
  await admin.query('ROLLBACK');
  await admin.query('BEGIN');
  await admin.query('DELETE FROM public.activity_log WHERE user_id=$1', [uid]);
  await admin.query('DELETE FROM public.co_op_missions WHERE id=$1', [mid]);
  for (const table of ['attributes', 'profiles', 'user_balance']) {
    await admin.query(`DELETE FROM public.${table} WHERE user_id=$1`, [uid]);
  }
  await admin.query('DELETE FROM auth.users WHERE id=$1', [uid]);
  await admin.query('COMMIT');
  await admin.end();
}
