import https from 'https';

const token = process.env.SUPABASE_ACCESS_TOKEN;

async function q(sql, label) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ query: sql });
    const opts = {
      hostname: 'api.supabase.com',
      path: '/v1/projects/jfnospjxdkelxlhcwuia/database/query',
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(opts, res => {
      let d = ''; res.on('data', x => d += x); res.on('end', () => { console.log(`[${label}]`, d); resolve(); });
    });
    req.on('error', e => { console.error(label, e); resolve(); });
    req.write(body); req.end();
  });
}

await q(
  `SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_name = 'companions' ORDER BY grantee, privilege_type`,
  'GRANTS companions'
);
await q(
  `SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_name = 'hero_story_choices' ORDER BY grantee, privilege_type`,
  'GRANTS hero_story_choices'
);
await q(
  `SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename = 'companions'`,
  'POLICIES companions'
);
await q(
  `SELECT hsc.user_id, hsc.skeleton_champion, c.id AS companion_id FROM public.hero_story_choices hsc LEFT JOIN public.companions c ON c.user_id = hsc.user_id AND c.origin = 'boss_story' WHERE hsc.skeleton_champion = 'adopt'`,
  'ADOPT_WITHOUT_COMPANION'
);
await q(
  `SELECT conname, contype, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.companions'::regclass`,
  'CONSTRAINTS'
);
