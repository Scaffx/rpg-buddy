-- Apply after the original eight-file continuous-adventure SQL suite.
\set ON_ERROR_STOP on
CREATE FUNCTION pg_temp.ok(v boolean,m text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'assertion: %',m; END IF; END $$;

INSERT INTO auth.users(id) VALUES('88888888-8888-8888-8888-888888888888');
INSERT INTO public.profiles(user_id,level,starter_class)
 VALUES('88888888-8888-8888-8888-888888888888',50,'guerreiro');
INSERT INTO public.adventure_state(user_id,stage,attempt,last_tick_at,adventure_mode)
 VALUES('88888888-8888-8888-8888-888888888888',9,0,clock_timestamp(),'holding');
SET ROLE authenticated;
SET request.jwt.claim.sub='88888888-8888-8888-8888-888888888888';
SELECT public.sync_auto_adventure() AS initial_snapshot \gset
RESET ROLE;
UPDATE app_private.adventure_battles b SET
  started_at=b.started_at-interval '2 hours',
  ends_at=b.ends_at-interval '2 hours',
  events=(SELECT jsonb_agg(jsonb_set(e,'{at}',
    to_jsonb((e->>'at')::timestamptz-interval '2 hours')) ORDER BY ord)
    FROM jsonb_array_elements(b.events) WITH ORDINALITY x(e,ord))
WHERE b.id=(:'initial_snapshot'::jsonb->'battle'->>'id')::uuid;
SET ROLE authenticated;
SELECT public.sync_auto_adventure() AS pending_snapshot \gset
RESET ROLE;
SELECT pg_temp.ok((:'pending_snapshot'::jsonb->'catchup'->>'pending')::boolean,
  'two-hour catch-up must remain pending after one batch');
SELECT pg_temp.ok((:'pending_snapshot'::jsonb->'battle'->>'status')='fighting'
  AND (:'pending_snapshot'::jsonb->'battle'->>'ends_at')::timestamptz
      <= (:'pending_snapshot'::jsonb->>'server_now')::timestamptz,
  'pending battle is already expired despite fighting label');

CREATE TEMP TABLE advance_before AS
SELECT to_jsonb(s) AS state,
 (SELECT count(*) FROM app_private.adventure_battles b WHERE b.user_id=s.user_id) AS battles,
 (SELECT count(*) FROM public.adventure_encounters e WHERE e.user_id=s.user_id) AS encounters,
 (SELECT count(*) FROM public.gold_history h WHERE h.user_id=s.user_id) AS gold_rows,
 (SELECT coalesce(sum(quantity),0) FROM public.user_inventory i WHERE i.user_id=s.user_id) AS item_count,
 (SELECT count(*) FROM public.boss_battles x WHERE x.user_id=s.user_id) AS boss_rows
FROM public.adventure_state s WHERE s.user_id='88888888-8888-8888-8888-888888888888';
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.advance_auto_adventure((SELECT current_battle_id
      FROM public.adventure_state WHERE user_id=auth.uid()));
    RAISE EXCEPTION 'expired catch-up battle accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM <> 'adventure cannot advance now' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;
SELECT pg_temp.ok((SELECT to_jsonb(s)=a.state AND
 (SELECT count(*) FROM app_private.adventure_battles b WHERE b.user_id=s.user_id)=a.battles AND
 (SELECT count(*) FROM public.adventure_encounters e WHERE e.user_id=s.user_id)=a.encounters AND
 (SELECT count(*) FROM public.gold_history h WHERE h.user_id=s.user_id)=a.gold_rows AND
 (SELECT coalesce(sum(quantity),0) FROM public.user_inventory i WHERE i.user_id=s.user_id)=a.item_count AND
 (SELECT count(*) FROM public.boss_battles x WHERE x.user_id=s.user_id)=a.boss_rows
 FROM public.adventure_state s CROSS JOIN advance_before a
 WHERE s.user_id='88888888-8888-8888-8888-888888888888'),
 'rejected advance changes no state, cursor, battle or rewards');

-- Drain solely through the normal sync RPC; the expired advance did not do it.
SET ROLE authenticated;
DO $$ DECLARE payload jsonb; BEGIN
  FOR batch IN 1..40 LOOP
    payload := public.sync_auto_adventure();
    EXIT WHEN NOT (payload->'catchup'->>'pending')::boolean;
  END LOOP;
  IF (payload->'catchup'->>'pending')::boolean THEN
    RAISE EXCEPTION 'catch-up did not drain within forty batches';
  END IF;
END $$;
RESET ROLE;
SELECT pg_temp.ok((SELECT stage=9 AND adventure_mode='holding' AND NOT advance_requested
  AND gold_today<=120 AND loot_today<=2 FROM public.adventure_state
  WHERE user_id='88888888-8888-8888-8888-888888888888'),
 'normal catch-up keeps holding stage and caps');
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.adventure_encounters
 WHERE user_id='88888888-8888-8888-8888-888888888888' AND stage>=10),
 'normal catch-up does not invent stage ten clears');
SELECT pg_temp.ok((SELECT total_xp=0 AND level=50 FROM public.profiles
 WHERE user_id='88888888-8888-8888-8888-888888888888'), 'catch-up pays no XP');

-- Move only the current unexpired battle close to completion for a fast live test.
WITH timing AS (
 SELECT b.id,(clock_timestamp()+interval '2 seconds')-b.ends_at AS delta
 FROM app_private.adventure_battles b JOIN public.adventure_state s ON s.current_battle_id=b.id
 WHERE s.user_id='88888888-8888-8888-8888-888888888888'
)
UPDATE app_private.adventure_battles b SET
 started_at=b.started_at+timing.delta,ends_at=b.ends_at+timing.delta,
 events=(SELECT jsonb_agg(jsonb_set(e,'{at}',
   to_jsonb((e->>'at')::timestamptz+timing.delta)) ORDER BY ord)
   FROM jsonb_array_elements(b.events) WITH ORDINALITY x(e,ord))
FROM timing WHERE b.id=timing.id;
SET ROLE authenticated;
SELECT set_config('test.advance_request_at',clock_timestamp()::text,false);
SELECT public.advance_auto_adventure((SELECT current_battle_id
 FROM public.adventure_state WHERE user_id=auth.uid())) AS live_snapshot \gset
DO $$ BEGIN
  BEGIN
    PERFORM public.advance_auto_adventure((SELECT current_battle_id
      FROM public.adventure_state WHERE user_id=auth.uid()));
    RAISE EXCEPTION 'duplicate advance accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
END $$;
RESET ROLE;
SELECT pg_temp.ok((:'live_snapshot'::jsonb->>'advance_pending')::boolean
 AND (:'live_snapshot'::jsonb->>'stage')::integer=9,
 'live advance is pending until its current fight wins');
SELECT pg_sleep(3.5);
SET ROLE authenticated;
SELECT public.sync_auto_adventure() AS next_snapshot \gset
RESET ROLE;
SELECT pg_temp.ok((:'next_snapshot'::jsonb->>'stage')::integer=10
 AND (:'next_snapshot'::jsonb->>'mode')='progressing'
 AND (:'next_snapshot'::jsonb->'battle'->>'stage')::integer=10
 AND (:'next_snapshot'::jsonb->'battle'->>'started_at')::timestamptz
     >= current_setting('test.advance_request_at')::timestamptz,
 'live advance starts the next stage after request time');
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.adventure_encounters
 WHERE user_id='88888888-8888-8888-8888-888888888888' AND stage>=10
 AND fought_at<current_setting('test.advance_request_at')::timestamptz),
 'no stage ten first clear predates the live request');
SELECT 'advance clock assertions passed' AS result;
