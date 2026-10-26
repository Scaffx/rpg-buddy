-- Fresh synthetic identities; every row and selection is rolled back.
BEGIN;
INSERT INTO auth.users(id) VALUES
  ('b0000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000002'),
  ('b0000000-0000-0000-0000-000000000003');
INSERT INTO public.profiles(user_id,level,starter_class,total_xp) VALUES
  ('b0000000-0000-0000-0000-000000000001',10,'mago',700),
  ('b0000000-0000-0000-0000-000000000002',10,'mago',700),
  ('b0000000-0000-0000-0000-000000000003',10,'guerreiro',700);
INSERT INTO public.user_balance(user_id,gold) VALUES
  ('b0000000-0000-0000-0000-000000000001',300),
  ('b0000000-0000-0000-0000-000000000002',300),
  ('b0000000-0000-0000-0000-000000000003',300)
ON CONFLICT(user_id) DO UPDATE SET gold=EXCLUDED.gold;
INSERT INTO public.companions(user_id,companion_type,origin,name,atk,def,max_hp,max_mp)
VALUES
  ('b0000000-0000-0000-0000-000000000002','mini_dragao_sombrio',
   'audit_magic','Audit Dragon',999999,999999,999999,999999),
  ('b0000000-0000-0000-0000-000000000003','dog',
   'audit_foreign','Audit Dog',999999,999999,999999,999999);
SELECT set_config('audit.own_pet_id',id::text,true) FROM public.companions
WHERE user_id='b0000000-0000-0000-0000-000000000002';
SELECT set_config('audit.foreign_pet_id',id::text,true) FROM public.companions
WHERE user_id='b0000000-0000-0000-0000-000000000003';

SET LOCAL request.jwt.claim.sub='b0000000-0000-0000-0000-000000000002';
SET LOCAL ROLE authenticated;
DO $audit$
DECLARE v_state jsonb; v_own uuid;
BEGIN
  v_state:=public.get_adventure_pet_state();
  IF v_state->>'enabled'<>'false' OR v_state->>'active_companion_id' IS NOT NULL
  THEN RAISE EXCEPTION 'DARK_GATE_STATE_MISMATCH: %',v_state; END IF;
  v_own:=current_setting('audit.own_pet_id')::uuid;
  BEGIN
    PERFORM public.set_active_adventure_pet(v_own);
    RAISE EXCEPTION 'DARK_GATE_ACCEPTED_SELECTION';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM NOT LIKE '%PET_ROLLOUT_DISABLED%' THEN RAISE; END IF;
  END;
END $audit$;
RESET ROLE;

INSERT INTO app_private.adventure_pet_allowlist(user_id)
VALUES ('b0000000-0000-0000-0000-000000000002');
SET LOCAL ROLE authenticated;
DO $audit$
DECLARE v_own uuid; v_foreign uuid; v_state jsonb;
BEGIN
  v_own:=current_setting('audit.own_pet_id')::uuid;
  v_foreign:=current_setting('audit.foreign_pet_id')::uuid;
  BEGIN
    PERFORM public.set_active_adventure_pet(v_foreign);
    RAISE EXCEPTION 'FOREIGN_PET_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM NOT LIKE '%PET_NOT_OWNED%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.set_active_adventure_pet('ffffffff-ffff-ffff-ffff-ffffffffffff');
    RAISE EXCEPTION 'FORGED_PET_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM NOT LIKE '%PET_NOT_OWNED%' THEN RAISE; END IF;
  END;
  v_state:=public.set_active_adventure_pet(v_own);
  IF v_state->>'active_companion_id'<>v_own::text OR v_state->>'enabled'<>'true'
  THEN RAISE EXCEPTION 'OWN_PET_NOT_ACTIVE: %',v_state; END IF;
  PERFORM public.set_active_adventure_pet(v_own);
END $audit$;
RESET ROLE;
DO $audit$
BEGIN
  IF (SELECT count(*) FROM app_private.adventure_pet_selection
      WHERE user_id='b0000000-0000-0000-0000-000000000002')<>1
  THEN RAISE EXCEPTION 'REPEATED_SELECTION_DUPLICATED_HISTORY'; END IF;
END $audit$;

SET LOCAL ROLE anon;
DO $audit$
BEGIN
  BEGIN
    PERFORM public.get_adventure_pet_state();
    RAISE EXCEPTION 'ANON_GET_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.set_active_adventure_pet(NULL);
    RAISE EXCEPTION 'ANON_SET_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $audit$;
RESET ROLE;

DO $audit$
DECLARE v_without jsonb; v_with jsonb; v_pet uuid; v_saved jsonb;
  v_base jsonb; v_effective jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000001',true);
  v_without:=public.sync_auto_adventure()->'battle';
  PERFORM set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000002',true);
  v_with:=public.sync_auto_adventure()->'battle';
  SELECT id INTO v_pet FROM public.companions
    WHERE user_id='b0000000-0000-0000-0000-000000000002';
  v_saved:=v_with->'pet';
  v_base:=v_saved->'base_stats';
  v_effective:=v_saved->'effective_stats';
  IF v_without->>'hero_class'<>'mago' OR v_with->>'hero_class'<>'mago'
    OR v_without->'pet' IS DISTINCT FROM 'null'::jsonb
    OR v_saved IS NULL
    OR v_saved->>'companion_id'<>v_pet::text
    OR v_saved->'bonus'<>jsonb_build_object('stat','atk','pct',0.10)
    OR (v_base->>'atk')::integer<>(v_without->>'hero_attack')::integer
    OR (v_effective->>'atk')::integer<>round((v_base->>'atk')::numeric*1.10)::integer
    OR (v_effective->>'def')::integer<>(v_base->>'def')::integer
    OR (v_effective->>'hp')::integer<>(v_base->>'hp')::integer
    OR (v_effective->>'mp')::integer<>(v_base->>'mp')::integer
  THEN RAISE EXCEPTION 'MAGIC_OFFENSE_OR_FORGED_STATS_MISMATCH no=% with=%',v_without,v_with; END IF;
  IF (SELECT total_xp FROM public.profiles
      WHERE user_id='b0000000-0000-0000-0000-000000000002')<>700
    OR (SELECT gold FROM public.user_balance
      WHERE user_id='b0000000-0000-0000-0000-000000000002')<>300
  THEN RAISE EXCEPTION 'PET_BATTLE_CREATED_XP_OR_GOLD'; END IF;
  PERFORM public.set_active_adventure_pet(NULL);
  IF (SELECT rules_snapshot->'pet' FROM app_private.adventure_battles
      WHERE id=(v_with->>'id')::uuid) IS DISTINCT FROM v_saved
  THEN RAISE EXCEPTION 'DESELECT_REWROTE_BATTLE'; END IF;
  RAISE NOTICE 'PET_PUBLIC_IDENTITY_AND_MAGIC_OFFENSE_PASS';
END $audit$;
ROLLBACK;
