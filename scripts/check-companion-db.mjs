import https from 'https';

const queries = [
  // Check table exists
  "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='companions';",
  // Check RLS policies
  "SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename='companions';",
  // Check grants
  "SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_name='companions' AND table_schema='public';",
];

for (const q of queries) {
  const body = JSON.stringify({ query: q });
  await new Promise((resolve) => {
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
      res.on('end', () => { console.log('\nQ:', q.slice(0, 60)); console.log('R:', d); resolve(null); });
    });
    req.write(body);
    req.end();
  });
}
