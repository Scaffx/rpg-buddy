import https from 'https';

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF   = 'jfnospjxdkelxlhcwuia';

const sql = `UPDATE public.user_achievements SET claimed_at = NULL;`;

const body = JSON.stringify({ query: sql });
const req = https.request({
  hostname: 'api.supabase.com',
  path: `/v1/projects/${REF}/database/query`,
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  },
}, (res) => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    const json = JSON.parse(d);
    if (json.error) {
      console.error('❌ Erro:', json.error);
    } else {
      console.log('✅ claimed_at resetado para NULL em todas as conquistas de todos os usuários');
      console.log(JSON.stringify(json, null, 2));
    }
  });
});
req.write(body);
req.end();
