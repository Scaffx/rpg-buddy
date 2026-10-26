\set ON_ERROR_STOP on
BEGIN;
DO $offline$
DECLARE v_uid uuid:='a0000000-0000-0000-0000-000000000020';
  v_one uuid; v_two uuid; v_selected_at timestamptz; v_switched_at timestamptz;
  v_first_count integer; v_after_count integer; v_payload jsonb;
BEGIN
  INSERT INTO auth.users(id) VALUES(v_uid);
  INSERT INTO public.profiles(user_id,level,starter_class) VALUES(v_uid,10,'guerreiro');
  INSERT INTO public.companions(user_id,companion_type,origin,name)
    VALUES(v_uid,'mini_kraken','shop','First') RETURNING id INTO v_one;
  INSERT INTO public.companions(user_id,companion_type,origin,name)
    VALUES(v_uid,'mini_necromante','shop','Second') RETURNING id INTO v_two;
  PERFORM set_config('request.jwt.claim.sub',v_uid::text,true);
  -- A prior protected combat row makes the engine reuse its stats for catch-up.
  PERFORM public.sync_auto_adventure();
  UPDATE app_private.adventure_battles SET status='draw'
    WHERE user_id=v_uid AND status='fighting';
  UPDATE public.adventure_state SET current_battle_id=NULL,
    last_tick_at=clock_timestamp()-interval '3 minutes' WHERE user_id=v_uid;
  INSERT INTO app_private.adventure_pet_allowlist(user_id) VALUES(v_uid);
  PERFORM public.set_active_adventure_pet(v_one);
  SELECT effective_at INTO v_selected_at FROM app_private.adventure_pet_selection
    WHERE user_id=v_uid ORDER BY revision DESC LIMIT 1;
  IF app_private.adventure_pet_at(v_uid,v_selected_at-interval '1 microsecond') IS NOT NULL
    OR app_private.adventure_pet_at(v_uid,v_selected_at)->>'companion_type'<>'mini_kraken'
  THEN RAISE EXCEPTION 'selection timeline mismatch'; END IF;
  v_payload:=public.sync_auto_adventure();
  SELECT count(*) INTO v_first_count FROM app_private.adventure_battles
    WHERE user_id=v_uid AND started_at<v_selected_at;
  IF v_first_count<1 THEN RAISE EXCEPTION 'fixture did not create offline backlog'; END IF;
  IF EXISTS (SELECT 1 FROM app_private.adventure_battles
    WHERE user_id=v_uid AND started_at<v_selected_at
      AND rules_snapshot->'pet' IS DISTINCT FROM 'null'::jsonb)
  THEN RAISE EXCEPTION 'selected pet applied retroactively'; END IF;
  PERFORM public.set_active_adventure_pet(v_two);
  SELECT effective_at INTO v_switched_at FROM app_private.adventure_pet_selection
    WHERE user_id=v_uid ORDER BY revision DESC LIMIT 1;
  IF app_private.adventure_pet_at(v_uid,v_selected_at)->>'companion_type'<>'mini_kraken'
    OR app_private.adventure_pet_at(v_uid,v_switched_at)->>'companion_type'<>'mini_necromante'
  THEN RAISE EXCEPTION 'switch rewrote selection history'; END IF;
  PERFORM public.sync_auto_adventure();
  SELECT count(*) INTO v_after_count FROM app_private.adventure_battles
    WHERE user_id=v_uid AND started_at<v_selected_at;
  IF v_after_count<1 OR EXISTS (SELECT 1 FROM app_private.adventure_battles
    WHERE user_id=v_uid AND started_at<v_selected_at
      AND rules_snapshot->'pet' IS DISTINCT FROM 'null'::jsonb)
  THEN RAISE EXCEPTION 'replay rewrote old pet snapshots'; END IF;
  -- DELETE is still allowed for a legitimate owner; FK nulls selection, while
  -- already created battle snapshots stay immutable.
  DELETE FROM public.companions WHERE id=v_two;
  IF app_private.adventure_pet_at(v_uid,clock_timestamp()) IS NOT NULL
    OR EXISTS (SELECT 1 FROM app_private.adventure_pet_selection
      WHERE user_id=v_uid AND revision=(SELECT max(revision) FROM app_private.adventure_pet_selection
        WHERE user_id=v_uid) AND companion_id IS NOT NULL)
  THEN RAISE EXCEPTION 'deleted companion left active/orphan selection'; END IF;
END $offline$;
ROLLBACK;
