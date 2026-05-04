import https from 'https';

const body = JSON.stringify({
  query: "SELECT column_name FROM information_schema.columns WHERE table_name='missions' AND column_name='npc_id';"
});

const req = https.request({
  hostname: 'api.supabase.com',
  path: '/v1/projects/jfnospjxdkelxlhcwuia/database/query',
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  }
}, (res) => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => console.log(d));
});
req.write(body);
req.end();
