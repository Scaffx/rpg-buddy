import https from 'https';

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF   = 'jfnospjxdkelxlhcwuia';

const sql = `
-- ============================================================
-- RPC atômica para resgatar conquista (anti-double-claim)
-- ============================================================
CREATE OR REPLACE FUNCTION claim_achievement(p_user_achievement_id uuid)
RETURNS TABLE (xp_reward int, gold_reward int)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid       uuid;
  v_ach_id    uuid;
  v_user_id   uuid;
  v_claimed   timestamptz;
  v_xp        int;
  v_gold      int;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  -- Lock da linha do user_achievement (SELECT FOR UPDATE)
  SELECT ua.user_id, ua.achievement_id, ua.claimed_at
    INTO v_user_id, v_ach_id, v_claimed
  FROM public.user_achievements ua
  WHERE ua.id = p_user_achievement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conquista não encontrada';
  END IF;

  IF v_user_id <> v_uid THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF v_claimed IS NOT NULL THEN
    RAISE EXCEPTION 'Conquista já resgatada';
  END IF;

  -- Pega valores da achievement
  SELECT a.xp_reward, a.gold_reward INTO v_xp, v_gold
  FROM public.achievements a
  WHERE a.id = v_ach_id;

  -- Marca como resgatada ANTES de conceder (idempotência)
  UPDATE public.user_achievements
  SET claimed_at = now()
  WHERE id = p_user_achievement_id AND claimed_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conquista já resgatada (race condition)';
  END IF;

  -- Concede XP
  IF v_xp > 0 THEN
    UPDATE public.profiles
    SET total_xp = total_xp + v_xp,
        level    = GREATEST(level, FLOOR((total_xp + v_xp) / 200)::int + 1)
    WHERE user_id = v_uid;
  END IF;

  -- Concede ouro
  IF v_gold > 0 THEN
    INSERT INTO public.user_balance (user_id, gold, updated_at)
    VALUES (v_uid, v_gold, now())
    ON CONFLICT (user_id) DO UPDATE
    SET gold = public.user_balance.gold + v_gold,
        updated_at = now();
  END IF;

  RETURN QUERY SELECT v_xp, v_gold;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_achievement(uuid) TO authenticated;
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
      else console.log('✅ claim_achievement RPC criada');
    } catch { console.log(d); }
  });
});
req.write(body);
req.end();
