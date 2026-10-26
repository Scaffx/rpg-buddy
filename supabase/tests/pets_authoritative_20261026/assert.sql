\set ON_ERROR_STOP on
BEGIN;
DO $assert$
DECLARE v_types text[]:=ARRAY['spirit_fox','calopsita','mini_necromante','mini_leviata',
  'golem_guardian','mini_kraken','dog','mini_dragao_sombrio','mini_demonio_fome',
  'mini_relampago','mini_wyrm_gelo','cat']; v_type text; v_stat text;
  v_none jsonb; v_kraken jsonb; v_necro jsonb; v_leviata jsonb; v_skill jsonb;
  v_uid uuid:='11111111-1111-1111-1111-111111111111';
  v_pet_id uuid; v_other uuid; v_before timestamptz; v_after timestamptz;
  v_battle jsonb; v_state jsonb; v_count integer; v_xp integer; v_gold integer;
  v_global_selected_at timestamptz;
BEGIN
  FOREACH v_type IN ARRAY v_types LOOP
    v_stat:=app_private.adventure_pet_catalog(v_type)->>'stat';
    IF v_stat IS DISTINCT FROM (CASE
      WHEN v_type=ANY(ARRAY['spirit_fox','calopsita','mini_necromante','mini_leviata']) THEN 'mp'
      WHEN v_type=ANY(ARRAY['golem_guardian','mini_kraken','dog']) THEN 'hp'
      WHEN v_type=ANY(ARRAY['mini_dragao_sombrio','mini_demonio_fome']) THEN 'atk'
      ELSE 'def' END)
      OR (app_private.adventure_pet_catalog(v_type)->>'pct')::numeric<>0.10
    THEN RAISE EXCEPTION 'catalog mismatch: %',v_type; END IF;
  END LOOP;
  IF app_private.adventure_pet_catalog('unknown') IS NOT NULL
    OR app_private.adventure_pet_sustain('unknown') IS NOT NULL
    OR (SELECT count(*) FROM app_private.adventure_pet_allowlist)<>0
    OR (SELECT global_enabled FROM app_private.adventure_pet_rollout WHERE singleton)
  THEN RAISE EXCEPTION 'catalog/rollout unsafe'; END IF;
  IF EXISTS (SELECT 1 FROM (VALUES
    ('mini_kraken','regen_hp',0.05::numeric),
    ('mini_necromante','regen_mp',0.08::numeric),
    ('mini_leviata','mp_cost',0.20::numeric)) x(typ,kind,pct)
    WHERE app_private.adventure_pet_sustain(x.typ)->>'kind'<>x.kind
      OR (app_private.adventure_pet_sustain(x.typ)->>'pct')::numeric<>x.pct)
  THEN RAISE EXCEPTION 'sustain catalog mismatch'; END IF;

  v_skill:='[{"id":"s","name":"S","type":"dano","power":10,"mp_cost":20,"cooldown":0,"effect":"physical"}]'::jsonb;
  v_none:=app_private.adventure_simulate_v3(now(),20,10,100,100,100,100,
    v_skill,'{}'::jsonb,'physical',0);
  IF v_none IS DISTINCT FROM app_private.adventure_simulate_v3(now(),20,10,100,100,100,100,
    v_skill,'{}'::jsonb,'physical',0,NULL) THEN
    RAISE EXCEPTION 'no-pet simulation changed'; END IF;
  v_kraken:=app_private.adventure_simulate_v3(now(),20,10,100,100,100,100,
    v_skill,'{}'::jsonb,'physical',0,'{"kind":"regen_hp","pct":0.05}'::jsonb);
  IF (v_kraken->1->>'hero_hp')::integer<>(v_none->1->>'hero_hp')::integer+5
    OR (v_kraken->1->>'healing')::integer<>5
  THEN RAISE EXCEPTION 'Kraken regen mismatch'; END IF;
  v_necro:=app_private.adventure_simulate_v3(now(),20,10,100,100,100,100,
    v_skill,'{}'::jsonb,'physical',0,'{"kind":"regen_mp","pct":0.08}'::jsonb);
  IF (v_necro->1->>'hero_mp')::integer<>(v_none->1->>'hero_mp')::integer+8
  THEN RAISE EXCEPTION 'Necromancer regen mismatch'; END IF;
  v_leviata:=app_private.adventure_simulate_v3(now(),20,10,100,100,100,100,
    v_skill,'{}'::jsonb,'physical',0,'{"kind":"mp_cost","pct":0.20}'::jsonb);
  IF (v_leviata->0->>'mp_cost')::integer<>16
    OR (v_none->0->>'mp_cost')::integer<>20
  THEN RAISE EXCEPTION 'Leviathan cost mismatch'; END IF;
  -- A lethal enemy action must not be followed by a pet revival.
  v_kraken:=app_private.adventure_simulate_v3(now(),20,0,100,100,500,100,
    '[]'::jsonb,'{}'::jsonb,'physical',0,'{"kind":"regen_hp","pct":0.05}'::jsonb);
  IF (v_kraken->-1->>'hero_hp')::integer<>0 THEN RAISE EXCEPTION 'pet revived defeat'; END IF;
  -- Regen clamps at max, and a 1 MP skill remains minimum 1 after reduction.
  v_necro:=app_private.adventure_simulate_v3(now(),20,10,100,100,100,100,
    '[]'::jsonb,'{}'::jsonb,'physical',0,'{"kind":"regen_mp","pct":0.08}'::jsonb);
  IF (v_necro->1->>'hero_mp')::integer<>100 THEN RAISE EXCEPTION 'MP clamp mismatch'; END IF;
  v_leviata:=app_private.adventure_simulate_v3(now(),20,10,100,1,100,100,
    '[{"id":"s","name":"S","type":"dano","power":10,"mp_cost":1,"cooldown":0,"effect":"physical"}]'::jsonb,
    '{}'::jsonb,'physical',0,'{"kind":"mp_cost","pct":0.20}'::jsonb);
  IF (v_leviata->0->>'mp_cost')::integer<>1 THEN RAISE EXCEPTION 'MP minimum mismatch'; END IF;

  PERFORM set_config('request.jwt.claim.sub',v_uid::text,true);
  SELECT id INTO v_pet_id FROM public.companions WHERE user_id=v_uid LIMIT 1;
  SELECT id INTO v_other FROM public.companions WHERE user_id='22222222-2222-2222-2222-222222222222' LIMIT 1;
  IF v_other IS NULL THEN
    INSERT INTO public.companions(user_id,companion_type,origin,name)
    VALUES('22222222-2222-2222-2222-222222222222','dog','lvl3_choice','Other') RETURNING id INTO v_other;
  END IF;
  SELECT count(*) INTO v_count FROM app_private.adventure_pet_selection;
  BEGIN PERFORM public.set_active_adventure_pet(v_pet_id);
    RAISE EXCEPTION 'disabled selection accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM<>'PET_ROLLOUT_DISABLED' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM app_private.adventure_pet_selection)<>v_count THEN
    RAISE EXCEPTION 'disabled selection mutated history'; END IF;
  INSERT INTO app_private.adventure_pet_allowlist(user_id) VALUES(v_uid);
  BEGIN PERFORM public.set_active_adventure_pet(v_other);
    RAISE EXCEPTION 'foreign pet accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM<>'PET_NOT_OWNED' THEN RAISE; END IF;
  END;
  BEGIN PERFORM public.set_active_adventure_pet('ffffffff-ffff-ffff-ffff-ffffffffffff');
    RAISE EXCEPTION 'fabricated pet accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM<>'PET_NOT_OWNED' THEN RAISE; END IF;
  END;
  v_before:=clock_timestamp();
  v_state:=public.set_active_adventure_pet(v_pet_id);
  IF v_state->>'enabled'<>'true' OR (v_state->>'active_companion_id')::uuid<>v_pet_id
    OR jsonb_array_length(v_state->'pets')<1
  THEN RAISE EXCEPTION 'state RPC mismatch'; END IF;
  v_after:=clock_timestamp();
  IF app_private.adventure_pet_at(v_uid,v_before) IS NOT NULL
    OR app_private.adventure_pet_at(v_uid,v_after)->>'companion_type'<>'mini_relampago'
  THEN RAISE EXCEPTION 'selection timestamp mismatch'; END IF;
  PERFORM public.set_active_adventure_pet(v_pet_id);
  IF (SELECT count(*) FROM app_private.adventure_pet_selection WHERE user_id=v_uid)<>1
  THEN RAISE EXCEPTION 'duplicate set wrote history'; END IF;
  -- Client-writable combat rows cannot enter the server stat calculation.
  UPDATE public.companions SET atk=999999,def=999999,max_hp=999999,max_mp=999999
    WHERE id=v_pet_id;
  SELECT total_xp INTO v_xp FROM public.profiles WHERE user_id=v_uid;
  SELECT gold INTO v_gold FROM public.user_balance WHERE user_id=v_uid;
  v_battle:=public.sync_auto_adventure()->'battle';
  IF v_battle->'pet'->>'companion_id' IS NULL
     OR (v_battle->'pet'->'base_stats'->>'def')::integer>=999999
     OR (v_battle->'pet'->'effective_stats'->>'def')::integer<
       (v_battle->'pet'->'base_stats'->>'def')::integer
  THEN RAISE EXCEPTION 'battle snapshot/power mismatch: %',v_battle->'pet'; END IF;
  IF (SELECT total_xp FROM public.profiles WHERE user_id=v_uid)<>v_xp
  THEN RAISE EXCEPTION 'adventure granted XP'; END IF;
  IF (SELECT gold FROM public.user_balance WHERE user_id=v_uid) IS DISTINCT FROM v_gold
  THEN RAISE EXCEPTION 'adventure directly changed gold'; END IF;
  IF NOT EXISTS (SELECT 1 FROM app_private.adventure_battles b
    WHERE b.id=(v_battle->>'id')::uuid AND b.rules_snapshot->'pet'=v_battle->'pet')
  THEN RAISE EXCEPTION 'protected battle snapshot absent'; END IF;
  DELETE FROM app_private.adventure_pet_allowlist WHERE user_id=v_uid;
  v_state:=public.get_adventure_pet_state();
  IF v_state->>'enabled'<>'false' OR v_state->>'active_companion_id' IS NOT NULL
    OR jsonb_array_length(v_state->'pets')<1
  THEN RAISE EXCEPTION 'disabled state mismatch'; END IF;
  IF app_private.adventure_pet_at(v_uid,(v_battle->>'started_at')::timestamptz)
       ->>'companion_id' IS DISTINCT FROM v_pet_id::text
  THEN RAISE EXCEPTION 'gate disable rewrote past eligibility'; END IF;
  INSERT INTO app_private.adventure_pet_allowlist(user_id) VALUES(v_uid);
  v_state:=public.get_adventure_pet_state();
  IF v_state->>'enabled'<>'true' OR v_state->>'active_companion_id' IS NOT NULL
  THEN RAISE EXCEPTION 're-enabled state used stale selection'; END IF;
  PERFORM public.set_active_adventure_pet(v_pet_id);
  IF (SELECT count(*) FROM app_private.adventure_pet_selection WHERE user_id=v_uid)<>2
  THEN RAISE EXCEPTION 're-enabled selection did not receive new server clock'; END IF;
  -- Switching never changes a stored battle.
  PERFORM public.set_active_adventure_pet(NULL);
  IF (SELECT b.rules_snapshot->'pet' FROM app_private.adventure_battles b
       WHERE b.id=(v_battle->>'id')::uuid) IS DISTINCT FROM v_battle->'pet'
  THEN RAISE EXCEPTION 'switch changed existing battle'; END IF;
  -- Root-only global toggles receive server time even if a caller supplies a
  -- future value; disabling does not erase an earlier eligibility window.
  UPDATE app_private.adventure_pet_rollout
    SET global_enabled=true,enabled_at='2099-01-01'::timestamptz WHERE singleton;
  IF (SELECT enabled_at FROM app_private.adventure_pet_rollout WHERE singleton)>clock_timestamp()
  THEN RAISE EXCEPTION 'global gate accepted future clock'; END IF;
  PERFORM set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',true);
  PERFORM public.set_active_adventure_pet(v_other);
  SELECT effective_at INTO v_global_selected_at FROM app_private.adventure_pet_selection
    WHERE user_id='22222222-2222-2222-2222-222222222222'
    ORDER BY revision DESC LIMIT 1;
  UPDATE app_private.adventure_pet_rollout SET global_enabled=false WHERE singleton;
  IF app_private.adventure_pet_at('22222222-2222-2222-2222-222222222222',v_global_selected_at)
      ->>'companion_id' IS DISTINCT FROM v_other::text
    OR app_private.adventure_pet_at('22222222-2222-2222-2222-222222222222',clock_timestamp())
      IS NOT NULL
  THEN RAISE EXCEPTION 'global gate history mismatch'; END IF;
END $assert$;

-- Public API is the only client write surface.
DO $acl$
DECLARE v_table regclass; v_function regprocedure;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'app_private.adventure_pet_rollout'::regclass,
    'app_private.adventure_pet_allowlist'::regclass,
    'app_private.adventure_pet_selection'::regclass,
    'app_private.adventure_pet_gate_history'::regclass] LOOP
    IF has_table_privilege('anon',v_table,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
      OR has_table_privilege('authenticated',v_table,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
      OR EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=v_table AND a.attnum>0
        AND NOT a.attisdropped AND
        (has_column_privilege('anon',v_table,a.attname,'INSERT,UPDATE')
        OR has_column_privilege('authenticated',v_table,a.attname,'INSERT,UPDATE')))
    THEN RAISE EXCEPTION 'private pet table ACL leak: %',v_table; END IF;
  END LOOP;
  FOREACH v_function IN ARRAY ARRAY[
    'app_private.adventure_pet_catalog(text)'::regprocedure,
    'app_private.adventure_pet_sustain(text)'::regprocedure,
    'app_private.adventure_pet_at(uuid,timestamptz)'::regprocedure,
    'app_private.adventure_pet_gate_clock()'::regprocedure,
    'app_private.adventure_pet_gate_record()'::regprocedure,
    'public._guard_inventory_forage_pet()'::regprocedure,
    'public._record_inventory_forage_pet()'::regprocedure,
    'app_private.adventure_simulate_v3(timestamptz,integer,integer,integer,integer,integer,integer,jsonb,jsonb,text,integer,jsonb)'::regprocedure] LOOP
    IF has_function_privilege('anon',v_function,'EXECUTE')
       OR has_function_privilege('authenticated',v_function,'EXECUTE')
    THEN RAISE EXCEPTION 'private helper EXECUTE leak: %',v_function; END IF;
  END LOOP;
  IF has_function_privilege('anon','public.get_adventure_pet_state()','EXECUTE')
    OR has_function_privilege('anon','public.set_active_adventure_pet(uuid)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.get_adventure_pet_state()','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.set_active_adventure_pet(uuid)','EXECUTE')
  THEN RAISE EXCEPTION 'public pet RPC ACL mismatch'; END IF;
END $acl$;
ROLLBACK;
