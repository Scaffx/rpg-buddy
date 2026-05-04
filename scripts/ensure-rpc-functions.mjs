import https from 'https';

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF   = 'jfnospjxdkelxlhcwuia';

const sql = `
CREATE OR REPLACE FUNCTION public.add_xp_to_user(p_user_id uuid, p_xp int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_current_xp  int;
  v_new_xp      int;
  v_new_level   int;
  xp_table      int[] := ARRAY[
       0,   80,  180,  300,  440,  600,  775,  960, 1155, 1360,
    1575, 1800, 2040, 2295, 2565, 2855, 3165, 3495, 3850, 4230,
    4640, 5080, 5555, 6065, 6615, 7205, 7840, 8520, 9250,10035,
   10875,11775
  ];
  i             int;
BEGIN
  SELECT COALESCE(total_xp, 0) INTO v_current_xp
    FROM public.profiles WHERE user_id = p_user_id;
  v_new_xp := v_current_xp + p_xp;
  v_new_level := 1;
  FOR i IN REVERSE array_length(xp_table, 1)..2 LOOP
    IF v_new_xp >= xp_table[i] THEN
      v_new_level := i;
      EXIT;
    END IF;
  END LOOP;
  UPDATE public.profiles
    SET total_xp = v_new_xp,
        level    = v_new_level
  WHERE user_id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_gold_to_user(p_user_id uuid, p_gold int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.user_balance
    SET gold       = COALESCE(gold, 0) + p_gold,
        updated_at = now()
  WHERE user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_xp_to_user(uuid, int)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_gold_to_user(uuid, int) TO authenticated;
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
    try {
      const json = JSON.parse(d);
      if (json.error) console.error('❌', json.error);
      else console.log('✅ add_xp_to_user e add_gold_to_user criadas/atualizadas');
    } catch { console.log(d); }
  });
});
req.write(body);
req.end();
