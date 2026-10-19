// Replays A12's original assertions on the live-shaped talent schema.
// Each source test stays untouched; transactional fixture defaults provide
// complete catalog names/descriptions and make its explicitly learned talents
// equipped, as its original reduced fixture had no equipment column.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import pg from 'pg';

const [portText, database] = process.argv.slice(2);
if (!/^\d{2,5}$/.test(portText ?? '') || !database?.startsWith('integration_')) {
  throw new Error('Expected local port and disposable integration_ database');
}
const psql = process.platform === 'win32' ?
  'C:/Program Files/PostgreSQL/17/bin/psql.exe' : 'psql';
const probe = new pg.Pool({host:'127.0.0.1',port:Number(portText),user:'postgres',database});
try {
  const {rows} = await probe.query('SELECT count(*)::integer AS count FROM private.mission_effect_receipts');
  assert.equal(rows[0].count,0,'A12 source assertions require a fresh local DB with no committed effect receipts');
} finally {
  await probe.end();
}
const names = [
  '20261019_effect_undo_assertions.sql',
  '20261019_effect_undo_health.sql',
  '20261019_effect_undo_inspiration_sources.sql',
];
for (const name of names) {
  const original = readFileSync(new URL(name, import.meta.url), 'utf8').replace(/\r\n/g,'\n');
  assert.equal((original.match(/^BEGIN;$/gm) ?? []).length, 1);
  const source = original.replace(/^BEGIN;$/m, `BEGIN;
ALTER TABLE public.talentos_disponiveis
  ALTER COLUMN nome SET DEFAULT gen_random_uuid()::text,
  ALTER COLUMN descricao SET DEFAULT 'A12 local fixture';
ALTER TABLE public.talentos_jogador ALTER COLUMN equipped SET DEFAULT true;`);
  const result = spawnSync(psql, ['-X','-q','-v','ON_ERROR_STOP=1',
    '-h','127.0.0.1','-p',portText,'-U','postgres','-d',database,'-f','-'],
  {input:source,encoding:'utf8'});
  assert.equal(result.status,0,`${name}: ${result.stdout ?? ''}${result.stderr ?? ''}`);
  console.log(`${name} with equipped=true fixture: PASS`);
}
