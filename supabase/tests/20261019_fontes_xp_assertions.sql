-- Run with psql -v ON_ERROR_STOP=1 after fixture, captured live functions,
-- and the 20261019204003 migration. Every assertion raises on failure.
DO $test$
DECLARE
  v_role text;
  v_table text;
  v_column text;
  v_fn text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH v_table IN ARRAY ARRAY['user_buffs', 'npc_challenge_completions'] LOOP
      IF has_table_privilege(v_role, format('public.%I', v_table), 'INSERT')
         OR has_table_privilege(v_role, format('public.%I', v_table), 'UPDATE')
         OR has_table_privilege(v_role, format('public.%I', v_table), 'DELETE') THEN
        RAISE EXCEPTION '% still has table DML on %', v_role, v_table;
      END IF;
      FOR v_column IN
        SELECT attname FROM pg_catalog.pg_attribute
        WHERE attrelid = format('public.%I', v_table)::regclass
          AND attnum > 0 AND NOT attisdropped
      LOOP
        IF has_column_privilege(v_role, format('public.%I', v_table), v_column, 'INSERT')
           OR has_column_privilege(v_role, format('public.%I', v_table), v_column, 'UPDATE') THEN
          RAISE EXCEPTION '% still has column DML on %.%', v_role, v_table, v_column;
        END IF;
      END LOOP;
    END LOOP;
    FOREACH v_fn IN ARRAY ARRAY[
      'public._grant_flow_xp_buff(uuid)',
      'public._grant_inspiration_if_perfect_day(uuid,date)',
      'public._apply_mission_health_effects(uuid,numeric,integer,integer)',
      'public._norm(text)',
      'public._derive_mission_category(text,text,text,text)',
      'public._weekend_xp_bonus(text,jsonb,date)',
      'public.undo_npc_challenge(text,text,text)'
    ] LOOP
      IF has_function_privilege(v_role, v_fn, 'EXECUTE') THEN
        RAISE EXCEPTION '% still executes %', v_role, v_fn;
      END IF;
    END LOOP;
  END LOOP;
  IF NOT has_table_privilege('authenticated', 'public.user_buffs', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.npc_challenge_completions', 'SELECT') THEN
    RAISE EXCEPTION 'Owner reads were lost';
  END IF;
END;
$test$;

SET ROLE anon;
DO $test$
BEGIN
  BEGIN
    PERFORM public._grant_flow_xp_buff('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
    RAISE EXCEPTION 'anon forged cross-user buff';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.undo_npc_challenge('npc', 'legacy', '2026-10-19');
    RAISE EXCEPTION 'anon reached NPC undo';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$test$;
RESET ROLE;

SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
DO $test$
BEGIN
  BEGIN
    PERFORM public._grant_flow_xp_buff('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    RAISE EXCEPTION 'client forged own buff through helper';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public._grant_flow_xp_buff('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
    RAISE EXCEPTION 'client forged other user buff';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.user_buffs (user_id, item_id, expires_at)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '10000000-0000-0000-0000-000000000001', now() + interval '1 year');
    RAISE EXCEPTION 'client inserted buff';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.user_buffs SET expires_at = now() + interval '1 year';
    RAISE EXCEPTION 'client refreshed buff';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.user_buffs;
    RAISE EXCEPTION 'client deleted buff';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.npc_challenge_completions
      (user_id, npc_id, challenge_id, week_token, xp_earned, gold_earned)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'npc', 'forged', '2026-10-19', -999, -999);
    RAISE EXCEPTION 'client inserted negative NPC reward';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.npc_challenge_completions SET xp_earned = -999;
    RAISE EXCEPTION 'client rewrote NPC reward';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.npc_challenge_completions;
    RAISE EXCEPTION 'client deleted NPC completion';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  FOR i IN 1..2 LOOP
    BEGIN
      PERFORM public.undo_npc_challenge('npc', 'legacy', '2026-10-19');
      RAISE EXCEPTION 'client replayed NPC undo';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
END;
$test$;
RESET ROLE;
RESET request.jwt.claim.sub;

DO $test$
BEGIN
  -- Even owner/service-side calls fail closed. No untrusted receipt is used.
  BEGIN
    PERFORM public.undo_npc_challenge('npc', 'legacy', '2026-10-19');
    RAISE EXCEPTION 'retired NPC undo ran as owner';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'NPC_UNDO_RETIRED' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM public.npc_challenge_completions
      WHERE challenge_id = 'legacy' AND xp_earned = -999 AND gold_earned = -50) <> 1
     OR (SELECT count(*) FROM public.user_buffs) <> 0
     OR (SELECT total_xp FROM public.profiles
         WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') <> 100
     OR (SELECT xp FROM public.attributes
         WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') <> 20
     OR (SELECT gold FROM public.user_balance
         WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') <> 100 THEN
    RAISE EXCEPTION 'Denied paths changed historical rows or progression';
  END IF;
END;
$test$;

-- The purchase below executes the captured live buy_shop_item body as a
-- non-bypass authenticated role. It must still pay and add exactly one buff.
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT public.buy_shop_item('10000000-0000-0000-0000-000000000001', current_date);
RESET ROLE;
RESET request.jwt.claim.sub;
SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
DO $test$
BEGIN
  IF (SELECT count(*) FROM public.user_buffs) <> 0 THEN
    RAISE EXCEPTION 'Other identity can read purchased buff';
  END IF;
END;
$test$;
RESET ROLE;
RESET request.jwt.claim.sub;
DO $test$
BEGIN
  IF (SELECT gold FROM public.user_balance
      WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') <> 90
     OR (SELECT count(*) FROM public.user_buffs
         WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') <> 1
     OR (SELECT count(*) FROM public.user_buffs
         WHERE user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') <> 0 THEN
    RAISE EXCEPTION 'Legitimate purchase failed or affected another user';
  END IF;
END;
$test$;

-- Reduced completion surrogate: same owner/SECURITY DEFINER -> internal
-- helper call pattern as complete_mission. It does not model its reward math.
CREATE FUNCTION public.test_owner_mission(p_uid uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM p_uid THEN RAISE EXCEPTION 'not owner'; END IF;
  UPDATE public.profiles SET total_xp = total_xp + 10 WHERE user_id = p_uid;
  UPDATE public.attributes SET xp = xp + 10 WHERE user_id = p_uid;
  PERFORM public._grant_flow_xp_buff(p_uid);
END;
$$;
REVOKE ALL ON FUNCTION public.test_owner_mission(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.test_owner_mission(uuid) TO authenticated;
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT public.test_owner_mission('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
RESET ROLE;
RESET request.jwt.claim.sub;
DO $test$
BEGIN
  IF (SELECT total_xp FROM public.profiles
      WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') <> 110
     OR (SELECT xp FROM public.attributes
         WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') <> 30
     OR (SELECT count(*) FROM public.user_buffs
         WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') <> 2 THEN
    RAISE EXCEPTION 'Internal owner-owned mission helper call failed';
  END IF;
END;
$test$;
