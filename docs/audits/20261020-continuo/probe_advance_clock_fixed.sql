\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.ok(v boolean,m text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'probe: %',m; END IF; END $$;
INSERT INTO auth.users(id) VALUES ('99999999-9999-9999-9999-999999999999');
INSERT INTO public.profiles(user_id,level,starter_class) VALUES
  ('99999999-9999-9999-9999-999999999999',50,'guerreiro');
INSERT INTO public.adventure_state(user_id,stage,attempt,last_tick_at,adventure_mode)
  VALUES('99999999-9999-9999-9999-999999999999',9,0,clock_timestamp(),'holding');
SET ROLE authenticated;
SET request.jwt.claim.sub='99999999-9999-9999-9999-999999999999';
SELECT public.sync_auto_adventure() AS initial_snapshot \gset
RESET ROLE;
UPDATE app_private.adventure_battles b SET
  started_at=b.started_at-interval '2 hours',
  ends_at=b.ends_at-interval '2 hours',
  events=(SELECT jsonb_agg(jsonb_set(e,'{at}',
    to_jsonb((e->>'at')::timestamptz-interval '2 hours')) ORDER BY ord)
    FROM jsonb_array_elements(b.events) WITH ORDINALITY x(e,ord))
WHERE b.user_id='99999999-9999-9999-9999-999999999999' AND b.status='fighting';
SET ROLE authenticated;
SELECT public.sync_auto_adventure() AS pending_snapshot \gset
RESET ROLE;
SELECT pg_temp.ok((:'pending_snapshot'::jsonb->'catchup'->>'pending')::boolean AND
  (:'pending_snapshot'::jsonb->'battle'->>'ends_at')::timestamptz <
  (:'pending_snapshot'::jsonb->>'server_now')::timestamptz, 'expired pending setup');
CREATE TEMP TABLE before_rejected AS
SELECT to_jsonb(s) AS state,
  (SELECT count(*) FROM app_private.adventure_battles b WHERE b.user_id=s.user_id) AS battles,
  (SELECT count(*) FROM public.adventure_encounters e WHERE e.user_id=s.user_id) AS encounters,
  (SELECT count(*) FROM public.gold_history h WHERE h.user_id=s.user_id) AS gold_rows
FROM public.adventure_state s WHERE s.user_id='99999999-9999-9999-9999-999999999999';
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.advance_auto_adventure((SELECT current_battle_id FROM public.adventure_state
      WHERE user_id=auth.uid()));
    RAISE EXCEPTION 'expired advance accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM <> 'adventure cannot advance now' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.adventure_state s CROSS JOIN before_rejected b
    WHERE s.user_id='99999999-9999-9999-9999-999999999999' AND to_jsonb(s)=b.state
      AND (SELECT count(*) FROM app_private.adventure_battles x WHERE x.user_id=s.user_id)=b.battles
      AND (SELECT count(*) FROM public.adventure_encounters x WHERE x.user_id=s.user_id)=b.encounters
      AND (SELECT count(*) FROM public.gold_history x WHERE x.user_id=s.user_id)=b.gold_rows) THEN
    RAISE EXCEPTION 'rejected request changed state or rewards'; END IF;
END $$;
SELECT 'expired_rejected_unchanged=true' AS result;
SET ROLE authenticated;
DO $$ DECLARE snapshot jsonb; BEGIN
  FOR n IN 1..40 LOOP
    snapshot:=public.sync_auto_adventure();
    EXIT WHEN NOT (snapshot->'catchup'->>'pending')::boolean;
  END LOOP;
  IF (snapshot->'catchup'->>'pending')::boolean THEN RAISE EXCEPTION 'catchup not drained'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.adventure_state
    WHERE user_id='99999999-9999-9999-9999-999999999999' AND stage=9
      AND adventure_mode='holding' AND NOT advance_requested) OR
     EXISTS(SELECT 1 FROM public.adventure_encounters
       WHERE user_id='99999999-9999-9999-9999-999999999999' AND stage>=10) THEN
    RAISE EXCEPTION 'drain advanced historical stage'; END IF;
END $$;
SELECT 'drain_kept_stage_9=true' AS result;
SET ROLE authenticated;
SELECT public.advance_auto_adventure((SELECT current_battle_id FROM public.adventure_state
  WHERE user_id=auth.uid())) AS live_snapshot \gset
RESET ROLE;
SELECT pg_temp.ok((:'live_snapshot'::jsonb->>'advance_pending')::boolean AND
  (:'live_snapshot'::jsonb->>'stage')::integer=9, 'live advance accepted');
SELECT 'live_accepted_stage_9_pending=true' AS result;
ROLLBACK;
