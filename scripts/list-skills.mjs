import https from 'https';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = 'jfnospjxdkelxlhcwuia';

function query(sql) {
  return new Promise((res, rej) => {
    const body = JSON.stringify({ query: sql });
    const req = https.request({
      hostname: 'api.supabase.com',
      path: `/v1/projects/${REF}/database/query`,
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch { res(d); } }); });
    req.on('error', rej);
    req.write(body);
    req.end();
  });
}

// 1. tabelas relacionadas a skills/talents
const tables = await query(`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public'
  AND (table_name ILIKE '%skill%' OR table_name ILIKE '%talent%' OR table_name ILIKE '%abilit%' OR table_name ILIKE '%feat%')
  ORDER BY table_name
`);
console.log('=== Tabelas encontradas ===');
tables.forEach(t => console.log(' -', t.table_name));

// 2. tenta listar conteúdo de cada tabela
for (const t of tables) {
  const rows = await query(`SELECT * FROM public."${t.table_name}" LIMIT 100`);
  console.log(`\n=== ${t.table_name} (${Array.isArray(rows) ? rows.length : '?'} rows) ===`);
  if (Array.isArray(rows) && rows.length > 0) {
    console.log('Colunas:', Object.keys(rows[0]).join(', '));
    rows.forEach(r => console.log(JSON.stringify(r)));
  } else {
    console.log(JSON.stringify(rows).slice(0, 200));
  }
}
