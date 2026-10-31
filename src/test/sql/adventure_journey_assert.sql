-- Execute after fixture + migration with psql -X -v ON_ERROR_STOP=1.
DO $test$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.adventure_journey_choices'::regclass)
    OR has_table_privilege('anon','public.adventure_journey_choices','SELECT')
    OR has_table_privilege('anon','public.adventure_journey_choices','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
    OR has_table_privilege('authenticated','public.adventure_journey_choices','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
    OR NOT has_table_privilege('authenticated','public.adventure_journey_choices','SELECT')
    OR has_function_privilege('anon','public.get_adventure_journey(integer)','EXECUTE')
    OR has_function_privilege('anon','public.save_adventure_journey_choice(integer,integer,text)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.get_adventure_journey(integer)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.save_adventure_journey_choice(integer,integer,text)','EXECUTE')
    OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname='save_adventure_journey_choice') <> 1
    OR (SELECT count(*) FROM pg_policies
         WHERE schemaname='public' AND tablename='adventure_journey_choices'
           AND cmd='SELECT' AND roles='{authenticated}' AND qual LIKE '%auth.uid()%') <> 1
  THEN RAISE EXCEPTION 'JOURNEY_ACL_RLS_FAILED'; END IF;
END $test$;

SET ROLE anon;
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
DO $test$ DECLARE denied boolean := false; BEGIN
  BEGIN PERFORM public.get_adventure_journey(NULL);
  EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'ANON_RPC_ALLOWED'; END IF;
END $test$;
RESET ROLE;

SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
DO $test$ DECLARE rejected boolean := false; v jsonb; BEGIN
  v := public.get_adventure_journey();
  IF v->>'stage' <> '4' OR v->>'chapter' <> '1' OR jsonb_array_length(v->'choices') <> 0
  THEN RAISE EXCEPTION 'JOURNEY_WRONG_STAGE'; END IF;
  BEGIN PERFORM public.save_adventure_journey_choice(1,1,'restore');
  EXCEPTION WHEN SQLSTATE '22023' THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'FORGED_STAGE_ACCEPTED'; END IF;
  rejected := false;
  BEGIN PERFORM public.save_adventure_journey_choice(2,1,'restore');
  EXCEPTION WHEN SQLSTATE '22023' THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'FORGED_CYCLE_ACCEPTED'; END IF;
  rejected := false;
  BEGIN INSERT INTO public.adventure_journey_choices(user_id,cycle,chapter,choice)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001',1,1,'restore');
  EXCEPTION WHEN insufficient_privilege THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'DIRECT_INSERT_ALLOWED'; END IF;
END $test$;
RESET ROLE;

UPDATE public.adventure_state SET stage=5
 WHERE user_id='aaaaaaaa-0000-0000-0000-000000000001';
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
DO $test$ DECLARE v jsonb; rejected boolean := false; BEGIN
  v := public.save_adventure_journey_choice(1,1,'restore');
  IF v->>'replayed' <> 'false' THEN RAISE EXCEPTION 'FIRST_SAVE_NOT_NEW'; END IF;
  v := public.save_adventure_journey_choice(1,1,'restore');
  IF v->>'replayed' <> 'true' THEN RAISE EXCEPTION 'RETRY_NOT_IDEMPOTENT'; END IF;
  BEGIN PERFORM public.save_adventure_journey_choice(1,1,'explore');
  EXCEPTION WHEN unique_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'CONFLICT_OVERWROTE_CHOICE'; END IF;
  v := public.get_adventure_journey();
  IF v->'choices'->0->>'choice' <> 'restore' THEN RAISE EXCEPTION 'PERSISTENCE_FAILED'; END IF;
  rejected := false;
  BEGIN PERFORM public.save_adventure_journey_choice(1,1,'wrong');
  EXCEPTION WHEN SQLSTATE '22023' THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'INVALID_CHOICE_ACCEPTED'; END IF;
END $test$;
RESET ROLE;

SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
DO $test$ DECLARE v jsonb; BEGIN
  IF (SELECT count(*) FROM public.adventure_journey_choices) <> 0
    THEN RAISE EXCEPTION 'OTHER_USER_ROW_VISIBLE'; END IF;
  v := public.get_adventure_journey();
  IF v->>'stage' <> '15' OR v->>'chapter' <> '2' OR jsonb_array_length(v->'choices') <> 0
    THEN RAISE EXCEPTION 'OTHER_USER_RPC_LEAK'; END IF;
  v := public.save_adventure_journey_choice(1,2,'explore');
  IF v->>'chapter' <> '2' OR v->>'choice' <> 'explore'
    THEN RAISE EXCEPTION 'OTHER_USER_SAVE_FAILED'; END IF;
  v := public.save_adventure_journey_choice(1,1,'restore');
  IF v->>'chapter' <> '1' OR v->>'replayed' <> 'false'
    THEN RAISE EXCEPTION 'LATE_CHAPTER_CHOICE_FAILED'; END IF;
END $test$;
RESET ROLE;

UPDATE public.adventure_state SET stage=10
 WHERE user_id='aaaaaaaa-0000-0000-0000-000000000002';
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
DO $test$ DECLARE v jsonb; BEGIN
  v := public.get_adventure_journey();
  IF v->>'stage' <> '10' OR v->>'chapter' <> '1'
    OR v->'choices'->1->>'chapter' <> '2'
    OR v->'choices'->1->>'choice' <> 'explore'
  THEN RAISE EXCEPTION 'RETREAT_LOST_CHOICE'; END IF;
END $test$;
RESET ROLE;

UPDATE public.adventure_state SET stage=55
 WHERE user_id='aaaaaaaa-0000-0000-0000-000000000002';
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
DO $test$ DECLARE v jsonb; BEGIN
  v := public.save_adventure_journey_choice(1,3,'restore');
  IF v->>'replayed' <> 'false' THEN RAISE EXCEPTION 'PAST_CYCLE_CHOICE_FAILED'; END IF;
  v := public.get_adventure_journey(1);
  IF v->>'cycle' <> '2' OR v->>'view_cycle' <> '1'
    OR jsonb_array_length(v->'choices') <> 3
    THEN RAISE EXCEPTION 'PAST_CYCLE_NOT_VISIBLE'; END IF;
  v := public.get_adventure_journey(NULL);
  IF v->>'view_cycle' <> '2' OR jsonb_array_length(v->'choices') <> 0
    THEN RAISE EXCEPTION 'CURRENT_CYCLE_POLLUTED'; END IF;
END $test$;
RESET ROLE;

DO $test$ BEGIN
  IF (SELECT choice FROM public.adventure_journey_choices
      WHERE user_id='aaaaaaaa-0000-0000-0000-000000000001') <> 'restore'
    OR (SELECT choice FROM public.adventure_journey_choices
      WHERE user_id='aaaaaaaa-0000-0000-0000-000000000002' AND chapter=2) <> 'explore'
    OR (SELECT count(*) FROM public.adventure_journey_choices) <> 4
  THEN RAISE EXCEPTION 'OWNERSHIP_OR_CONFLICT_FAILED'; END IF;
END $test$;
SELECT 'ADVENTURE_JOURNEY_PASS' AS result;
