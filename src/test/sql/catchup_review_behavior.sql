-- PG17 isolated review: run against catchup_review_fixed with ON_ERROR_STOP=1.
-- Administrator changes below create deterministic combat fixtures only.
-- All gameplay transitions under test use the public authenticated RPCs.
BEGIN;
SET LOCAL statement_timeout = '120s';

CREATE FUNCTION pg_temp.review_ok(value boolean, message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'CATCHUP_REVIEW: %', message; END IF;
END $$;

CREATE FUNCTION pg_temp.review_expire(user_id uuid, outcome text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  battle_id uuid;
  shift_by interval;
  last_index integer;
  enemy_hp integer;
  hero_hp integer;
BEGIN
  SELECT s.current_battle_id INTO battle_id FROM public.adventure_state s WHERE s.user_id=review_expire.user_id;
  IF battle_id IS NULL OR outcome NOT IN ('won','defeated','draw') THEN
    RAISE EXCEPTION 'invalid review fixture';
  END IF;
  SELECT clock_timestamp()-interval '100 milliseconds'-b.ends_at,
         jsonb_array_length(b.events)-1
    INTO shift_by,last_index FROM app_private.adventure_battles b WHERE b.id=battle_id;
  UPDATE app_private.adventure_battles b
     SET started_at=b.started_at+shift_by, ends_at=b.ends_at+shift_by,
         events=(SELECT jsonb_agg(jsonb_set(e,'{at}',to_jsonb((e->>'at')::timestamptz+shift_by)) ORDER BY ord)
                   FROM jsonb_array_elements(b.events) WITH ORDINALITY x(e,ord))
   WHERE b.id=battle_id AND b.status='fighting';
  enemy_hp := CASE WHEN outcome='won' THEN 0 ELSE 1 END;
  hero_hp := CASE WHEN outcome='defeated' THEN 0 ELSE 1 END;
  UPDATE app_private.adventure_battles b
     SET events=jsonb_set(jsonb_set(b.events,ARRAY[last_index::text,'enemy_hp'],to_jsonb(enemy_hp)),
                          ARRAY[last_index::text,'hero_hp'],to_jsonb(hero_hp))
   WHERE b.id=battle_id;
END $$;

CREATE FUNCTION pg_temp.review_ready(user_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.adventure_state s SET last_tick_at=clock_timestamp()-interval '1 second'
   WHERE s.user_id=review_ready.user_id AND s.current_battle_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'review battle still current'; END IF;
END $$;

SELECT pg_temp.review_ok(NOT has_function_privilege('anon','public.sync_auto_adventure()','EXECUTE'), 'anon sync ACL');
SELECT pg_temp.review_ok(NOT has_function_privilege('anon','public.advance_auto_adventure(uuid)','EXECUTE'), 'anon advance ACL');
SELECT pg_temp.review_ok(NOT has_table_privilege('authenticated','app_private.adventure_battles','SELECT')
 AND NOT has_table_privilege('authenticated','app_private.adventure_battles','INSERT')
 AND NOT has_table_privilege('authenticated','app_private.adventure_battles','UPDATE')
 AND NOT has_table_privilege('authenticated','app_private.adventure_battles','DELETE'), 'private battle ACL');
SELECT pg_temp.review_ok(NOT has_table_privilege('authenticated','public.adventure_state','UPDATE'), 'state UPDATE ACL');

SET ROLE anon;
DO $$ DECLARE denied boolean:=false; BEGIN
  BEGIN PERFORM public.sync_auto_adventure();
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'anon RPC accepted'; END IF;
END $$;
RESET ROLE;
SET ROLE authenticated;
RESET request.jwt.claim.sub;
DO $$ DECLARE denied boolean:=false; BEGIN
  BEGIN PERFORM public.sync_auto_adventure();
  EXCEPTION WHEN SQLSTATE '28000' THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'missing identity accepted'; END IF;
END $$;
RESET ROLE;

INSERT INTO auth.users(id) VALUES
 ('bbbbbbbb-0000-0000-0000-000000000001'),
 ('bbbbbbbb-0000-0000-0000-000000000002'),
 ('bbbbbbbb-0000-0000-0000-000000000003');
INSERT INTO public.profiles(user_id,level,total_xp,starter_class) VALUES
 ('bbbbbbbb-0000-0000-0000-000000000001',50,1234,'guerreiro'),
 ('bbbbbbbb-0000-0000-0000-000000000002',50,77,'guerreiro'),
 ('bbbbbbbb-0000-0000-0000-000000000003',1,55,'mago');
INSERT INTO public.attributes(user_id,name,xp,level) VALUES
 ('bbbbbbbb-0000-0000-0000-000000000001','forca',7,5),
 ('bbbbbbbb-0000-0000-0000-000000000002','forca',3,2),
 ('bbbbbbbb-0000-0000-0000-000000000003','forca',4,3);
INSERT INTO public.adventure_state(user_id,stage,attempt,last_tick_at,adventure_mode) VALUES
 ('bbbbbbbb-0000-0000-0000-000000000001',80,0,clock_timestamp(),'progressing'),
 ('bbbbbbbb-0000-0000-0000-000000000002',10,0,clock_timestamp(),'holding'),
 ('bbbbbbbb-0000-0000-0000-000000000003',1,0,clock_timestamp(),'holding');

SET ROLE authenticated;
SET request.jwt.claim.sub='bbbbbbbb-0000-0000-0000-000000000001';
DO $$ DECLARE snap jsonb; BEGIN
  snap:=public.sync_auto_adventure();
  IF (snap->'battle'->>'stage')::integer<>80 THEN RAISE EXCEPTION 'stage80 creation'; END IF;
END $$;
RESET ROLE;
SELECT pg_temp.review_expire('bbbbbbbb-0000-0000-0000-000000000001','defeated');
SET ROLE authenticated;
DO $$ DECLARE snap jsonb; BEGIN
  snap:=public.sync_auto_adventure();
  IF (snap->>'stage')::integer<>79 OR snap->>'mode'<>'holding'
     OR (snap->'catchup'->>'defeats')::integer<>1
     OR (snap->'catchup'->>'retreats')::integer<>1
     OR (snap->'catchup'->>'to_stage')::integer<>79 THEN
    RAISE EXCEPTION '80 to 79 failure: %',snap->'catchup';
  END IF;
END $$;
RESET ROLE;

SELECT pg_temp.review_ready('bbbbbbbb-0000-0000-0000-000000000001');
SET ROLE authenticated;
DO $$ DECLARE snap jsonb; BEGIN
  snap:=public.sync_auto_adventure();
  IF (snap->'battle'->>'stage')::integer<>79 THEN RAISE EXCEPTION 'stage79 creation'; END IF;
END $$;
RESET ROLE;
SELECT pg_temp.review_expire('bbbbbbbb-0000-0000-0000-000000000001','defeated');
SET ROLE authenticated;
DO $$ DECLARE snap jsonb; BEGIN
  snap:=public.sync_auto_adventure();
  IF (snap->>'stage')::integer<>78 OR snap->>'mode'<>'holding'
     OR (snap->'catchup'->>'retreats')::integer<>1
     OR (snap->'catchup'->>'to_stage')::integer<>78 THEN
    RAISE EXCEPTION '79 to 78 failure: %',snap->'catchup';
  END IF;
END $$;
RESET ROLE;

SELECT pg_temp.review_ready('bbbbbbbb-0000-0000-0000-000000000001');
SET ROLE authenticated;
SELECT public.sync_auto_adventure()->>'stage' AS holding_stage;
RESET ROLE;
SELECT pg_temp.review_expire('bbbbbbbb-0000-0000-0000-000000000001','won');
SET ROLE authenticated;
DO $$ DECLARE snap jsonb; BEGIN
  snap:=public.sync_auto_adventure();
  IF (snap->>'stage')::integer<>78 OR snap->>'mode'<>'holding'
     OR (snap->'catchup'->>'wins')::integer<>1
     OR (snap->'catchup'->>'gold')::integer<>4
     OR (snap->'catchup'->>'to_stage')::integer<>78 THEN
    RAISE EXCEPTION 'holding win failure: %',snap->'catchup';
  END IF;
END $$;
RESET ROLE;
SELECT pg_temp.review_ok((SELECT count(*)=1 FROM public.adventure_encounters
 WHERE user_id='bbbbbbbb-0000-0000-0000-000000000001' AND stage=78 AND won), 'first clear exactly once');

SELECT pg_temp.review_ready('bbbbbbbb-0000-0000-0000-000000000001');
SET ROLE authenticated;
DO $$ DECLARE snap jsonb; BEGIN
  snap:=public.sync_auto_adventure();
  IF (snap->'battle'->>'stage')::integer<>78 OR snap->>'mode'<>'holding' THEN
    RAISE EXCEPTION 'advance fixture';
  END IF;
  snap:=public.advance_auto_adventure((snap->'battle'->>'id')::uuid);
  IF snap->>'advance_pending'<>'true' OR (snap->>'stage')::integer<>78 THEN
    RAISE EXCEPTION 'valid advance not recorded';
  END IF;
END $$;
RESET ROLE;
SELECT pg_temp.review_expire('bbbbbbbb-0000-0000-0000-000000000001','won');
SET ROLE authenticated;
DO $$ DECLARE snap jsonb; BEGIN
  snap:=public.sync_auto_adventure();
  IF (snap->>'stage')::integer<>79 OR snap->>'mode'<>'progressing'
     OR snap->>'advance_pending'<>'false' OR (snap->'catchup'->>'gold')::integer<>0 THEN
    RAISE EXCEPTION 'requested advance settlement: %',snap->'catchup';
  END IF;
END $$;
RESET ROLE;
SELECT pg_temp.review_ok((SELECT count(*)=1 FROM public.adventure_encounters
 WHERE user_id='bbbbbbbb-0000-0000-0000-000000000001' AND stage=78 AND won), 'replay no duplicate first clear');

SELECT pg_temp.review_ready('bbbbbbbb-0000-0000-0000-000000000001');
SET ROLE authenticated;
SELECT public.sync_auto_adventure()->>'stage' AS progressing_stage;
RESET ROLE;
UPDATE public.adventure_state SET reward_slot_count=6,gold_today=119,loot_today=0,
 next_reward_at=clock_timestamp()-interval '1 minute'
 WHERE user_id='bbbbbbbb-0000-0000-0000-000000000001';
SELECT pg_temp.review_expire('bbbbbbbb-0000-0000-0000-000000000001','won');
SET ROLE authenticated;
DO $$ DECLARE snap jsonb; BEGIN
  snap:=public.sync_auto_adventure();
  IF (snap->>'stage')::integer<>80 OR (snap->'catchup'->>'gold')::integer<>1
     OR jsonb_array_length(snap->'catchup'->'items')<>1 THEN
    RAISE EXCEPTION 'periodic cap/loot: %',snap->'catchup';
  END IF;
END $$;
RESET ROLE;
SELECT pg_temp.review_ok((SELECT gold_today=120 AND loot_today=1 FROM public.adventure_state
 WHERE user_id='bbbbbbbb-0000-0000-0000-000000000001'), 'daily caps');
SELECT pg_temp.review_ok((SELECT gold=105 FROM public.user_balance
 WHERE user_id='bbbbbbbb-0000-0000-0000-000000000001'), 'balance 4+1');
SELECT pg_temp.review_ok((SELECT count(*)=2 AND sum(amount)=5 FROM public.gold_history
 WHERE user_id='bbbbbbbb-0000-0000-0000-000000000001' AND type='adventure'), 'gold ledger 4+1');
SELECT pg_temp.review_ok((SELECT sum(quantity)=1 FROM public.user_inventory
 WHERE user_id='bbbbbbbb-0000-0000-0000-000000000001'), 'item ledger');
SELECT pg_temp.review_ok((SELECT total_xp=1234 AND level=50 FROM public.profiles
 WHERE user_id='bbbbbbbb-0000-0000-0000-000000000001'), 'no adventure XP');
SELECT pg_temp.review_ok((SELECT xp=7 AND level=5 FROM public.attributes
 WHERE user_id='bbbbbbbb-0000-0000-0000-000000000001'), 'no adventure attributes');

SET ROLE authenticated;
SET request.jwt.claim.sub='bbbbbbbb-0000-0000-0000-000000000002';
DO $$ DECLARE snap jsonb; BEGIN
  snap:=public.sync_auto_adventure();
  IF (snap->'battle'->>'stage')::integer<>10 THEN RAISE EXCEPTION 'boss fixture'; END IF;
END $$;
RESET ROLE;
SELECT set_config('review.battle_b',
 (SELECT current_battle_id::text FROM public.adventure_state WHERE user_id='bbbbbbbb-0000-0000-0000-000000000002'),false);
SET ROLE authenticated;
SET request.jwt.claim.sub='bbbbbbbb-0000-0000-0000-000000000001';
DO $$ DECLARE denied boolean:=false; BEGIN
  BEGIN PERFORM public.advance_auto_adventure(current_setting('review.battle_b')::uuid);
  EXCEPTION WHEN SQLSTATE '22023' THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'cross identity advance accepted'; END IF;
END $$;
RESET ROLE;
SELECT pg_temp.review_ok((SELECT stage=10 AND NOT advance_requested FROM public.adventure_state
 WHERE user_id='bbbbbbbb-0000-0000-0000-000000000002'), 'cross identity no state mutation');
SELECT pg_temp.review_expire('bbbbbbbb-0000-0000-0000-000000000002','won');
SET ROLE authenticated;
SET request.jwt.claim.sub='bbbbbbbb-0000-0000-0000-000000000002';
DO $$ DECLARE snap jsonb; BEGIN
  snap:=public.sync_auto_adventure();
  IF (snap->>'stage')::integer<>10 OR (snap->'catchup'->>'gold')::integer<>12
     OR (snap->>'boss_wins_credited')::integer<>1 THEN
    RAISE EXCEPTION 'boss first clear: %',snap->'catchup';
  END IF;
END $$;
RESET ROLE;
SELECT pg_temp.review_ok((SELECT gold=112 FROM public.user_balance
 WHERE user_id='bbbbbbbb-0000-0000-0000-000000000002'), 'boss gold 12');
SELECT pg_temp.review_ok((SELECT count(*)=1 FROM public.boss_battles
 WHERE user_id='bbbbbbbb-0000-0000-0000-000000000002' AND won), 'boss receipt');

SET ROLE authenticated;
SET request.jwt.claim.sub='bbbbbbbb-0000-0000-0000-000000000003';
DO $$ DECLARE snap jsonb; BEGIN
  snap:=public.sync_auto_adventure();
  IF snap->'battle'->>'engine_version'<>'v3' THEN RAISE EXCEPTION 'v3 fixture'; END IF;
END $$;
RESET ROLE;
SELECT pg_temp.review_expire('bbbbbbbb-0000-0000-0000-000000000003','defeated');
SET ROLE authenticated;
DO $$ DECLARE snap jsonb; BEGIN
  snap:=public.sync_auto_adventure();
  IF (snap->>'stage')::integer<>1 OR (snap->'catchup'->>'retreats')::integer<>0
     OR (snap->'catchup'->>'gold')::integer<>0 THEN RAISE EXCEPTION 'stage1 floor'; END IF;
END $$;
RESET ROLE;
SELECT pg_temp.review_ready('bbbbbbbb-0000-0000-0000-000000000003');
SET ROLE authenticated;
SELECT public.sync_auto_adventure()->>'stage' AS floor_stage;
RESET ROLE;
SELECT pg_temp.review_expire('bbbbbbbb-0000-0000-0000-000000000003','draw');
SET ROLE authenticated;
DO $$ DECLARE snap jsonb; BEGIN
  snap:=public.sync_auto_adventure();
  IF (snap->>'stage')::integer<>1 OR (snap->'catchup'->>'draws')::integer<>1
     OR (snap->'catchup'->>'gold')::integer<>0 THEN RAISE EXCEPTION 'draw no reward/retreat'; END IF;
END $$;
RESET ROLE;
SELECT pg_temp.review_ok((SELECT total_xp=55 FROM public.profiles
 WHERE user_id='bbbbbbbb-0000-0000-0000-000000000003'), 'draw no XP');

SELECT 'CATCHUP_REVIEW_BEHAVIOR_PASS' AS result;
ROLLBACK;
