-- Public RPCs, real A5 receipt path. Clock substitution is transactional only.
-- Run after A+B+A3+B4+A4+A5+20261019212523 on the reduced PG17 fixture.
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL request.jwt.claim.sub = 'b6000000-0000-0000-0000-000000000001';

DO $clock$
DECLARE
  signature text;
  original text;
  instrumented text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.complete_mission(uuid,date)',
    'public.undo_mission(uuid,date)',
    'public._complete_mission_with_weekly(uuid,date)'
  ] LOOP
    original := pg_get_functiondef(signature::regprocedure);
    instrumented := replace(original,
      'now() AT TIME ZONE ''America/Sao_Paulo''',
      'TIMESTAMP ''2026-10-20 12:00:00''');
    IF instrumented = original THEN
      RAISE EXCEPTION 'clock instrumentation did not match %', signature;
    END IF;
    EXECUTE instrumented;
  END LOOP;
END;
$clock$;

INSERT INTO auth.users(id,email) VALUES
  ('b6000000-0000-0000-0000-000000000001','weekly-p2@example.invalid');

DO $case$
DECLARE
  u uuid := auth.uid();
  p uuid;
  q uuid := 'b6000000-0000-0000-0000-000000000011';
  a uuid := 'b6000000-0000-0000-0000-000000000020';
  b uuid := 'b6000000-0000-0000-0000-000000000021';
  mon date := DATE '2026-10-19';
  tue date := DATE '2026-10-20';
  initial_xp integer;
  initial_gold integer;
  prior_xp integer;
  prior_gold integer;
  r jsonb;
  milestone_amount integer;
  replay_denied boolean;
BEGIN
  SELECT id INTO p FROM public.attributes WHERE user_id=u AND name='Disciplina';
  INSERT INTO public.attributes(id,user_id,name) VALUES (q,u,'Alternate milestone');
  SELECT total_xp INTO initial_xp FROM public.profiles WHERE user_id=u;
  SELECT gold INTO initial_gold FROM public.user_balance WHERE user_id=u;

  -- Independent A5 route: paid at one, revoked after raise to two, then
  -- re-earned above one. The new receipt belongs to the edited attribute.
  INSERT INTO public.missions(id,user_id,title,attribute_id,priority,
    frequency_type,days_of_week,target_count,max_count,weekly_started_at)
  VALUES (a,u,'Target drift',p,'baixa','weekly','[]'::jsonb,1,2,now()-interval '1 day');
  r := public.complete_mission(a,mon);
  milestone_amount := (r->>'milestone_xp')::integer;
  IF (r->>'milestone_reached')::boolean IS DISTINCT FROM true
     OR milestone_amount <= 0 THEN RAISE EXCEPTION 'first milestone missing'; END IF;
  r := public.complete_mission(a,tue);
  IF (r->>'milestone_reached')::boolean IS DISTINCT FROM false
     OR (SELECT count(*) FROM private.mission_attribute_milestones WHERE mission_id=a) <> 1
  THEN RAISE EXCEPTION 'overflow paid twice'; END IF;

  UPDATE public.missions SET target_count=2 WHERE id=a;
  SELECT total_xp INTO prior_xp FROM public.profiles WHERE user_id=u;
  SELECT gold INTO prior_gold FROM public.user_balance WHERE user_id=u;
  UPDATE public.missions SET target_count=1 WHERE id=a;
  IF (SELECT total_xp FROM public.profiles WHERE user_id=u) <> prior_xp
     OR (SELECT gold FROM public.user_balance WHERE user_id=u) <> prior_gold
  THEN RAISE EXCEPTION 'target UPDATE credited XP or gold'; END IF;
  UPDATE public.missions SET target_count=2 WHERE id=a;
  r := public.undo_mission(a,mon);
  IF (r->>'milestone_revoked')::boolean IS DISTINCT FROM true
     OR EXISTS (SELECT 1 FROM private.mission_attribute_milestones WHERE mission_id=a)
     OR (SELECT current_count FROM public.mission_weekly_progress WHERE mission_id=a) <> 1
  THEN RAISE EXCEPTION 'A5 revocation failed'; END IF;

  UPDATE public.missions SET target_count=1,attribute_id=q WHERE id=a;
  SELECT total_xp INTO prior_xp FROM public.profiles WHERE user_id=u;
  SELECT gold INTO prior_gold FROM public.user_balance WHERE user_id=u;
  IF EXISTS (SELECT 1 FROM private.mission_attribute_milestones WHERE mission_id=a)
     OR (SELECT total_xp FROM public.profiles WHERE user_id=u) <> prior_xp
     OR (SELECT gold FROM public.user_balance WHERE user_id=u) <> prior_gold
  THEN RAISE EXCEPTION 'target/attribute UPDATE credited milestone'; END IF;
  r := public.complete_mission(a,mon);
  IF (r->>'milestone_reached')::boolean IS DISTINCT FROM true
     OR (SELECT current_count FROM public.mission_weekly_progress WHERE mission_id=a) <> 2
     OR (SELECT milestone_paid FROM public.mission_weekly_progress WHERE mission_id=a) IS DISTINCT FROM true
     OR (SELECT count(*) FROM private.mission_attribute_milestones WHERE mission_id=a) <> 1
     OR (SELECT attribute_id FROM private.mission_attribute_milestones WHERE mission_id=a) <> q
     OR (SELECT xp_delta FROM private.mission_attribute_milestones WHERE mission_id=a) <> (r->>'milestone_xp')::integer
  THEN RAISE EXCEPTION 'unpaid milestone not recovered with coherent receipt: %',r; END IF;
  replay_denied := false;
  BEGIN
    PERFORM public.complete_mission(a,mon);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'ALREADY_COMPLETED_TODAY' THEN replay_denied := true; ELSE RAISE; END IF;
  END;
  IF NOT replay_denied THEN RAISE EXCEPTION 'replay was accepted'; END IF;
  r := public.undo_mission(a,tue);
  IF (r->>'milestone_revoked')::boolean IS DISTINCT FROM false
     OR (SELECT count(*) FROM private.mission_attribute_milestones WHERE mission_id=a) <> 1
  THEN RAISE EXCEPTION 'undo of other execution revoked paid milestone'; END IF;
  r := public.undo_mission(a,mon);
  IF (r->>'milestone_revoked')::boolean IS DISTINCT FROM true
     OR EXISTS (SELECT 1 FROM private.mission_attribute_milestones WHERE mission_id=a)
     OR (SELECT xp FROM public.attributes WHERE id=p) <> 0
     OR (SELECT xp FROM public.attributes WHERE id=q) <> 0
     OR (SELECT total_xp FROM public.profiles WHERE user_id=u) <> initial_xp
     OR (SELECT gold FROM public.user_balance WHERE user_id=u) <> initial_gold
  THEN RAISE EXCEPTION 'A5 final undo did not restore original balances'; END IF;
  RAISE NOTICE 'A5 target 1/2, original/new attribute receipts, replay and full undo: PASS';

  -- Lowering two to one after count=1 pays only on the next completion,
  -- even though the next count is already beyond the edited target.
  INSERT INTO public.missions(id,user_id,title,attribute_id,priority,
    frequency_type,days_of_week,target_count,max_count,weekly_started_at)
  VALUES (b,u,'Lowered target',p,'baixa','weekly','[]'::jsonb,2,2,now()-interval '1 day');
  r := public.complete_mission(b,mon);
  IF (r->>'milestone_reached')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'target two paid at count one'; END IF;
  UPDATE public.missions SET target_count=1 WHERE id=b;
  IF (SELECT milestone_paid FROM public.mission_weekly_progress WHERE mission_id=b)
     OR EXISTS (SELECT 1 FROM private.mission_attribute_milestones WHERE mission_id=b)
  THEN RAISE EXCEPTION 'lowering target paid by UPDATE'; END IF;
  r := public.complete_mission(b,tue);
  IF (r->>'milestone_reached')::boolean IS DISTINCT FROM true
     OR (SELECT count(*) FROM private.mission_attribute_milestones WHERE mission_id=b) <> 1
  THEN RAISE EXCEPTION 'lowered target did not pay once'; END IF;
  r := public.undo_mission(b,tue);
  IF (r->>'milestone_revoked')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'overflow undo revoked prematurely'; END IF;
  r := public.undo_mission(b,mon);
  IF (r->>'milestone_revoked')::boolean IS DISTINCT FROM true
     OR (SELECT total_xp FROM public.profiles WHERE user_id=u) <> initial_xp
     OR (SELECT gold FROM public.user_balance WHERE user_id=u) <> initial_gold
     OR EXISTS (SELECT 1 FROM public.attributes WHERE user_id=u AND xp<>0)
  THEN RAISE EXCEPTION 'lowered-target full undo did not restore baseline'; END IF;
  RAISE NOTICE 'target 2->1, overflow, no UPDATE credit and full undo: PASS';
END;
$case$;
ROLLBACK;
