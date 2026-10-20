-- Run after live fixture + A193625/B200215/A3204003/B4204951/A4205347
-- + 20261019210221. Everything rolls back, including deliberately bad rows.
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
INSERT INTO auth.users(id,email) VALUES
  ('a0000000-0000-0000-0000-000000000001','attribute-receipt-a@example.invalid'),
  ('a0000000-0000-0000-0000-000000000002','attribute-receipt-b@example.invalid');
INSERT INTO public.attributes(id,user_id,name) VALUES
  ('a0000000-0000-0000-0000-000000000011',auth.uid(),'Sec A'),
  ('a0000000-0000-0000-0000-000000000012',auth.uid(),'Sec B'),
  ('a0000000-0000-0000-0000-000000000013',auth.uid(),'Sec C'),
  ('a0000000-0000-0000-0000-000000000014',auth.uid(),'Sec D');

DO $checks$
DECLARE
  u uuid := auth.uid();
  d date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  p uuid;
  other_p uuid;
  a uuid := 'a0000000-0000-0000-0000-000000000011';
  b uuid := 'a0000000-0000-0000-0000-000000000012';
  c uuid := 'a0000000-0000-0000-0000-000000000013';
  z uuid := 'a0000000-0000-0000-0000-000000000014';
  m uuid := 'a0000000-0000-0000-0000-000000000021';
  md1 uuid := 'a0000000-0000-0000-0000-000000000022';
  mu uuid := 'a0000000-0000-0000-0000-000000000023';
  mw uuid := 'a0000000-0000-0000-0000-000000000024';
  bad record;
  bad_ten jsonb;
  bad_extreme jsonb;
  failed boolean;
  result jsonb;
  milestone_amount integer;
  same_week boolean := EXTRACT(isodow FROM d)::integer <> 1;
BEGIN
  SELECT id INTO p FROM public.attributes WHERE user_id=u AND name='Disciplina';
  SELECT id INTO other_p FROM public.attributes
   WHERE user_id='a0000000-0000-0000-0000-000000000002' AND name='Disciplina';
  SELECT jsonb_agg(a::text) INTO bad_ten FROM generate_series(1,10);
  SELECT jsonb_agg(a::text) INTO bad_extreme FROM generate_series(1,1000);

  INSERT INTO public.missions(id,user_id,title,attribute_id,secondary_attribute_ids,
    priority,frequency_type,days_of_week)
  VALUES (m,u,'Attribute checks',p,'[]'::jsonb,'media','daily',
    '["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]'::jsonb);

  FOR bad IN SELECT * FROM (VALUES
    ('ten repetitions',p,bad_ten,'INVALID_SECONDARY_ATTRIBUTES: expected at most two IDs'),
    ('extreme array',p,bad_extreme,'INVALID_SECONDARY_ATTRIBUTES: expected at most two IDs'),
    ('secondary repeated',p,jsonb_build_array(a::text,a::text),
      'INVALID_SECONDARY_ATTRIBUTES: duplicate or primary ID'),
    ('primary repeated',p,jsonb_build_array(p::text),
      'INVALID_SECONDARY_ATTRIBUTES: duplicate or primary ID'),
    ('foreign primary',other_p,'[]'::jsonb,'ATTRIBUTE_NOT_OWNED_OR_MISSING'),
    ('foreign secondary',p,jsonb_build_array(other_p::text),'ATTRIBUTE_NOT_OWNED_OR_MISSING'),
    ('wrong shape',p,'{"id":1}'::jsonb,
      'INVALID_SECONDARY_ATTRIBUTES: expected at most two IDs'),
    ('wrong element type',p,'[123]'::jsonb,
      'INVALID_SECONDARY_ATTRIBUTES: expected UUID strings'),
    ('bad UUID',p,'["bad-uuid"]'::jsonb,
      'INVALID_SECONDARY_ATTRIBUTES: invalid UUID'),
    ('three distinct',p,jsonb_build_array(a::text,b::text,c::text),
      'INVALID_SECONDARY_ATTRIBUTES: expected at most two IDs')
  ) AS cases(label, primary_id, secondaries, expected_error)
  LOOP
    UPDATE public.missions SET attribute_id=bad.primary_id,
      secondary_attribute_ids=bad.secondaries WHERE id=m;
    failed := false;
    BEGIN
      PERFORM public.complete_mission(m,d);
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM = bad.expected_error THEN failed := true; ELSE RAISE; END IF;
    END;
    IF NOT failed THEN RAISE EXCEPTION '% was credited',bad.label; END IF;
    IF (SELECT total_xp FROM public.profiles WHERE user_id=u) <> 0
       OR EXISTS (SELECT 1 FROM public.attributes WHERE user_id=u AND xp<>0)
       OR EXISTS (SELECT 1 FROM private.mission_attribute_receipts WHERE mission_id=m)
    THEN RAISE EXCEPTION '% left residual balance',bad.label; END IF;
  END LOOP;

  -- Existing valid daily reward is 25 medium, with one 12 XP credit per secondary.
  UPDATE public.missions SET attribute_id=p,
    secondary_attribute_ids=jsonb_build_array(a::text,b::text) WHERE id=m;
  result := public.complete_mission(m,d);
  IF (result->>'xp_gained')::integer <> 25
     OR (SELECT xp FROM public.attributes WHERE id=p) <> 25
     OR (SELECT xp FROM public.attributes WHERE id=a) <> 12
     OR (SELECT xp FROM public.attributes WHERE id=b) <> 12
     OR (SELECT count(*) FROM private.mission_attribute_awards
          WHERE mission_id=m AND completion_date=d) <> 3
  THEN RAISE EXCEPTION 'Daily exact credit/receipt failed: %',result; END IF;

  -- Editing the configuration after credit must not redirect its undo.
  UPDATE public.missions SET attribute_id=c,
    secondary_attribute_ids=jsonb_build_array(z::text), priority='alta',
    title='Edited future text', days_of_week='[]'::jsonb, due_date=d+1 WHERE id=m;
  PERFORM public.undo_mission(m,d);
  IF EXISTS (SELECT 1 FROM public.attributes WHERE user_id=u AND xp<>0)
     OR (SELECT total_xp FROM public.profiles WHERE user_id=u) <> 0
     OR EXISTS (SELECT 1 FROM private.mission_attribute_receipts WHERE mission_id=m)
  THEN RAISE EXCEPTION 'Edited daily undo left XP'; END IF;
  UPDATE public.missions SET days_of_week=
    '["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]'::jsonb,
    due_date=NULL WHERE id=m;
  result := public.complete_mission(m,d);
  IF (result->>'xp_gained')::integer <> 50
     OR (SELECT xp FROM public.attributes WHERE id=c) <> 50
     OR (SELECT xp FROM public.attributes WHERE id=z) <> 12
  THEN RAISE EXCEPTION 'Edited daily redo used stale award'; END IF;
  PERFORM public.undo_mission(m,d);

  INSERT INTO public.missions(id,user_id,title,attribute_id,secondary_attribute_ids,
    priority,frequency_type,days_of_week)
  VALUES (md1,u,'D-1',a,jsonb_build_array(b::text),'baixa','daily',
    '["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]'::jsonb);
  PERFORM public.complete_mission(md1,d-1);
  UPDATE public.missions SET attribute_id=c, secondary_attribute_ids='[]'::jsonb
   WHERE id=md1;
  PERFORM public.undo_mission(md1,d-1);

  INSERT INTO public.missions(id,user_id,title,attribute_id,secondary_attribute_ids,
    priority,frequency_type,days_of_week,due_date)
  VALUES (mu,u,'Unique',a,jsonb_build_array(b::text),'baixa','daily','[]'::jsonb,d);
  PERFORM public.complete_mission(mu,d);
  UPDATE public.missions SET attribute_id=c, secondary_attribute_ids='[]'::jsonb
   WHERE id=mu;
  PERFORM public.undo_mission(mu,d);

  -- A weekly milestone is paid with yesterday's primary. On Tue-Sun, today's
  -- completion is same-week overflow; on Monday these are two distinct weeks.
  INSERT INTO public.missions(id,user_id,title,attribute_id,secondary_attribute_ids,
    priority,frequency_type,days_of_week,target_count,max_count,weekly_started_at)
  VALUES (mw,u,'Weekly',a,jsonb_build_array(b::text),'baixa','weekly','[]'::jsonb,
    1,2,now()-interval '1 day');
  result := public.complete_mission(mw,d-1);
  milestone_amount := (result->>'milestone_xp')::integer;
  IF milestone_amount <= 0 OR (result->>'milestone_reached')::boolean IS NOT TRUE
  THEN RAISE EXCEPTION 'Weekly milestone missing: %',result; END IF;
  UPDATE public.missions SET attribute_id=c,
    secondary_attribute_ids=jsonb_build_array(z::text) WHERE id=mw;
  result := public.complete_mission(mw,d);
  IF (result->>'milestone_reached')::boolean IS DISTINCT FROM (NOT same_week)
  THEN RAISE EXCEPTION 'Weekly milestone boundary wrong: %',result; END IF;
  PERFORM public.undo_mission(mw,d-1);
  IF (SELECT xp FROM public.attributes WHERE id=a) <>
       (CASE WHEN same_week THEN milestone_amount ELSE 0 END)
     OR (SELECT count(*) FROM private.mission_attribute_milestones WHERE mission_id=mw) <> 1
  THEN RAISE EXCEPTION 'Weekly undo used wrong milestone receipt'; END IF;
  UPDATE public.missions SET attribute_id=p,
    secondary_attribute_ids='[]'::jsonb WHERE id=mw;
  PERFORM public.undo_mission(mw,d);
  IF EXISTS (SELECT 1 FROM public.attributes WHERE user_id=u AND xp<>0)
     OR (SELECT total_xp FROM public.profiles WHERE user_id=u) <> 0
     OR (SELECT missions_completed FROM public.profiles WHERE user_id=u) <> 0
     OR EXISTS (SELECT 1 FROM private.mission_attribute_receipts WHERE user_id=u)
     OR EXISTS (SELECT 1 FROM private.mission_attribute_milestones WHERE user_id=u)
  THEN RAISE EXCEPTION 'Daily/D-1/unique/weekly undo left residual XP'; END IF;

  -- Historical verified profile ledgers cannot reconstruct attribute awards.
  UPDATE public.missions SET attribute_id=p,
    secondary_attribute_ids='[]'::jsonb WHERE id=m;
  result := public.complete_mission(m,d);
  DELETE FROM private.mission_attribute_receipts WHERE mission_id=m AND completion_date=d;
  failed := false;
  BEGIN
    PERFORM public.undo_mission(m,d);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'ATTRIBUTE_AWARD_RECEIPT_MISSING:%' THEN failed := true;
    ELSE RAISE; END IF;
  END;
  IF NOT failed OR (SELECT xp FROM public.attributes WHERE id=p) <>
       (result->>'xp_gained')::integer
     OR (SELECT total_xp FROM public.profiles WHERE user_id=u) <>
       (result->>'xp_gained')::integer
  THEN RAISE EXCEPTION 'Missing receipt allowed estimated reversal'; END IF;
  RAISE NOTICE 'Attribute validation, daily/D-1/unique/weekly receipts, edit, redo and legacy refusal: PASS';
END;
$checks$;

-- Synthetic same-week receipt exercise: the real D-1 window straddles two
-- ISO weeks on Mondays, so an overflow cannot be reached in this local clock.
DO $milestone_split$
DECLARE
  u uuid := auth.uid();
  d date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  a uuid := 'a0000000-0000-0000-0000-000000000011';
  m uuid := 'a0000000-0000-0000-0000-000000000031';
  w date := d - (EXTRACT(isodow FROM d)::integer - 1);
BEGIN
  UPDATE public.attributes SET xp=20, level=public.get_level_from_xp_v2(20)
   WHERE id=a AND user_id=u;
  INSERT INTO private.mission_attribute_receipts
    (mission_id,completion_date,user_id,award_count)
  VALUES (m,d,u,1),(m,d+1,u,1);
  INSERT INTO private.mission_attribute_awards
    (mission_id,completion_date,attribute_id,user_id,xp_delta)
  VALUES (m,d,a,u,5),(m,d+1,a,u,5);
  INSERT INTO private.mission_attribute_milestones
    (mission_id,week_start,user_id,awarded_on,attribute_id,xp_delta)
  VALUES (m,w,u,d,a,10);
  PERFORM private.undo_mission_attribute_awards(m,d,u,false,w);
  IF (SELECT xp FROM public.attributes WHERE id=a) <> 15
     OR NOT EXISTS (SELECT 1 FROM private.mission_attribute_milestones WHERE mission_id=m)
  THEN RAISE EXCEPTION 'Overflow helper removed retained milestone'; END IF;
  PERFORM private.undo_mission_attribute_awards(m,d+1,u,true,w);
  IF (SELECT xp FROM public.attributes WHERE id=a) <> 0
     OR EXISTS (SELECT 1 FROM private.mission_attribute_milestones WHERE mission_id=m)
  THEN RAISE EXCEPTION 'Later helper undo retained milestone'; END IF;
END;
$milestone_split$;

DO $acl$
DECLARE r text; t text; p text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    FOREACH t IN ARRAY ARRAY[
      'private.mission_attribute_receipts',
      'private.mission_attribute_awards',
      'private.mission_attribute_milestones'
    ] LOOP
      FOREACH p IN ARRAY ARRAY['INSERT','UPDATE','DELETE'] LOOP
        IF has_table_privilege(r,t,p) THEN
          RAISE EXCEPTION 'Attribute receipt grants % on % to %',p,t,r;
        END IF;
      END LOOP;
    END LOOP;
    IF has_function_privilege(r,
       'private.undo_mission_attribute_awards(uuid,date,uuid,boolean,date)','EXECUTE')
    THEN RAISE EXCEPTION 'Attribute receipt grants helper to %',r; END IF;
  END LOOP;
END;
$acl$;

SET LOCAL ROLE authenticated;
DO $client$
DECLARE statement text; denied boolean;
BEGIN
  FOREACH statement IN ARRAY ARRAY[
    'INSERT INTO private.mission_attribute_receipts(mission_id,completion_date,user_id,award_count) VALUES (gen_random_uuid(),current_date,auth.uid(),0)',
    'UPDATE private.mission_attribute_awards SET xp_delta=9999',
    'DELETE FROM private.mission_attribute_milestones'
  ] LOOP
    denied := false;
    BEGIN EXECUTE statement;
    EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
    IF NOT denied THEN RAISE EXCEPTION 'authenticated executed %',statement; END IF;
  END LOOP;
END;
$client$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $anon$
DECLARE denied boolean := false;
BEGIN
  BEGIN DELETE FROM private.mission_attribute_receipts;
  EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'anon deleted private receipt'; END IF;
END;
$anon$;
RESET ROLE;
ROLLBACK;
