// Independent two-session PostgreSQL probe. Use only a disposable local fixture.
import pg from 'pg';

const [database, portText] = process.argv.slice(2);
const port = Number(portText);
if (!database?.startsWith('integration_') || !Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('Usage: node audit_adventure_concurrency.mjs integration_<db> <local-port>');
}
const config = { host: '127.0.0.1', port, user: 'postgres', database };
const uid = '77777777-7777-7777-7777-777777777777';
const client = () => new pg.Client(config);
const admin = client();
await admin.connect();
try {
  await admin.query('BEGIN');
  await admin.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',
    [uid, 'audit-concurrent@example.invalid']);
  await admin.query("INSERT INTO public.adventure_state(user_id,stage,last_tick_at) VALUES($1,1,now()-interval '30 minutes')", [uid]);
  await admin.query('COMMIT');

  async function sync() {
    const session = client();
    await session.connect();
    try {
      await session.query('BEGIN');
      await session.query('SET LOCAL ROLE authenticated');
      await session.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [uid]);
      const result = await session.query('SELECT public.sync_auto_adventure() AS snapshot');
      await session.query('COMMIT');
      return result.rows[0].snapshot;
    } catch (error) {
      await session.query('ROLLBACK');
      throw error;
    } finally {
      await session.end();
    }
  }
  const snapshots = await Promise.all([sync(), sync()]);
  const proof = (await admin.query(`
    SELECT (SELECT count(*)::int FROM public.adventure_encounters WHERE user_id=$1 AND stage=1) AS encounters,
           (SELECT count(*)::int FROM public.gold_history WHERE user_id=$1 AND type='adventure') AS gold_entries,
           (SELECT gold FROM public.user_balance WHERE user_id=$1) AS gold,
           (SELECT stage FROM public.adventure_state WHERE user_id=$1) AS stage`, [uid])).rows[0];
  if (proof.encounters !== 1 || proof.gold_entries !== 1 || proof.gold !== 104 || proof.stage !== 2 ||
      snapshots.some(s => s.stage !== 2)) {
    throw new Error(`AUDIT_CONCURRENT_REPLAY_FAILED ${JSON.stringify({ proof, stages: snapshots.map(s => s.stage) })}`);
  }
  console.log(`AUDIT_CONCURRENT_REPLAY_PASS ${JSON.stringify(proof)}`);
} finally {
  await admin.query('ROLLBACK');
  await admin.query('BEGIN');
  for (const table of ['adventure_encounters', 'adventure_state', 'gold_history',
    'user_balance', 'attributes', 'profiles']) {
    await admin.query(`DELETE FROM public.${table} WHERE user_id=$1`, [uid]);
  }
  await admin.query('DELETE FROM auth.users WHERE id=$1', [uid]);
  await admin.query('COMMIT');
  await admin.end();
}
