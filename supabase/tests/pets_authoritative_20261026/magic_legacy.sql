\set ON_ERROR_STOP on
BEGIN;
DO $magic$
DECLARE v_class text; v_type text; v_uid uuid; v_baseline uuid;
  v_pet uuid; v_base jsonb; v_payload jsonb; v_snap jsonb; i integer:=0;
  v_prior app_private.adventure_battles%ROWTYPE; v_count integer;
  v_cutoff timestamptz;
BEGIN
  FOREACH v_class IN ARRAY ARRAY['mago','clerico'] LOOP
    i:=i+1;
    v_baseline:=('a0000000-0000-0000-0000-'||lpad((200+i)::text,12,'0'))::uuid;
    v_uid:=('a0000000-0000-0000-0000-'||lpad((210+i)::text,12,'0'))::uuid;
    v_type:=CASE WHEN v_class='mago' THEN 'mini_dragao_sombrio'
                 ELSE 'mini_demonio_fome' END;
    INSERT INTO auth.users(id) VALUES(v_baseline),(v_uid);
    INSERT INTO public.profiles(user_id,level,starter_class)
      VALUES(v_baseline,20,v_class),(v_uid,20,v_class);
    PERFORM set_config('request.jwt.claim.sub',v_baseline::text,true);
    v_base:=public.sync_auto_adventure()->'battle';
    INSERT INTO public.companions(user_id,companion_type,origin,name,atk)
      VALUES(v_uid,v_type,'shop','Magic',999999) RETURNING id INTO v_pet;
    INSERT INTO app_private.adventure_pet_allowlist(user_id) VALUES(v_uid);
    PERFORM set_config('request.jwt.claim.sub',v_uid::text,true);
    PERFORM public.set_active_adventure_pet(v_pet);
    v_payload:=public.sync_auto_adventure()->'battle';
    v_snap:=v_payload->'pet';
    IF v_payload->>'hero_class'<>v_class
      OR v_snap->'bonus'->>'stat'<>'atk'
      OR (v_snap->'base_stats'->>'atk')::integer<>(v_base->>'hero_attack')::integer
      OR (v_snap->'effective_stats'->>'atk')::integer<>
         round((v_base->>'hero_attack')::integer*1.10)::integer
      OR (v_payload->>'hero_attack')::integer<>
         (v_snap->'effective_stats'->>'atk')::integer
      OR (v_payload->>'hero_attack')::integer>=999999
    THEN RAISE EXCEPTION 'magic offense mismatch: %',v_class; END IF;
  END LOOP;

  -- Catch-up from a v3 battle with a protected pet snapshot resets to its
  -- base stats before choosing another pet. A second switch cannot stack 10%.
  v_uid:='a0000000-0000-0000-0000-000000000230';
  INSERT INTO auth.users(id) VALUES(v_uid);
  INSERT INTO public.profiles(user_id,level,starter_class) VALUES(v_uid,10,'guerreiro');
  INSERT INTO public.companions(user_id,companion_type,origin,name)
    VALUES(v_uid,'mini_dragao_sombrio','shop','Attack') RETURNING id INTO v_pet;
  INSERT INTO app_private.adventure_pet_allowlist(user_id) VALUES(v_uid);
  PERFORM set_config('request.jwt.claim.sub',v_uid::text,true);
  PERFORM public.set_active_adventure_pet(v_pet);
  v_payload:=public.sync_auto_adventure()->'battle';
  SELECT * INTO v_prior FROM app_private.adventure_battles
    WHERE id=(v_payload->>'id')::uuid;
  -- Test-only server clock instrumentation; all changes roll back.
  UPDATE app_private.adventure_pet_selection
    SET effective_at=clock_timestamp()-interval '1 hour'
    WHERE user_id=v_uid;
  UPDATE app_private.adventure_battles SET status='draw' WHERE id=v_prior.id;
  UPDATE public.adventure_state SET current_battle_id=NULL,
    last_tick_at=clock_timestamp()-interval '3 minutes' WHERE user_id=v_uid;
  PERFORM public.sync_auto_adventure();
  IF EXISTS(SELECT 1 FROM app_private.adventure_battles b
    WHERE b.user_id=v_uid AND b.id<>v_prior.id AND b.engine_version='v3'
      AND ((b.rules_snapshot->'pet'->'base_stats'->>'atk')::integer<>
           (v_prior.rules_snapshot->'pet'->'base_stats'->>'atk')::integer
        OR (b.rules_snapshot->'pet'->'effective_stats'->>'atk')::integer<>
           (v_prior.rules_snapshot->'pet'->'effective_stats'->>'atk')::integer))
  THEN RAISE EXCEPTION 'v3 catch-up stacked pet attack'; END IF;
  SELECT count(*) INTO v_count FROM app_private.adventure_battles b
    WHERE b.user_id=v_uid AND b.id<>v_prior.id AND b.engine_version='v3';
  IF v_count=0 THEN RAISE EXCEPTION 'v3 catch-up fixture did not advance'; END IF;

  -- A pre-v3 predecessor keeps legacy combat and yields pet:null, preserving
  -- old payloads when its frozen snapshot is reused for offline recovery.
  v_uid:='a0000000-0000-0000-0000-000000000231';
  INSERT INTO auth.users(id) VALUES(v_uid);
  INSERT INTO public.profiles(user_id,level,starter_class) VALUES(v_uid,10,'guerreiro');
  PERFORM set_config('request.jwt.claim.sub',v_uid::text,true);
  v_payload:=public.sync_auto_adventure()->'battle';
  UPDATE app_private.adventure_battles SET status='draw',engine_version=NULL,
    hero_attack=NULL,hero_defense=NULL,hero_max_mp=NULL,
    enemy_resistances=NULL,rules_snapshot=NULL
    WHERE id=(v_payload->>'id')::uuid;
  UPDATE public.adventure_state SET current_battle_id=NULL,
    last_tick_at=clock_timestamp()-interval '3 minutes' WHERE user_id=v_uid;
  INSERT INTO public.companions(user_id,companion_type,origin,name)
    VALUES(v_uid,'mini_kraken','shop','Late legacy pet') RETURNING id INTO v_pet;
  INSERT INTO app_private.adventure_pet_allowlist(user_id) VALUES(v_uid);
  PERFORM public.set_active_adventure_pet(v_pet);
  v_cutoff:=clock_timestamp()-interval '30 seconds';
  PERFORM public.sync_auto_adventure();
  IF EXISTS(SELECT 1 FROM app_private.adventure_battles b
    WHERE b.user_id=v_uid AND b.id<>(v_payload->>'id')::uuid
      AND b.started_at<v_cutoff
      AND (b.engine_version IS NOT NULL OR b.rules_snapshot IS NOT NULL))
  THEN RAISE EXCEPTION 'legacy catch-up engine drift'; END IF;
  IF EXISTS(SELECT 1 FROM app_private.adventure_battles b
    WHERE b.user_id=v_uid AND b.id<>(v_payload->>'id')::uuid
      AND b.started_at<v_cutoff
      AND app_private.adventure_battle_payload(b,clock_timestamp())->'pet'<>'null'::jsonb)
  THEN RAISE EXCEPTION 'legacy pet payload mismatch'; END IF;
  SELECT count(*) INTO v_count FROM app_private.adventure_battles b
    WHERE b.user_id=v_uid AND b.id<>(v_payload->>'id')::uuid AND b.started_at<v_cutoff;
  IF v_count=0 THEN RAISE EXCEPTION 'legacy catch-up fixture did not advance'; END IF;
END $magic$;
ROLLBACK;
