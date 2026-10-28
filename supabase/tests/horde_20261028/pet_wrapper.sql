\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id) VALUES
  ('a0000000-0000-0000-0000-00000000a501'),
  ('a0000000-0000-0000-0000-00000000a502'),
  ('a0000000-0000-0000-0000-00000000a503');
INSERT INTO public.profiles(user_id,level,starter_class,current_class_id,combat_skill_loadout)
SELECT id,20,'mago','00000002-0000-0000-0000-000000000002',
  jsonb_build_array(jsonb_build_object('id','aprendiz-golpe'))
FROM auth.users WHERE id IN (
  'a0000000-0000-0000-0000-00000000a501',
  'a0000000-0000-0000-0000-00000000a502',
  'a0000000-0000-0000-0000-00000000a503');
INSERT INTO public.player_skill_nodes(user_id,node_id,rank)
SELECT id,'aprendiz-golpe',1 FROM auth.users WHERE id IN (
  'a0000000-0000-0000-0000-00000000a501',
  'a0000000-0000-0000-0000-00000000a502',
  'a0000000-0000-0000-0000-00000000a503');
INSERT INTO public.companions(id,user_id,companion_type,origin,name) VALUES
  ('b0000000-0000-0000-0000-00000000a501','a0000000-0000-0000-0000-00000000a501','mini_kraken','shop','Kraken'),
  ('b0000000-0000-0000-0000-00000000a502','a0000000-0000-0000-0000-00000000a502','mini_necromante','shop','Necromante'),
  ('b0000000-0000-0000-0000-00000000a503','a0000000-0000-0000-0000-00000000a503','mini_leviata','shop','Leviata'),
  ('b0000000-0000-0000-0000-00000000a504','a0000000-0000-0000-0000-00000000a501','dog','shop','Dog');
INSERT INTO app_private.adventure_pet_allowlist(user_id) VALUES
  ('a0000000-0000-0000-0000-00000000a501'),
  ('a0000000-0000-0000-0000-00000000a502'),
  ('a0000000-0000-0000-0000-00000000a503');

SET ROLE authenticated;
DO $call$
DECLARE v_user uuid; v_pet uuid; v_payload jsonb;
BEGIN
  FOR v_user,v_pet IN SELECT * FROM (VALUES
    ('a0000000-0000-0000-0000-00000000a501'::uuid,'b0000000-0000-0000-0000-00000000a501'::uuid),
    ('a0000000-0000-0000-0000-00000000a502'::uuid,'b0000000-0000-0000-0000-00000000a502'::uuid),
    ('a0000000-0000-0000-0000-00000000a503'::uuid,'b0000000-0000-0000-0000-00000000a503'::uuid)) x
  LOOP
    PERFORM set_config('request.jwt.claim.sub',v_user::text,true);
    IF (public.set_active_adventure_pet(v_pet)->>'active_companion_id')::uuid IS DISTINCT FROM v_pet
    THEN RAISE EXCEPTION 'PET_WRAPPER_SELECTION_FAILED %',v_user; END IF;
    v_payload:=public.sync_auto_adventure()->'battle';
    IF (v_payload->'pet'->>'companion_id')::uuid IS DISTINCT FROM v_pet
      OR v_payload->>'engine_version'<>'v4_horde'
    THEN RAISE EXCEPTION 'PET_WRAPPER_SNAPSHOT_FAILED %: %',v_user,v_payload; END IF;
  END LOOP;
END $call$;
RESET ROLE;

DO $assert$
DECLARE v_user uuid; v_kind text; b app_private.adventure_battles%ROWTYPE;
  v_pet jsonb; v_actual jsonb; v_baseline jsonb; v_events jsonb;
  v_base integer; v_effective integer; v_stat text;
  v_original_snapshot jsonb; v_original_events jsonb;
BEGIN
  FOR v_user,v_kind IN SELECT * FROM (VALUES
    ('a0000000-0000-0000-0000-00000000a501'::uuid,'regen_hp'),
    ('a0000000-0000-0000-0000-00000000a502'::uuid,'regen_mp'),
    ('a0000000-0000-0000-0000-00000000a503'::uuid,'mp_cost')) x
  LOOP
    SELECT * INTO STRICT b FROM app_private.adventure_battles WHERE user_id=v_user;
    v_pet:=b.rules_snapshot->'pet';
    v_stat:=v_pet->'bonus'->>'stat';
    v_base:=(v_pet->'base_stats'->>v_stat)::integer;
    v_effective:=(v_pet->'effective_stats'->>v_stat)::integer;
    IF v_pet->'sustain'->>'kind' IS DISTINCT FROM v_kind
      OR v_effective<>round(v_base*1.10)::integer
      OR b.hero_max_hp<>(v_pet->'effective_stats'->>'hp')::integer
      OR b.hero_max_mp<>(v_pet->'effective_stats'->>'mp')::integer
      OR b.hero_attack<>(v_pet->'effective_stats'->>'atk')::integer
      OR b.hero_defense<>(v_pet->'effective_stats'->>'def')::integer
    THEN RAISE EXCEPTION 'PET_EFFECTIVE_STATS_FAILED %: %',v_user,v_pet; END IF;
    v_events:=app_private.adventure_simulate_horde(b.started_at,b.hero_attack,
      b.hero_defense,b.hero_max_hp,b.hero_max_mp,b.rules_snapshot->'enemies',
      b.skills,coalesce(b.rules_snapshot->>'default_effect','physical'),0,NULL);
    SELECT e INTO STRICT v_actual FROM jsonb_array_elements(b.events) e
      WHERE e->>'actor'='hero' LIMIT 1;
    SELECT e INTO STRICT v_baseline FROM jsonb_array_elements(v_events) e
      WHERE e->>'actor'='hero' LIMIT 1;
    IF (v_kind='regen_hp' AND (v_actual->>'hero_hp')::integer<=(v_baseline->>'hero_hp')::integer)
      OR (v_kind='regen_mp' AND (v_actual->>'hero_mp')::integer<=(v_baseline->>'hero_mp')::integer)
      OR (v_kind='mp_cost' AND ((v_actual->>'mp_cost')::integer<>4
        OR (v_baseline->>'mp_cost')::integer<>5))
    THEN RAISE EXCEPTION 'PET_SUSTAIN_FAILED % actual=% baseline=%',v_user,v_actual,v_baseline;
    END IF;
    IF (SELECT total_xp<>0 OR level<>20 FROM public.profiles WHERE user_id=v_user)
      OR EXISTS (SELECT 1 FROM public.gold_history WHERE user_id=v_user AND type='adventure')
    THEN RAISE EXCEPTION 'PET_PROGRESSION_REWARD_FAILED %',v_user; END IF;
    RAISE NOTICE 'PET_WRAPPER_PASS type=% base=% effective=% hero_hp=% hero_mp=% mp_cost=%',
      v_kind,v_base,v_effective,v_actual->>'hero_hp',v_actual->>'hero_mp',v_actual->>'mp_cost';
  END LOOP;
  SELECT rules_snapshot,events INTO STRICT v_original_snapshot,v_original_events
    FROM app_private.adventure_battles
    WHERE user_id='a0000000-0000-0000-0000-00000000a501';
  PERFORM set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-00000000a501',true);
  PERFORM public.set_active_adventure_pet('b0000000-0000-0000-0000-00000000a504');
  IF (SELECT rules_snapshot IS DISTINCT FROM v_original_snapshot
      OR events IS DISTINCT FROM v_original_events
      FROM app_private.adventure_battles
      WHERE user_id='a0000000-0000-0000-0000-00000000a501')
    OR (SELECT app_private.adventure_battle_payload(battle,clock_timestamp())->'pet'
        IS DISTINCT FROM v_original_snapshot->'pet'
        FROM app_private.adventure_battles battle
        WHERE user_id='a0000000-0000-0000-0000-00000000a501')
  THEN RAISE EXCEPTION 'PET_SWITCH_MUTATED_RUNNING_BATTLE'; END IF;
  RAISE NOTICE 'PET_SNAPSHOT_IMMUTABLE_PASS';
END $assert$;
ROLLBACK;
