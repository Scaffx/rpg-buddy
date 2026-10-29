// Two authenticated sessions compete for one today's mission in isolated PG17.
import { spawn, spawnSync } from 'node:child_process';

const database = process.argv[2];
const port = process.argv[3];
if (!database?.startsWith('integration_d1_') || !/^\d{2,5}$/.test(port ?? '')) {
  console.error('Usage: node concurrency.mjs integration_d1_<db> <local-port>');
  process.exit(2);
}
const psql = process.env.PSQL17 ?? (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/17/bin/psql.exe' : 'psql');
const args = ['-X','-At','-q','-v','ON_ERROR_STOP=1','-v','VERBOSITY=terse','-h','127.0.0.1','-p',port,'-U','postgres','-d',database,'-f','-'];
function run(sql) {
  return spawnSync(psql,args,{input:sql,encoding:'utf8',maxBuffer:1024*1024});
}
const user = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0091';
const mission = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0091';
const seed = run(`INSERT INTO auth.users(id,email) VALUES ('${user}','d1-concurrency@example.invalid');
INSERT INTO public.missions(id,user_id,title,attribute_id,priority,frequency_type,days_of_week)
SELECT '${mission}',a.user_id,'concurrent-daily',a.id,'baixa','daily',
 jsonb_build_array('Dom','Seg','Ter','Qua','Qui','Sex','Sáb')
FROM public.attributes a WHERE a.user_id='${user}';`);
if (seed.status !== 0) {
  console.error(`Seed failed: ${seed.stderr}`);
  process.exit(1);
}
const identity = `SELECT set_config('request.jwt.claim.sub','${user}',false); SET ROLE authenticated;`;
const target = `(now() AT TIME ZONE 'America/Sao_Paulo')::date`;
const first = spawn(psql,args,{stdio:['pipe','pipe','pipe']});
let firstOut = '', firstErr = '';
const firstClosed = new Promise(resolve => first.on('close',resolve));
const held = new Promise((resolve,reject) => {
  first.stdout.on('data',chunk => {
    firstOut += chunk.toString();
    if (firstOut.includes('LOCK_HELD')) resolve();
  });
  first.stderr.on('data',chunk => { firstErr += chunk.toString(); });
  first.on('close',code => { if (!firstOut.includes('LOCK_HELD')) reject(new Error(`first session exited ${code}: ${firstErr}`)); });
});
first.stdin.end(`${identity}\nBEGIN;\nSELECT public.complete_mission('${mission}',${target});\nSELECT 'LOCK_HELD';\nSELECT pg_sleep(2);\nCOMMIT;\n`);
await held;
const started = Date.now();
const second = run(`${identity}\nSELECT public.complete_mission('${mission}',${target});`);
const waitedMs = Date.now()-started;
const firstExit = await firstClosed;
const final = run(`SELECT (SELECT count(*) FROM public.mission_daily_completions WHERE mission_id='${mission}') || '|' || (SELECT total_xp FROM public.profiles WHERE user_id='${user}');`);
if (firstExit !== 0 || !firstOut.includes('"success": true') || second.status !== 3 || waitedMs < 800
    || final.status !== 0 || !/^1\|[1-9][0-9]*\s*$/.test(final.stdout)) {
  console.error(`Concurrency failed: first=${firstExit} second=${second.status} wait=${waitedMs}ms final=${final.stdout}\n${firstErr}\n${second.stderr}`);
  process.exit(1);
}
console.log(`MISSION_D1_CONCURRENCY_PASS: second exit=3 after ${waitedMs}ms; one receipt and one XP credit`);
