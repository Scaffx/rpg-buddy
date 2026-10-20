// Independent PG17 two-session proof. Run only on the disposable cloned
// integration_cold_race database at port 55579; retain DB/log for inspection.
import pg from 'pg';

const config = { host: '127.0.0.1', port: 55579, user: 'postgres', database: 'integration_cold_race' };
const uid = 'a1900000-0000-0000-0000-000000000001';
const a = 'a1900000-0000-0000-0000-000000000101';
const b = 'a1900000-0000-0000-0000-000000000102';
const talent = 'a1900000-0000-0000-0000-000000000011';
const daySql = "(now() AT TIME ZONE 'America/Sao_Paulo')::date";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const client = name => new pg.Client({ ...config, application_name: name });

async function authenticated(name) {
  const c = client(name);
  await c.connect();
  await c.query('BEGIN');
  await c.query('SET LOCAL ROLE authenticated');
  await c.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [uid]);
  return c;
}
async function blockers(admin, pid) {
  for (let i = 0; i < 15; i++) {
    const { rows } = await admin.query(
      'SELECT pg_blocking_pids($1::int) AS blockers, wait_event_type, wait_event FROM pg_stat_activity WHERE pid=$1',
      [pid]);
    if (rows[0]?.blockers?.length) return rows[0];
    await sleep(50);
  }
  throw new Error(`No lock blocker observed for pid ${pid}`);
}
async function run() {
  const admin = client('cold-audit-admin');
  await admin.connect();
  try {
    await admin.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',
      [uid, 'cold-origin-race@example.invalid']);
    await admin.query(`INSERT INTO public.talentos_disponiveis(id,nome,descricao,efeito)
      VALUES($1,'Race social','Race social','presenca_inspiradora')`, [talent]);
    await admin.query(`INSERT INTO public.talentos_jogador(personagem_id,talento_id,equipped)
      VALUES($1,$2,true)`, [uid, talent]);
    for (const [id, title] of [[a, 'social A'], [b, 'social B']]) {
      await admin.query(`INSERT INTO public.missions
        (id,user_id,title,priority,frequency_type,days_of_week,mission_category)
        VALUES($1,$2,$3,'baixa','daily',
          '["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]'::jsonb,'social')`,
        [id, uid, title]);
    }

    const first = await authenticated('cold-complete-a');
    let second;
    try {
      await first.query(`SELECT public.complete_mission($1,${daySql})`, [a]);
      const secondReady = (async () => {
        second = await authenticated('cold-complete-b');
        const pid = (await second.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        const work = second.query(`SELECT public.complete_mission($1,${daySql})`, [b]);
        return { pid, work };
      })();
      const { pid, work } = await secondReady;
      const wait = await blockers(admin, pid);
      if (wait.wait_event !== 'advisory') throw new Error(`Wrong complete lock: ${JSON.stringify(wait)}`);
      await first.query('COMMIT');
      await work;
      await second.query('COMMIT');
      const receipts = (await admin.query(
        'SELECT count(*)::int AS n FROM private.mission_effect_receipts WHERE user_id=$1', [uid])).rows[0].n;
      if (receipts !== 2) throw new Error(`Expected two source receipts, got ${receipts}`);
      console.log(`COMPLETE_RACE_PASS blocker=${wait.wait_event} receipts=${receipts}`);
    } finally {
      await first.end();
      if (second) await second.end();
    }

    const undo = await authenticated('cold-undo-a');
    let edit;
    try {
      await undo.query(`SELECT public.undo_mission($1,${daySql})`, [a]);
      edit = await authenticated('cold-edit-a');
      const pid = (await edit.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      const work = edit.query("UPDATE public.missions SET title='social A edited' WHERE id=$1", [a]);
      const wait = await blockers(admin, pid);
      if (wait.wait_event !== 'advisory') throw new Error(`Wrong edit lock: ${JSON.stringify(wait)}`);
      await undo.query('COMMIT');
      await work;
      await edit.query('COMMIT');
      console.log(`UNDO_EDIT_RACE_PASS blocker=${wait.wait_event}`);
    } finally {
      await undo.end();
      if (edit) await edit.end();
    }
    const last = await authenticated('cold-undo-b');
    try {
      await last.query(`SELECT public.undo_mission($1,${daySql})`, [b]);
      await last.query('COMMIT');
    } finally { await last.end(); }
    const final = (await admin.query(`SELECT
      (SELECT total_xp FROM public.profiles WHERE user_id=$1) AS xp,
      (SELECT inspired_available FROM public.profiles WHERE user_id=$1) AS inspired,
      (SELECT count(*)::int FROM private.mission_effect_receipts WHERE user_id=$1) AS receipts,
      (SELECT title FROM public.missions WHERE id=$2) AS title`, [uid, a])).rows[0];
    if (final.xp !== 0 || final.inspired !== false || final.receipts !== 0 || final.title !== 'social A edited') {
      throw new Error(`SOURCE_RACE_FINAL_WRONG ${JSON.stringify(final)}`);
    }
    console.log(`SOURCE_RACE_FINAL_PASS ${JSON.stringify(final)}`);
  } finally { await admin.end(); }
}
await run();
