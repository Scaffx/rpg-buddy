\set ON_ERROR_STOP on
BEGIN;
DO $matrix$
DECLARE v_types text[]:=ARRAY['spirit_fox','calopsita','mini_necromante','mini_leviata',
  'golem_guardian','mini_kraken','dog','mini_dragao_sombrio','mini_demonio_fome',
  'mini_relampago','mini_wyrm_gelo','cat'];
  v_uid uuid; v_type text; v_pet uuid; v_payload jsonb; v_snap jsonb;
  v_stat text; v_key text; v_base integer; v_effective integer; i integer;
  v_nopet jsonb; v_initial_gold integer; v_final_gold integer;
BEGIN
  FOR i IN 0..12 LOOP
    v_uid:=('a0000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid;
    INSERT INTO auth.users(id) VALUES(v_uid);
    INSERT INTO public.profiles(user_id,level,starter_class,total_xp)
      VALUES(v_uid,10,'guerreiro',700);
    PERFORM set_config('request.jwt.claim.sub',v_uid::text,true);
    IF i>0 THEN
      v_type:=v_types[i];
      INSERT INTO public.companions(user_id,companion_type,origin,name,
        atk,def,max_hp,max_mp)
      VALUES(v_uid,v_type,'shop','Matrix '||i,99999,99999,99999,99999)
      RETURNING id INTO v_pet;
      INSERT INTO app_private.adventure_pet_allowlist(user_id) VALUES(v_uid);
      PERFORM public.set_active_adventure_pet(v_pet);
    END IF;
    SELECT gold INTO v_initial_gold FROM public.user_balance WHERE user_id=v_uid;
    v_payload:=public.sync_auto_adventure()->'battle';
    IF v_payload IS NULL OR v_payload='null'::jsonb
      THEN RAISE EXCEPTION 'missing battle: %',i; END IF;
    IF i=0 THEN
      v_nopet:=v_payload;
      IF v_payload->'pet'<>'null'::jsonb
        THEN RAISE EXCEPTION 'no-pet payload mismatch'; END IF;
    ELSE
      v_snap:=v_payload->'pet';
      v_stat:=app_private.adventure_pet_catalog(v_type)->>'stat';
      IF v_snap->>'companion_type'<>v_type OR v_snap->>'companion_id'<>v_pet::text
        OR v_snap->'bonus'<>app_private.adventure_pet_catalog(v_type)
        OR v_snap->'sustain' IS DISTINCT FROM
           coalesce(app_private.adventure_pet_sustain(v_type),'null'::jsonb)
      THEN RAISE EXCEPTION 'pet snapshot/catalog mismatch: %',v_type; END IF;
      FOREACH v_key IN ARRAY ARRAY['atk','def','hp','mp'] LOOP
        v_base:=(v_snap->'base_stats'->>v_key)::integer;
        v_effective:=(v_snap->'effective_stats'->>v_key)::integer;
        IF v_base<>(v_nopet->>(CASE v_key
            WHEN 'atk' THEN 'hero_attack' WHEN 'def' THEN 'hero_defense'
            WHEN 'hp' THEN 'hero_max_hp' ELSE 'hero_max_mp' END))::integer
          OR v_effective<>(CASE WHEN v_key=v_stat THEN round(v_base*1.10)::integer
                              ELSE v_base END)
        THEN RAISE EXCEPTION 'stat mismatch % % base=% effective=%',v_type,v_key,v_base,v_effective; END IF;
      END LOOP;
      IF (v_payload->>'hero_attack')::integer<>(v_snap->'effective_stats'->>'atk')::integer
        OR (v_payload->>'hero_defense')::integer<>(v_snap->'effective_stats'->>'def')::integer
        OR (v_payload->>'hero_max_hp')::integer<>(v_snap->'effective_stats'->>'hp')::integer
        OR (v_payload->>'hero_max_mp')::integer<>(v_snap->'effective_stats'->>'mp')::integer
      THEN RAISE EXCEPTION 'effective stats not used: %',v_type; END IF;
    END IF;
    IF (SELECT total_xp FROM public.profiles WHERE user_id=v_uid)<>700
      THEN RAISE EXCEPTION 'XP changed: %',i; END IF;
    SELECT gold INTO v_final_gold FROM public.user_balance WHERE user_id=v_uid;
    IF v_final_gold IS DISTINCT FROM v_initial_gold AND v_initial_gold IS NOT NULL
      THEN RAISE EXCEPTION 'gold changed at battle creation: %',i; END IF;
  END LOOP;
END $matrix$;
ROLLBACK;
