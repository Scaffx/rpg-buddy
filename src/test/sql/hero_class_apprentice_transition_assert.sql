\set ON_ERROR_STOP on
-- Run after migration. All decisions below use the real public RPCs.
DO $$
BEGIN
  IF app_private.hero_class_key('00000000-0000-0000-0000-000000000004') IS DISTINCT FROM 'aprendiz'
     OR app_private.has_hero_class('00000000-0000-0000-0000-000000000004') IS DISTINCT FROM false
     OR EXISTS (SELECT 1 FROM app_private.hero_class_identity
       WHERE user_id='00000000-0000-0000-0000-000000000004')
     OR app_private.hero_class_key('00000000-0000-0000-0000-000000000005') IS DISTINCT FROM 'aprendiz'
     OR app_private.has_hero_class('00000000-0000-0000-0000-000000000005') IS DISTINCT FROM false
     OR NOT EXISTS (SELECT 1 FROM app_private.hero_class_identity
       WHERE user_id='00000000-0000-0000-0000-000000000005'
         AND starter_class='mago'
         AND current_class_id='00000001-0000-0000-0000-000000000001')
  THEN RAISE EXCEPTION 'APPRENTICE_SEED_OR_HELPER_WRONG'; END IF;
END $$;

SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
DO $$
DECLARE v_failed boolean := false;
BEGIN
  BEGIN
    PERFORM public.advance_hero_class('00000002-0000-0000-0000-000000000002');
  EXCEPTION WHEN OTHERS THEN
    v_failed := SQLERRM LIKE '%CLASS_LEVEL_OR_BRANCH_LOCKED%';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'APPRENTICE_LEVEL4_PROMOTION_ACCEPTED'; END IF;
END $$;
RESET ROLE;

-- Stand-in for server-authoritative routine XP: only level changes.
UPDATE public.profiles SET level=5
WHERE user_id='00000000-0000-0000-0000-000000000005';
DO $$
BEGIN
  IF app_private.hero_class_key('00000000-0000-0000-0000-000000000005') IS DISTINCT FROM 'aprendiz'
     OR app_private.has_hero_class('00000000-0000-0000-0000-000000000005') IS DISTINCT FROM false
     OR NOT EXISTS (SELECT 1 FROM public.profiles
       WHERE user_id='00000000-0000-0000-0000-000000000005'
         AND level=5
         AND current_class_id='00000001-0000-0000-0000-000000000001')
  THEN RAISE EXCEPTION 'APPRENTICE_LEVEL5_AUTO_PROMOTED'; END IF;
END $$;

SET ROLE authenticated;
DO $$
DECLARE v_result jsonb;
BEGIN
  SELECT public.allocate_skill_node('a_golpe') INTO v_result;
  IF v_result->>'node_id' IS DISTINCT FROM 'a_golpe'
     OR (v_result->>'rank')::integer IS DISTINCT FROM 1
     OR (v_result->>'available')::integer IS DISTINCT FROM 4
     OR NOT EXISTS (SELECT 1 FROM public.player_skill_nodes
       WHERE user_id=auth.uid() AND node_id='a_golpe' AND rank=1)
  THEN RAISE EXCEPTION 'APPRENTICE_LEVEL5_ALLOCATION_FAILED'; END IF;
  SELECT public.advance_hero_class('00000002-0000-0000-0000-000000000002') INTO v_result;
  IF v_result->>'current_class_id' IS DISTINCT FROM '00000002-0000-0000-0000-000000000002'
  THEN RAISE EXCEPTION 'APPRENTICE_LEVEL5_PROMOTION_FAILED'; END IF;
END $$;
RESET ROLE;

DO $$
BEGIN
  IF app_private.hero_class_key('00000000-0000-0000-0000-000000000005') IS DISTINCT FROM 'mago'
     OR app_private.has_hero_class('00000000-0000-0000-0000-000000000005') IS DISTINCT FROM true
     OR NOT EXISTS (SELECT 1 FROM public.profiles p
       JOIN app_private.hero_class_identity i USING (user_id)
       WHERE p.user_id='00000000-0000-0000-0000-000000000005'
         AND p.current_class_id='00000002-0000-0000-0000-000000000002'
         AND i.current_class_id=p.current_class_id)
  THEN RAISE EXCEPTION 'APPRENTICE_POST_PROMOTION_IDENTITY_WRONG'; END IF;
END $$;
SELECT 'HERO_CLASS_APPRENTICE_TRANSITION_PASS' AS result;
