-- PG17 isolated 24-hour one-hit holding replay benchmark.
-- Run with -v max_batch=24 (base) or -v max_batch=256 (fixed), ON_ERROR_STOP=1.
-- Each generated SELECT is a distinct autocommit transaction in one psql session.
-- The fixture and metrics are local to the dedicated review database/session.
SELECT set_config('review.max_batch', :'max_batch', false);
BEGIN;
INSERT INTO auth.users(id) VALUES ('bbbbbbbb-0000-0000-0000-000000000010');
INSERT INTO public.profiles(user_id,level,total_xp,starter_class)
 VALUES ('bbbbbbbb-0000-0000-0000-000000000010',50,0,'guerreiro');
INSERT INTO public.attributes(user_id,name,level,xp)
 VALUES ('bbbbbbbb-0000-0000-0000-000000000010','forca',50,0);
INSERT INTO public.adventure_state(user_id,stage,attempt,last_tick_at,adventure_mode)
 VALUES ('bbbbbbbb-0000-0000-0000-000000000010',1,0,clock_timestamp(),'holding');
SET ROLE authenticated;
SET request.jwt.claim.sub='bbbbbbbb-0000-0000-0000-000000000010';
SELECT public.sync_auto_adventure()->>'stage' AS initial_stage;
RESET ROLE;
DO $$ BEGIN
  IF (SELECT jsonb_array_length(events)<>1 OR (events->-1->>'enemy_hp')::integer<>0
      FROM app_private.adventure_battles
      WHERE id=(SELECT current_battle_id FROM public.adventure_state
                WHERE user_id='bbbbbbbb-0000-0000-0000-000000000010')) THEN
    RAISE EXCEPTION 'benchmark is not a one-hit win';
  END IF;
END $$;
UPDATE app_private.adventure_battles b
 SET started_at=b.started_at-interval '24 hours', ends_at=b.ends_at-interval '24 hours',
     events=(SELECT jsonb_agg(jsonb_set(e,'{at}',to_jsonb((e->>'at')::timestamptz-interval '24 hours')) ORDER BY ord)
             FROM jsonb_array_elements(b.events) WITH ORDINALITY x(e,ord))
 WHERE b.id=(SELECT current_battle_id FROM public.adventure_state
             WHERE user_id='bbbbbbbb-0000-0000-0000-000000000010');
COMMIT;

CREATE TEMP TABLE catchup_review_state (
  id integer PRIMARY KEY CHECK(id=1),
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ended_at timestamptz,
  done boolean NOT NULL DEFAULT false,
  calls integer NOT NULL DEFAULT 0,
  battles integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  gold integer NOT NULL DEFAULT 0,
  last_cursor timestamptz
);
INSERT INTO catchup_review_state(id) VALUES(1);
CREATE TEMP TABLE catchup_review_samples (
  call_no integer PRIMARY KEY,
  duration_ms numeric NOT NULL,
  battles integer NOT NULL,
  cursor_at timestamptz,
  pending boolean NOT NULL
);
GRANT SELECT,UPDATE ON pg_temp.catchup_review_state TO authenticated;
GRANT SELECT,INSERT ON pg_temp.catchup_review_samples TO authenticated;

CREATE FUNCTION pg_temp.catchup_review_step()
RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  prior pg_temp.catchup_review_state%ROWTYPE;
  snap jsonb;
  called_at timestamptz;
  elapsed_ms numeric;
  count_battles integer;
  current_cursor timestamptz;
  is_pending boolean;
BEGIN
  SELECT * INTO STRICT prior FROM pg_temp.catchup_review_state WHERE id=1;
  IF prior.done THEN RETURN; END IF;
  called_at:=clock_timestamp();
  snap:=public.sync_auto_adventure();
  elapsed_ms:=round(extract(epoch FROM clock_timestamp()-called_at)*1000,3);
  count_battles:=(snap->'catchup'->>'battles')::integer;
  current_cursor:=(snap->'battle'->>'ends_at')::timestamptz;
  is_pending:=(snap->'catchup'->>'pending')::boolean;
  IF (snap->>'stage')::integer<>1 OR snap->>'mode'<>'holding'
     OR (snap->'catchup'->>'defeats')::integer<>0
     OR (snap->'catchup'->>'draws')::integer<>0
     OR (snap->'catchup'->>'wins')::integer<>count_battles
     OR count_battles<0 OR count_battles>current_setting('review.max_batch')::integer THEN
    RAISE EXCEPTION 'benchmark invariant failed on call %: %',prior.calls+1,snap->'catchup';
  END IF;
  IF is_pending AND (current_cursor IS NULL OR
     (prior.last_cursor IS NOT NULL AND current_cursor<=prior.last_cursor)) THEN
    RAISE EXCEPTION 'non-progressing pending cursor at call %',prior.calls+1;
  END IF;
  INSERT INTO pg_temp.catchup_review_samples(call_no,duration_ms,battles,cursor_at,pending)
   VALUES(prior.calls+1,elapsed_ms,count_battles,current_cursor,is_pending);
  UPDATE pg_temp.catchup_review_state
     SET calls=calls+1,battles=battles+count_battles,
         wins=wins+(snap->'catchup'->>'wins')::integer,
         gold=gold+(snap->'catchup'->>'gold')::integer,
         last_cursor=current_cursor,done=NOT is_pending,
         ended_at=CASE WHEN is_pending THEN NULL ELSE clock_timestamp() END
   WHERE id=1;
END $$;

SET ROLE authenticated;
SET request.jwt.claim.sub='bbbbbbbb-0000-0000-0000-000000000010';
\o NUL
SELECT 'SELECT pg_temp.catchup_review_step()' FROM generate_series(1,3000) \gexec
\o
RESET ROLE;

DO $$ BEGIN
  IF NOT (SELECT done AND calls>0 AND battles=wins
      FROM pg_temp.catchup_review_state WHERE id=1) THEN
    RAISE EXCEPTION '24-hour catchup did not converge';
  END IF;
  IF (SELECT attempt<>(SELECT battles FROM pg_temp.catchup_review_state WHERE id=1)
       OR stage<>1 OR adventure_mode<>'holding' OR gold_today>120 OR loot_today>2
      FROM public.adventure_state WHERE user_id='bbbbbbbb-0000-0000-0000-000000000010') THEN
    RAISE EXCEPTION 'benchmark state or caps mismatch';
  END IF;
  IF (SELECT coalesce(sum(amount),0)<>coalesce((SELECT gold-100 FROM public.user_balance
      WHERE user_id='bbbbbbbb-0000-0000-0000-000000000010'),0)
      FROM public.gold_history WHERE user_id='bbbbbbbb-0000-0000-0000-000000000010'
        AND type='adventure') THEN RAISE EXCEPTION 'benchmark ledger mismatch'; END IF;
  IF (SELECT count(*)<>1 FROM public.adventure_encounters
      WHERE user_id='bbbbbbbb-0000-0000-0000-000000000010' AND stage=1 AND won) THEN
    RAISE EXCEPTION 'benchmark first clear mismatch';
  END IF;
  IF (SELECT total_xp<>0 OR level<>50 FROM public.profiles
      WHERE user_id='bbbbbbbb-0000-0000-0000-000000000010') THEN
    RAISE EXCEPTION 'benchmark XP changed';
  END IF;
  IF (SELECT level<>50 OR xp<>0 FROM public.attributes
      WHERE user_id='bbbbbbbb-0000-0000-0000-000000000010') THEN
    RAISE EXCEPTION 'benchmark attributes changed';
  END IF;
END $$;
SELECT jsonb_build_object(
  'database',current_database(),
  'calls',s.calls,'battles',s.battles,'wins',s.wins,'gold_from_snapshots',s.gold,
  'wall_ms',round(extract(epoch FROM s.ended_at-s.started_at)*1000,3),
  'max_battles_per_rpc',(SELECT max(battles) FROM pg_temp.catchup_review_samples),
  'p95_rpc_ms',(SELECT round(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)::numeric,3)
                FROM pg_temp.catchup_review_samples),
  'max_rpc_ms',(SELECT max(duration_ms) FROM pg_temp.catchup_review_samples),
  'first_cursor',(SELECT cursor_at FROM pg_temp.catchup_review_samples ORDER BY call_no LIMIT 1),
  'last_cursor',s.last_cursor,'pending_at_end',NOT s.done,
  'cap_per_rpc',current_setting('review.max_batch')::integer
) AS catchup_review_benchmark
FROM pg_temp.catchup_review_state s WHERE id=1;
