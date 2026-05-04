import https from 'https';

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF   = 'jfnospjxdkelxlhcwuia';

const sql = `
ALTER TABLE public.user_achievements
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

UPDATE public.user_achievements
SET claimed_at = unlocked_at
WHERE claimed_at IS NULL;
`;

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
      console.log('✅ claimed_at adicionado e conquistas existentes marcadas como resgatadas');
    }
  });
});
req.write(body);
req.end();
