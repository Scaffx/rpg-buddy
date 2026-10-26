\set ON_ERROR_STOP on
BEGIN;
-- The source fixture has no broad client UPDATE grant. This scoped transaction
-- grants one for an adversarial probe, while the live preflight still checks
-- the exact production trigger function, binding and source RPCs.
GRANT SELECT,DELETE,UPDATE (id,user_id,companion_type,origin,name,atk,def,max_hp,max_mp)
  ON public.companions TO authenticated;
CREATE POLICY pet_test_client_guard ON public.companions
  FOR ALL TO authenticated
  USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
SELECT set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);
INSERT INTO app_private.adventure_pet_allowlist(user_id)
  VALUES('11111111-1111-1111-1111-111111111111');
SELECT public.set_active_adventure_pet(id) FROM public.companions
  WHERE user_id='11111111-1111-1111-1111-111111111111' LIMIT 1;
SET LOCAL ROLE authenticated;
DO $probe$
DECLARE v_id uuid; v_rows integer;
BEGIN
  SELECT id INTO v_id FROM public.companions WHERE user_id=auth.uid() LIMIT 1;
  IF v_id IS NULL THEN RAISE EXCEPTION 'probe pet missing'; END IF;
  UPDATE public.companions SET name='Editable',atk=999999 WHERE id=v_id;
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  IF v_rows<>1 THEN RAISE EXCEPTION 'legitimate companion update lost'; END IF;
  BEGIN
    UPDATE public.companions SET companion_type='mini_kraken' WHERE id=v_id;
    RAISE EXCEPTION 'identity mutation accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM<>'COMPANION_REWARD_FIELDS_PROTECTED' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.companions SET origin='lvl3_choice' WHERE id=v_id;
    RAISE EXCEPTION 'origin mutation accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM<>'COMPANION_REWARD_FIELDS_PROTECTED' THEN RAISE; END IF;
  END;
  DELETE FROM public.companions WHERE id=v_id;
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  IF v_rows<>1 THEN RAISE EXCEPTION 'legitimate companion DELETE lost'; END IF;
END $probe$;
RESET ROLE;
DO $fk$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM app_private.adventure_pet_selection
    WHERE user_id='11111111-1111-1111-1111-111111111111'
      AND companion_id IS NULL AND companion_type='mini_relampago')
  THEN RAISE EXCEPTION 'DELETE left active FK or lost history'; END IF;
END $fk$;
ROLLBACK;
