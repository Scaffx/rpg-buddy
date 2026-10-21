\set ON_ERROR_STOP on
-- Run after migration. Pending evolution preserves the Aprendiz tree.
BEGIN;
DO $$ BEGIN
  IF app_private.hero_class_key('00000000-0000-0000-0000-000000000014') IS DISTINCT FROM 'aprendiz'
     OR app_private.hero_class_key('00000000-0000-0000-0000-000000000015') IS DISTINCT FROM 'aprendiz'
     OR app_private.hero_class_key('00000000-0000-0000-0000-000000000016') IS DISTINCT FROM 'aprendiz'
     OR app_private.has_hero_class('00000000-0000-0000-0000-000000000014')
     OR app_private.has_hero_class('00000000-0000-0000-0000-000000000015')
     OR app_private.has_hero_class('00000000-0000-0000-0000-000000000016')
     OR EXISTS (SELECT 1 FROM app_private.hero_class_identity
       WHERE user_id='00000000-0000-0000-0000-000000000016') THEN
    RAISE EXCEPTION 'Aprendiz tree was lost before base-class choice';
  END IF;
END $$;
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000014';
DO $$ DECLARE denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.advance_hero_class('00000002-0000-0000-0000-000000000002');
  EXCEPTION WHEN OTHERS THEN denied := SQLERRM LIKE '%CLASS_LEVEL_OR_BRANCH_LOCKED%';
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Level-4 mage base class unlocked'; END IF;
END $$;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000015';
SELECT public.allocate_skill_node('a_golpe');
SELECT public.advance_hero_class('00000002-0000-0000-0000-000000000002');
RESET ROLE;
DO $$ BEGIN
  IF app_private.hero_class_key('00000000-0000-0000-0000-000000000015') IS DISTINCT FROM 'mago'
     OR NOT app_private.has_hero_class('00000000-0000-0000-0000-000000000015')
     OR (SELECT current_class_id FROM public.profiles
       WHERE user_id='00000000-0000-0000-0000-000000000015')
       <> '00000002-0000-0000-0000-000000000002'::uuid THEN
    RAISE EXCEPTION 'Level-5 mage base advancement failed';
  END IF;
END $$;
ROLLBACK;
SELECT 'REVIEW_HERO_CLASS_APRENDIZ_WAIT_PASS' AS result;
