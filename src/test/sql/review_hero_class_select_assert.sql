\set ON_ERROR_STOP on
DO $$ BEGIN
  IF (SELECT starter_class FROM public.profiles
      WHERE user_id='00000000-0000-0000-0000-000000000002')<>'mago'
    OR (SELECT starter_class FROM app_private.hero_class_identity
      WHERE user_id='00000000-0000-0000-0000-000000000002')<>'mago'
    OR (SELECT count(*) FROM app_private.hero_class_identity
      WHERE user_id='00000000-0000-0000-0000-000000000002')<>1 THEN
    RAISE EXCEPTION 'two initial classes or mirror drift';
  END IF;
END $$;
SET ROLE authenticated;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
DO $$ BEGIN
  IF (public.choose_starter_class('mago')->>'replayed')<>'true' THEN
    RAISE EXCEPTION 'same class retry not idempotent';
  END IF;
END $$;
RESET ROLE;
SELECT 'REVIEW_HERO_CLASS_SELECT_RACE_PASS' AS result;
