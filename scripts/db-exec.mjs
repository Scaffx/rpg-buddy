// Runner de SQL via Supabase Management API.
//   node scripts/db-exec.mjs <arquivo.sql>      → aplica o arquivo
//   echo "select 1" | node scripts/db-exec.mjs  → aplica SQL do stdin
// Requer SUPABASE_ACCESS_TOKEN no ambiente.
import https from 'https';
import { readFileSync } from 'fs';

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF || 'jfnospjxdkelxlhcwuia';

if (!TOKEN) {
  console.error('❌ SUPABASE_ACCESS_TOKEN não definido');
  process.exit(1);
}

function readStdin() {
  return new Promise((resolve) => {
    let d = '';
    if (process.stdin.isTTY) return resolve('');
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (d += c));
    process.stdin.on('end', () => resolve(d));
  });
}

function runQuery(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const req = https.request(
      {
        hostname: 'api.supabase.com',
        path: `/v1/projects/${REF}/database/query`,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          let json;
          try { json = JSON.parse(d); } catch { json = d; }
          if (json && (json.error || json.message)) {
            reject(new Error(JSON.stringify(json.error || json.message)));
          } else {
            resolve(json);
          }
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const fileArg = process.argv[2];
const sql = fileArg ? readFileSync(fileArg, 'utf8') : await readStdin();
if (!sql.trim()) {
  console.error('❌ Nenhum SQL fornecido (passe um arquivo ou via stdin)');
  process.exit(1);
}

try {
  const result = await runQuery(sql);
  console.log(JSON.stringify(result, null, 2));
} catch (e) {
  console.error('❌', e.message);
  process.exit(1);
}
