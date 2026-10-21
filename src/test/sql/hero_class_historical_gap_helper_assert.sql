\set ON_ERROR_STOP on
-- Run after a clean fixture and a successful migration. Simulate catalog drift
-- inside a transaction: the server helper must stop granting this branch.
BEGIN;
UPDATE public.classes SET column_index=4, level_min=35
WHERE id='00000003-0000-0000-0000-000000000003';
UPDATE public.profiles SET level=35
WHERE user_id='00000000-0000-0000-0000-000000000001';
UPDATE app_private.hero_class_identity
SET current_class_id='00000003-0000-0000-0000-000000000003'
WHERE user_id='00000000-0000-0000-0000-000000000001';
UPDATE public.profiles
SET current_class_id='00000003-0000-0000-0000-000000000003'
WHERE user_id='00000000-0000-0000-0000-000000000001';
DO $$
BEGIN
  IF app_private.class_path_matches(
       '00000003-0000-0000-0000-000000000003','mago',35)
     OR app_private.hero_class_key('00000000-0000-0000-0000-000000000001') IS NOT NULL
     OR app_private.has_hero_class('00000000-0000-0000-0000-000000000001')
  THEN RAISE EXCEPTION 'HERO_CLASS_GAP_HELPER_ACCEPTED'; END IF;
END $$;
ROLLBACK;
SELECT 'HERO_CLASS_GAP_HELPER_PASS' AS result;
