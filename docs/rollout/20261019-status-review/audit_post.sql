-- Runs after audit_pre.sql and the candidate migration in the same psql session.
DO $audit$
DECLARE v_state jsonb; v_metadata jsonb;
BEGIN
  IF (SELECT count(*) FROM public.missions
      WHERE title IN ('audit-active','audit-other') AND status='pendente') <> 2
     OR (SELECT count(*) FROM public.missions
      WHERE title IN ('audit-failed','audit-completed') AND status IS NULL) <> 2
     OR (SELECT status FROM public.missions
      WHERE title='audit-archived') <> 'arquivada' THEN
    RAISE EXCEPTION 'AUDIT_BACKFILL_REACTIVATED_OR_MISSED_ROWS';
  END IF;

  SELECT jsonb_build_object(
    'profile',(SELECT to_jsonb(p) FROM public.profiles p WHERE p.user_id=u.id),
    'balance',(SELECT to_jsonb(b) FROM public.user_balance b WHERE b.user_id=u.id),
    'attributes',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id)
                  FROM public.attributes a WHERE a.user_id=u.id),
    'ledger',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id)
              FROM public.mission_daily_completions c WHERE c.user_id=u.id),
    'xp_history',(SELECT jsonb_agg(to_jsonb(h) ORDER BY h.id)
                  FROM public.xp_history h WHERE h.user_id=u.id),
    'gold_history',(SELECT jsonb_agg(to_jsonb(h) ORDER BY h.id)
                    FROM public.gold_history h WHERE h.user_id=u.id),
    'mission_business',(SELECT jsonb_agg(jsonb_build_object(
      'id',m.id,'xp_reward',m.xp_reward,'completed',m.completed,
      'is_failed',m.is_failed,'daily_status',m.daily_status,
      'priority',m.priority,'days_of_week',m.days_of_week,
      'frequency_type',m.frequency_type) ORDER BY m.id)
      FROM public.missions m WHERE m.user_id=u.id)
  ) INTO v_state
  FROM auth.users u WHERE u.id='b3210000-0000-0000-0000-000000000001';
  IF v_state IS DISTINCT FROM (SELECT state FROM bug32_review_economy) THEN
    RAISE EXCEPTION 'AUDIT_BACKFILL_CHANGED_ECONOMY';
  END IF;

  SELECT jsonb_build_object(
    'mission_owner', c.relowner,
    'mission_acl', c.relacl,
    'mission_policies', (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.polname)
                         FROM pg_catalog.pg_policy p WHERE p.polrelid=c.oid),
    'mission_triggers', (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.tgname)
                         FROM pg_catalog.pg_trigger t WHERE t.tgrelid=c.oid
                           AND t.tgname<>'before_mission_status_normalize'),
    'complete', pg_catalog.md5(pg_catalog.pg_get_functiondef(
      'public.complete_mission(uuid,date)'::regprocedure)),
    'undo', pg_catalog.md5(pg_catalog.pg_get_functiondef(
      'public.undo_mission(uuid,date)'::regprocedure)),
    'priority', pg_catalog.md5(pg_catalog.pg_get_functiondef(
      'private.enforce_mission_priority()'::regprocedure))
  ) INTO v_metadata FROM pg_catalog.pg_class c
  WHERE c.oid='public.missions'::regclass;
  IF v_metadata IS DISTINCT FROM (SELECT state FROM bug32_review_metadata) THEN
    RAISE EXCEPTION 'AUDIT_OWNER_ACL_OR_GUARDS_CHANGED';
  END IF;
  IF (SELECT p.proowner = c.relowner AND NOT p.prosecdef
      FROM pg_catalog.pg_proc p CROSS JOIN pg_catalog.pg_class c
      WHERE p.oid='private.normalize_mission_status()'::regprocedure
        AND c.oid='public.missions'::regclass) IS NOT TRUE
     OR pg_catalog.has_function_privilege('authenticated',
          'private.normalize_mission_status()','EXECUTE')
     OR pg_catalog.has_function_privilege('anon',
          'private.normalize_mission_status()','EXECUTE')
     OR (SELECT t.tgenabled='O' FROM pg_catalog.pg_trigger t
         WHERE t.tgrelid='public.missions'::regclass
           AND t.tgname='before_mission_status_normalize') IS NOT TRUE THEN
    RAISE EXCEPTION 'AUDIT_NEW_OBJECT_OWNER_ACL_OR_TRIGGER';
  END IF;
END;
$audit$;

CREATE FUNCTION pg_temp.expect_bug32_error(p_sql text,p_prefix text)
RETURNS void LANGUAGE plpgsql AS $expect$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE p_prefix || '%' THEN RETURN; END IF;
    RAISE;
  END;
  RAISE EXCEPTION 'AUDIT_EXPECTED_ERROR: %',p_prefix;
END;
$expect$;

SET LOCAL request.jwt.claim.sub = 'b3210000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
DO $audit_auth$
DECLARE v_uid uuid := auth.uid(); v_attr uuid; v_id uuid; v_rows int;
        v_i int;
        v_profile jsonb; v_ledger_count int;
BEGIN
  IF current_user <> 'authenticated' OR v_uid IS DISTINCT FROM
     'b3210000-0000-0000-0000-000000000001'::uuid THEN
    RAISE EXCEPTION 'AUDIT_AUTH_CONTEXT_MISSING';
  END IF;
  IF (SELECT count(*) FROM public.missions WHERE title='audit-other') <> 0 THEN
    RAISE EXCEPTION 'AUDIT_CROSS_TENANT_READ';
  END IF;
  UPDATE public.missions SET status='pendente' WHERE title='audit-other';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'AUDIT_CROSS_TENANT_WRITE'; END IF;

  SELECT id INTO STRICT v_attr FROM public.attributes
  WHERE user_id=v_uid AND name='Disciplina';
  INSERT INTO public.missions(user_id,title,attribute_id,priority,
                              status,days_of_week)
  VALUES(v_uid,'audit-explicit-null',v_attr,'baixa',NULL,
         '["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]'::jsonb)
  RETURNING id INTO v_id;
  IF (SELECT status FROM public.missions WHERE id=v_id) <> 'pendente' THEN
    RAISE EXCEPTION 'AUDIT_EXPLICIT_NULL_UNNORMALIZED';
  END IF;
  INSERT INTO public.missions(user_id,title,attribute_id,priority,days_of_week)
  VALUES(v_uid,'audit-default',v_attr,'baixa',
         '["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]'::jsonb)
  RETURNING id INTO v_id;
  IF (SELECT status FROM public.missions WHERE id=v_id) <> 'pendente' THEN
    RAISE EXCEPTION 'AUDIT_DEFAULT_MISSING';
  END IF;
  UPDATE public.missions SET status=NULL WHERE id=v_id;
  IF (SELECT status FROM public.missions WHERE id=v_id) <> 'pendente' THEN
    RAISE EXCEPTION 'AUDIT_ACTIVE_UPDATE_NULL_UNNORMALIZED';
  END IF;

  FOR v_i IN 1..4 LOOP
    INSERT INTO public.missions(user_id,title,attribute_id,priority,days_of_week)
    VALUES(v_uid,'audit-high-'||v_i,v_attr,'alta',
           '["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]'::jsonb);
  END LOOP;
  PERFORM pg_temp.expect_bug32_error(
    format('INSERT INTO public.missions(user_id,title,attribute_id,priority,status,days_of_week) VALUES (%L::uuid,''audit-high-5'',%L::uuid,''alta'',NULL,%L::jsonb)',
           v_uid,v_attr,'["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]'),
    'MISSION_PRIORITY_CAP');
  FOR v_i IN 1..8 LOOP
    INSERT INTO public.missions(user_id,title,attribute_id,priority,days_of_week)
    VALUES(v_uid,'audit-medium-'||v_i,v_attr,'media',
           '["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]'::jsonb);
  END LOOP;
  PERFORM pg_temp.expect_bug32_error(
    format('INSERT INTO public.missions(user_id,title,attribute_id,priority,status,days_of_week) VALUES (%L::uuid,''audit-medium-9'',%L::uuid,''media'',NULL,%L::jsonb)',
           v_uid,v_attr,'["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]'),
    'MISSION_PRIORITY_CAP');
  PERFORM pg_temp.expect_bug32_error(
    'UPDATE public.missions SET priority=''alta'',status=NULL WHERE title=''audit-default''',
    'MISSION_PRIORITY_CAP');
  PERFORM pg_temp.expect_bug32_error(
    'UPDATE public.missions SET priority=''media'',status=NULL WHERE title=''audit-default''',
    'MISSION_PRIORITY_CAP');

  PERFORM pg_temp.expect_bug32_error(
    'UPDATE public.missions SET is_failed=false WHERE title=''audit-failed''',
    'MISSION_STATUS_REQUIRED');
  IF NOT EXISTS(SELECT 1 FROM public.missions WHERE title='audit-failed'
                AND status IS NULL AND is_failed) THEN
    RAISE EXCEPTION 'AUDIT_FAILED_ROW_REACTIVATED';
  END IF;
  PERFORM pg_temp.expect_bug32_error(
    'UPDATE public.missions SET completed=false,status=NULL WHERE title=''audit-archived''',
    'MISSION_STATUS_REQUIRED');
  PERFORM pg_temp.expect_bug32_error(
    'UPDATE public.missions SET completed=false WHERE title=''audit-completed''',
    'MISSION_STATUS_REQUIRED');

  SELECT to_jsonb(p) INTO v_profile FROM public.profiles p WHERE user_id=v_uid;
  SELECT count(*) INTO v_ledger_count FROM public.mission_daily_completions
  WHERE user_id=v_uid;
  UPDATE public.missions SET is_failed=false,status='pendente',
    daily_status=pg_catalog.jsonb_set(COALESCE(daily_status,'{}'::jsonb),
      ARRAY[(now() AT TIME ZONE 'America/Sao_Paulo')::date::text],
      '"completed"'::jsonb)
  WHERE title='audit-failed';
  IF (SELECT to_jsonb(p) FROM public.profiles p WHERE user_id=v_uid)
      IS DISTINCT FROM v_profile
     OR (SELECT count(*) FROM public.mission_daily_completions
         WHERE user_id=v_uid) <> v_ledger_count THEN
    RAISE EXCEPTION 'AUDIT_EXPLICIT_RECOVERY_PAID';
  END IF;
END;
$audit_auth$;
RESET ROLE;
DO $audit_economy$
DECLARE v_state jsonb;
BEGIN
  SELECT jsonb_build_object(
    'profile',(SELECT to_jsonb(p) FROM public.profiles p WHERE p.user_id=u.id),
    'balance',(SELECT to_jsonb(b) FROM public.user_balance b WHERE b.user_id=u.id),
    'attributes',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id)
                  FROM public.attributes a WHERE a.user_id=u.id),
    'ledger',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id)
              FROM public.mission_daily_completions c WHERE c.user_id=u.id),
    'xp_history',(SELECT jsonb_agg(to_jsonb(h) ORDER BY h.id)
                  FROM public.xp_history h WHERE h.user_id=u.id),
    'gold_history',(SELECT jsonb_agg(to_jsonb(h) ORDER BY h.id)
                    FROM public.gold_history h WHERE h.user_id=u.id)
  ) INTO v_state
  FROM auth.users u WHERE u.id='b3210000-0000-0000-0000-000000000001';
  IF v_state IS DISTINCT FROM
     ((SELECT state FROM bug32_review_economy) - 'mission_business') THEN
    RAISE EXCEPTION 'AUDIT_RECOVERY_CHANGED_ECONOMY';
  END IF;
END;
$audit_economy$;
SELECT 'BUG32 independent review: PASS' AS result;
ROLLBACK;
