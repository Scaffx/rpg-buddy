-- Apply after the v3 fixture chain in an isolated DB. Existing test users are
-- not reused, so this can run after adventure_skill_motor_state_assert.sql.
CREATE FUNCTION pg_temp.ok_clock(v boolean,m text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'assertion: %',m; END IF; END $$;
INSERT INTO auth.users(id) VALUES('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
INSERT INTO public.profiles(user_id,level,starter_class)
VALUES('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',50,'guerreiro');
INSERT INTO public.attributes(user_id,name,level)
VALUES('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','forca',5);
INSERT INTO public.adventure_state(user_id,stage,attempt,last_tick_at,adventure_mode)
VALUES('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',9,0,clock_timestamp(),'holding');
SET ROLE authenticated;
SET request.jwt.claim.sub='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
SELECT public.sync_auto_adventure();
RESET ROLE;
UPDATE app_private.adventure_battles b
  SET started_at=b.started_at-interval '600 seconds',
      ends_at=b.ends_at-interval '600 seconds',
      events=(SELECT jsonb_agg(jsonb_set(e,'{at}',
        to_jsonb((e->>'at')::timestamptz-interval '600 seconds')) ORDER BY ord)
        FROM jsonb_array_elements(b.events) WITH ORDINALITY x(e,ord))
WHERE b.id=(SELECT current_battle_id FROM public.adventure_state
  WHERE user_id='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
SET ROLE authenticated;
SET request.jwt.claim.sub='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.ok_clock((SELECT status='fighting' AND ends_at<=clock_timestamp()
  FROM app_private.adventure_battles WHERE id=(SELECT current_battle_id
  FROM public.adventure_state WHERE user_id='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee')),
  'catchup leaves an expired current battle pending');
CREATE TEMP TABLE clock_before AS SELECT to_jsonb(s) AS state,
  (SELECT count(*) FROM app_private.adventure_battles b WHERE b.user_id=s.user_id) AS battles,
  (SELECT count(*) FROM public.gold_history h WHERE h.user_id=s.user_id) AS gold_rows
FROM public.adventure_state s WHERE s.user_id='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.advance_auto_adventure((SELECT current_battle_id
      FROM public.adventure_state WHERE user_id=auth.uid()));
    RAISE EXCEPTION 'expired advance accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM <> 'adventure cannot advance now' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;
SELECT pg_temp.ok_clock((SELECT to_jsonb(s)=b.state
  AND (SELECT count(*) FROM app_private.adventure_battles x WHERE x.user_id=s.user_id)=b.battles
  AND (SELECT count(*) FROM public.gold_history h WHERE h.user_id=s.user_id)=b.gold_rows
  FROM public.adventure_state s CROSS JOIN clock_before b
  WHERE s.user_id='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  'expired advance cannot mutate cursor, battles or rewards');

SET ROLE authenticated;
DO $$ DECLARE payload jsonb; BEGIN
  FOR batch IN 1..200 LOOP
    payload := public.sync_auto_adventure();
    EXIT WHEN NOT (payload->'catchup'->>'pending')::boolean;
  END LOOP;
  IF (payload->'catchup'->>'pending')::boolean THEN
    RAISE EXCEPTION '600-second catchup did not drain in 200 batches';
  END IF;
END $$;
RESET ROLE;
SELECT pg_temp.ok_clock((SELECT stage=9 AND adventure_mode='holding'
  AND NOT advance_requested AND gold_today<=120 AND loot_today<=2
  FROM public.adventure_state WHERE user_id='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  'drain keeps holding and economic caps');
SET ROLE authenticated;
SELECT public.advance_auto_adventure((SELECT current_battle_id
  FROM public.adventure_state WHERE user_id=auth.uid()));
DO $$ BEGIN
  BEGIN
    PERFORM public.advance_auto_adventure((SELECT current_battle_id
      FROM public.adventure_state WHERE user_id=auth.uid()));
    RAISE EXCEPTION 'duplicate advance accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
END $$;
RESET ROLE;
SELECT pg_temp.ok_clock((SELECT advance_requested AND stage=9
  FROM public.adventure_state WHERE user_id='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  'live advance accepted once for current battle');
