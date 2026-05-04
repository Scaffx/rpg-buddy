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
      let d = ''; res.on('data', x => d += x); res.on('end', () => { console.log(`[${label}] status=${res.statusCode}`, d); resolve(); });
    });
    req.on('error', e => { console.error(label, e); resolve(); });
    req.write(body); req.end();
  });
}

// 1. Remove the faulty UNIQUE(user_id) constraint — keeps UNIQUE(user_id, origin)
await q(
  `ALTER TABLE public.companions DROP CONSTRAINT IF EXISTS companions_user_id_key`,
  'DROP bad UNIQUE(user_id)'
);

// 2. Reset orphaned users (had adopt choice but no companion) so dialog can re-trigger
await q(
  `UPDATE public.hero_story_choices
   SET skeleton_champion = NULL, updated_at = now()
   WHERE skeleton_champion = 'adopt'
   AND user_id NOT IN (
     SELECT user_id FROM public.companions WHERE origin = 'boss_story'
   )`,
  'RESET orphaned adopt choices'
);

// 3. Verify
await q(
  `SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.companions'::regclass`,
  'VERIFY constraints'
);
await q(
  `SELECT COUNT(*) as orphaned FROM public.hero_story_choices WHERE skeleton_champion = 'adopt' AND user_id NOT IN (SELECT user_id FROM public.companions WHERE origin = 'boss_story')`,
  'VERIFY orphaned'
);
