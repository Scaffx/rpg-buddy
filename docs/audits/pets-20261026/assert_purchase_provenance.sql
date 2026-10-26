-- Synthetic server-owned boss clear allows the real shop RPC to run through
-- its normal permission, ledger, and forage-eligibility provenance path.
BEGIN;
INSERT INTO auth.users(id) VALUES ('b0000000-0000-0000-0000-000000000004');
INSERT INTO public.profiles(user_id,level,starter_class,total_xp)
VALUES ('b0000000-0000-0000-0000-000000000004',10,'guerreiro',700);
INSERT INTO public.user_balance(user_id,gold)
VALUES ('b0000000-0000-0000-0000-000000000004',5000000)
ON CONFLICT(user_id) DO UPDATE SET gold=EXCLUDED.gold;
INSERT INTO public.adventure_encounters
  (user_id,stage,attempt,kind,won,hero_power,enemy_power,gold,boss_id)
SELECT 'b0000000-0000-0000-0000-000000000004',10,1,'boss',true,1000,1,0,
  unlock_boss_id FROM public.pet_catalog WHERE pet_type='mini_demonio_fome';
INSERT INTO app_private.adventure_pet_allowlist(user_id)
VALUES ('b0000000-0000-0000-0000-000000000004');
SET LOCAL request.jwt.claim.sub='b0000000-0000-0000-0000-000000000004';
SET LOCAL ROLE authenticated;
DO $audit$
DECLARE
  v_result jsonb;
  v_pet uuid;
  v_price integer;
  v_before_gold integer;
  v_after_gold integer;
BEGIN
  SELECT price INTO v_price FROM public.pet_catalog
    WHERE pet_type='mini_demonio_fome';
  SELECT gold INTO v_before_gold FROM public.user_balance
    WHERE user_id=auth.uid();
  v_result:=public.buy_pet('mini_demonio_fome');
  IF v_result->>'ok'<>'true'
     OR (v_result->>'gold_spent')::integer<>v_price THEN
    RAISE EXCEPTION 'LEGITIMATE_PET_PURCHASE_FAILED: %',v_result;
  END IF;
  SELECT (p->>'id')::uuid INTO v_pet
    FROM jsonb_array_elements(public.get_adventure_pet_state()->'pets') p
    WHERE p->>'companion_type'='mini_demonio_fome';
  IF v_pet IS NULL THEN RAISE EXCEPTION 'PURCHASE_DID_NOT_CREATE_PET'; END IF;
  SELECT gold INTO v_after_gold FROM public.user_balance
    WHERE user_id=auth.uid();
  IF v_after_gold<>v_before_gold-v_price THEN
    RAISE EXCEPTION 'PURCHASE_BALANCE_MISMATCH';
  END IF;
  v_result:=public.set_active_adventure_pet(v_pet);
  IF v_result->>'active_companion_id'<>v_pet::text THEN
    RAISE EXCEPTION 'BOUGHT_PET_CANNOT_BE_SELECTED: %',v_result;
  END IF;
  RAISE NOTICE 'LEGITIMATE_PURCHASE_PASS';
END $audit$;
RESET ROLE;
DO $audit$
DECLARE v_pet uuid;
BEGIN
  SELECT id INTO v_pet FROM public.companions
    WHERE user_id='b0000000-0000-0000-0000-000000000004'
      AND companion_type='mini_demonio_fome';
  IF NOT EXISTS (SELECT 1 FROM public.gold_history
       WHERE user_id='b0000000-0000-0000-0000-000000000004'
         AND type='compra_pet'
         AND amount=-(SELECT price FROM public.pet_catalog
           WHERE pet_type='mini_demonio_fome'))
     OR NOT EXISTS (SELECT 1 FROM public.inventory_forage_eligible
       WHERE companion_id=v_pet
         AND user_id='b0000000-0000-0000-0000-000000000004'
         AND companion_type='mini_demonio_fome' AND origin='shop') THEN
    RAISE EXCEPTION 'PURCHASE_LEDGER_OR_FORAGE_PROVENANCE_LOST';
  END IF;
END $audit$;
ROLLBACK;
