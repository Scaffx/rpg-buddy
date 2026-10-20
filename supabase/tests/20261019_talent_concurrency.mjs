// Local PostgreSQL only. Usage: node supabase/tests/20261019_talent_concurrency.mjs 55563 integration_talent_p13
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const [portText, database] = process.argv.slice(2);
if (!/^\d{2,5}$/.test(portText ?? '') || !database?.startsWith('integration_')) {
  throw new Error('Expected local port and disposable integration_ database');
}
const pool = new pg.Pool({ host: '127.0.0.1', port: Number(portText),
  database, user: 'postgres', max: 8 });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const catalog = Array.from({ length: 7 }, () => randomUUID());
let serial = 0;

async function seedUser(points, threshold = false) {
  const user = randomUUID();
  await pool.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',
    [user, `talent-concurrent-${++serial}@example.invalid`]);
  if (threshold) {
    await pool.query('UPDATE public.profiles SET total_xp=3590,level=4 WHERE user_id=$1', [user]);
  }
  await pool.query('UPDATE public.profiles SET pontos_talento=$2 WHERE user_id=$1',
    [user, points]);
  return user;
}

async function seedMission(user) {
  const mission = randomUUID();
  await pool.query(`INSERT INTO public.missions(id,user_id,title,attribute_id,priority,
      frequency_type,days_of_week,mission_category)
    SELECT $1,a.user_id,'Concurrent talent threshold',a.id,'media','daily',
      '["Dom","Seg","Ter","Qua","Qui","Sex","Sab"]'::jsonb,'geral'
    FROM public.attributes a WHERE a.user_id=$2 AND a.name='Disciplina'`,
  [mission, user]);
  return mission;
}

async function beginAs(user) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE authenticated');
    await client.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [user]);
    return client;
  } catch (error) {
    client.release();
    throw error;
  }
}

async function blockedBy(waiter, holder) {
  await sleep(200);
  const { rows } = await pool.query('SELECT pg_blocking_pids($1) AS pids',
    [waiter.processID]);
  assert.ok(rows[0].pids.includes(holder.processID),
    `backend ${waiter.processID} was not blocked by ${holder.processID}`);
}

async function finish(client, command) {
  try { await client.query(command); } finally { client.release(); }
}

async function raceBuys(sameId) {
  const user = await seedUser(1);
  const a = await beginAs(user);
  const b = await beginAs(user);
  try {
    const first = await a.query('SELECT public.buy_talent($1) AS result', [catalog[0]]);
    assert.equal(first.rows[0].result.purchased, true);
    const second = b.query('SELECT public.buy_talent($1) AS result',
      [catalog[sameId ? 0 : 1]]).then((result) => ({ result }),
      (error) => ({ error }));
    await blockedBy(b, a);
    await finish(a, 'COMMIT');
    const outcome = await second;
    if (sameId) {
      assert.equal(outcome.result?.rows[0].result.already_owned, true);
      await finish(b, 'COMMIT');
    } else {
      assert.match(outcome.error?.message ?? '', /^TALENT_POINTS_INSUFFICIENT:/);
      await finish(b, 'ROLLBACK');
    }
    const { rows } = await pool.query(`SELECT p.pontos_talento,
      (SELECT count(*)::integer FROM public.talentos_jogador tj
       WHERE tj.personagem_id=$1) AS owned FROM public.profiles p WHERE p.user_id=$1`, [user]);
    assert.deepEqual(rows[0], { pontos_talento: 0, owned: 1 });
  } catch (error) {
    for (const client of [a, b]) {
      if (!client._released) await finish(client, 'ROLLBACK').catch(() => {});
    }
    throw error;
  }
  console.log(`parallel purchases (${sameId ? 'same id' : 'different ids'}): PASS`);
}

async function raceBuyUndo(buyFirst) {
  const user = await seedUser(0, true);
  const mission = await seedMission(user);
  const buyer = await beginAs(user);
  try {
    const credit = await buyer.query(`SELECT public.complete_mission($1,
      (now() AT TIME ZONE 'America/Sao_Paulo')::date)`, [mission]);
    assert.equal(credit.rowCount, 1);
    await finish(buyer, 'COMMIT');
  } catch (error) {
    if (!buyer._released) await finish(buyer, 'ROLLBACK');
    throw error;
  }
  const a = await beginAs(user);
  const b = await beginAs(user);
  try {
    if (buyFirst) {
      await a.query('SELECT public.buy_talent($1)', [catalog[0]]);
      const pending = b.query(`SELECT public.undo_mission($1,
        (now() AT TIME ZONE 'America/Sao_Paulo')::date)`, [mission])
        .then((result) => ({ result }), (error) => ({ error }));
      await blockedBy(b, a);
      await finish(a, 'COMMIT');
      assert.match((await pending).error?.message ?? '', /^TALENT_POINTS_SPENT:/);
      await finish(b, 'ROLLBACK');
      const { rows } = await pool.query(`SELECT level,total_xp,pontos_talento FROM
        public.profiles WHERE user_id=$1`, [user]);
      assert.deepEqual(rows[0], { level: 5, total_xp: 3615, pontos_talento: 0 });
    } else {
      await a.query(`SELECT public.undo_mission($1,
        (now() AT TIME ZONE 'America/Sao_Paulo')::date)`, [mission]);
      const pending = b.query('SELECT public.buy_talent($1)', [catalog[0]])
        .then((result) => ({ result }), (error) => ({ error }));
      await blockedBy(b, a);
      await finish(a, 'COMMIT');
      assert.match((await pending).error?.message ?? '', /^TALENT_POINTS_INSUFFICIENT:/);
      await finish(b, 'ROLLBACK');
      const { rows } = await pool.query(`SELECT level,total_xp,pontos_talento FROM
        public.profiles WHERE user_id=$1`, [user]);
      assert.deepEqual(rows[0], { level: 4, total_xp: 3590, pontos_talento: 0 });
    }
  } catch (error) {
    for (const client of [a, b]) {
      if (!client._released) await finish(client, 'ROLLBACK').catch(() => {});
    }
    throw error;
  }
  console.log(`buy/undo (${buyFirst ? 'buy first' : 'undo first'}): PASS`);
}

async function raceEquip() {
  const user = await seedUser(6);
  const c = await beginAs(user);
  try {
    for (const id of catalog.slice(0, 6)) {
      await c.query('SELECT public.buy_talent($1)', [id]);
    }
    const { rows } = await c.query(`SELECT id,talento_id FROM public.talentos_jogador
      WHERE personagem_id=$1`, [user]);
    const fifth = rows.find((row) => row.talento_id === catalog[4]);
    const sixth = rows.find((row) => row.talento_id === catalog[5]);
    await c.query('SELECT public.set_talent_equipped($1,false)', [fifth.id]);
    await finish(c, 'COMMIT');
    const a = await beginAs(user);
    const b = await beginAs(user);
    try {
      await a.query('SELECT public.set_talent_equipped($1,true)', [fifth.id]);
      const pending = b.query('SELECT public.set_talent_equipped($1,true)', [sixth.id])
        .then((result) => ({ result }), (error) => ({ error }));
      await blockedBy(b, a);
      await finish(a, 'COMMIT');
      assert.match((await pending).error?.message ?? '', /^TALENT_EQUIP_LIMIT:/);
      await finish(b, 'ROLLBACK');
      const { rows: countRows } = await pool.query(`SELECT count(*)::integer AS equipped
        FROM public.talentos_jogador WHERE personagem_id=$1 AND equipped`, [user]);
      assert.equal(countRows[0].equipped, 5);
    } catch (error) {
      for (const client of [a, b]) {
        if (!client._released) await finish(client, 'ROLLBACK').catch(() => {});
      }
      throw error;
    }
  } catch (error) {
    if (!c._released) await finish(c, 'ROLLBACK').catch(() => {});
    throw error;
  }
  console.log('parallel equip fifth/sixth: PASS');
}

try {
  for (const [index, id] of catalog.entries()) {
    await pool.query(`INSERT INTO public.talentos_disponiveis(id,nome,descricao,efeito)
      VALUES($1,$2,$3,$4)`, [id, `Concurrent ${id}`, `Catalog ${index}`, `concurrent_${id}`]);
  }
  await raceBuys(false);
  await raceBuys(true);
  await raceBuyUndo(true);
  await raceBuyUndo(false);
  await raceEquip();
} finally {
  await pool.end();
}
