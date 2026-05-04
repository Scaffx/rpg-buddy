import https from 'https';

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF   = 'jfnospjxdkelxlhcwuia';

const SQL = `
ALTER TABLE public.companions
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'lvl3_choice';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'companions_user_id_origin_key'
  ) THEN
    ALTER TABLE public.companions
      ADD CONSTRAINT companions_user_id_origin_key UNIQUE (user_id, origin);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.npc_affinity (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  npc_id         text        NOT NULL,
  affinity_xp    integer     NOT NULL DEFAULT 0,
  affinity_level integer     NOT NULL DEFAULT 0,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, npc_id)
);

ALTER TABLE public.npc_affinity ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'npc_affinity'
      AND policyname = 'Users manage own npc_affinity'
  ) THEN
    CREATE POLICY "Users manage own npc_affinity"
      ON public.npc_affinity FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
`;

function query(sql) {
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
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          console.log(`Status: ${res.statusCode}`);
          console.log(data);
          resolve(JSON.parse(data));
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

console.log('Applying schema fix...');
await query(SQL);
console.log('Done. Verifying columns...');
await query("SELECT column_name FROM information_schema.columns WHERE table_name = 'companions' ORDER BY ordinal_position");
