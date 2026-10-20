// Local-only provenance checks against a pre-P13 database clone.
// Usage: node supabase/tests/20261019_talent_preflight.mjs <port> integration_<db> <lf|crlf|semantic-trigger|deferred-key>
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import pg from 'pg';

const [portText, database, mode] = process.argv.slice(2);
if (!/^\d{2,5}$/.test(portText ?? '') || !database?.startsWith('integration_') ||
    !['lf','crlf','semantic-trigger','deferred-key'].includes(mode)) {
  throw new Error('Expected local port, disposable integration_ database, and mode');
}
const source = readFileSync(new URL('../migrations/20261019222715_talent_points_atomic_purchase_equip.sql',
  import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const migration = mode === 'crlf' ? source.replace(/\n/g,'\r\n') : source;
const setup = {
  'lf': '',
  'crlf': '',
  'semantic-trigger': 'ALTER FUNCTION public.sync_talent_points_on_level_change() SECURITY DEFINER;\n',
  'deferred-key': `ALTER TABLE public.talentos_jogador
    DROP CONSTRAINT talentos_jogador_personagem_id_talento_id_key;
    ALTER TABLE public.talentos_jogador
    ADD CONSTRAINT talentos_jogador_personagem_id_talento_id_key
    UNIQUE (personagem_id,talento_id) DEFERRABLE INITIALLY DEFERRED;\n`,
}[mode];
const psql = process.platform === 'win32' ?
  'C:/Program Files/PostgreSQL/17/bin/psql.exe' : 'psql';
const result = spawnSync(psql, ['-X','-q','-v','ON_ERROR_STOP=1','-1',
  '-h','127.0.0.1','-p',portText,'-U','postgres','-d',database,'-f','-'],
{ input: setup + migration, encoding: 'utf8' });
const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
const expected = {
  'lf': { code: 0 },
  'crlf': { code: 0 },
  'semantic-trigger': { code: 3, message: 'TALENT_LEVEL_SOURCE_DRIFT' },
  'deferred-key': { code: 3, message: 'TALENT_KEY_DRIFT' },
}[mode];
assert.equal(result.status, expected.code, output || result.error?.message);
if (expected.message) assert.ok(output.includes(expected.message), output);

const pool = new pg.Pool({host:'127.0.0.1',port:Number(portText),user:'postgres',database});
try {
  const {rows} = await pool.query(`SELECT
    to_regprocedure('public.buy_talent(uuid)') IS NOT NULL AS installed,
    (SELECT prosecdef FROM pg_proc WHERE oid=
      'public.sync_talent_points_on_level_change()'::regprocedure) AS trigger_definer,
    (SELECT NOT condeferrable AND i.indimmediate
      FROM pg_constraint c JOIN pg_index i ON i.indexrelid=c.conindid
      WHERE c.conrelid='public.talentos_jogador'::regclass
        AND c.conname='talentos_jogador_personagem_id_talento_id_key') AS key_immediate`);
  assert.equal(rows[0].installed, mode === 'lf' || mode === 'crlf');
  assert.equal(rows[0].trigger_definer, false);
  assert.equal(rows[0].key_immediate, true);
  console.log(`${mode}: PASS (psql exit ${result.status}, rollback verified)`);
} finally {
  await pool.end();
}
