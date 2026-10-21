\set ON_ERROR_STOP on
DO $$
BEGIN
  IF app_private.hero_class_key('00000000-0000-0000-0000-000000000001') <> 'mago'
     OR NOT app_private.has_hero_class('00000000-0000-0000-0000-000000000001')
     OR (SELECT current_class_id FROM public.profiles
         WHERE user_id='00000000-0000-0000-0000-000000000001') IS NOT NULL
     OR (SELECT rank FROM public.player_skill_nodes
         WHERE user_id='00000000-0000-0000-0000-000000000001' AND node_id='m_dardo') <> 1
  THEN RAISE EXCEPTION 'existing mage was not preserved'; END IF;
  IF has_function_privilege('anon','public.allocate_skill_node(text)','EXECUTE')
     OR has_function_privilege('anon','public.perform_class_respec(text)','EXECUTE')
     OR has_function_privilege('anon','public.choose_starter_class(text)','EXECUTE')
     OR has_function_privilege('anon','public.advance_hero_class(uuid)','EXECUTE')
     OR has_function_privilege('authenticated','app_private.hero_class_key(uuid)','EXECUTE')
     OR has_function_privilege('authenticated','app_private.has_hero_class(uuid)','EXECUTE')
     OR has_table_privilege('authenticated','app_private.hero_class_identity','UPDATE')
     OR has_table_privilege('authenticated','public.player_skill_nodes','INSERT')
     OR has_table_privilege('authenticated','public.player_skill_nodes','UPDATE')
     OR has_table_privilege('authenticated','public.player_skill_nodes','DELETE')
     OR has_table_privilege('authenticated','public.player_skill_nodes','TRUNCATE')
     OR NOT has_table_privilege('authenticated','public.player_skill_nodes','SELECT')
  THEN RAISE EXCEPTION 'ACL not closed'; END IF;
END $$;

SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
SET request.jwt.claim.role = 'service_role';
DO $$
DECLARE v_response jsonb; v_failed boolean;
BEGIN
  BEGIN
    UPDATE public.profiles SET starter_class='mago'
      WHERE user_id='00000000-0000-0000-0000-000000000002';
  EXCEPTION WHEN OTHERS THEN
    v_failed := SQLERRM LIKE '%HERO_CLASS_WRITE_PROTECTED%';
  END;
  IF NOT COALESCE(v_failed,false) THEN RAISE EXCEPTION 'forged profile accepted'; END IF;
  UPDATE public.profiles SET display_name='Nome legítimo', avatar_url='avatar'
    WHERE user_id='00000000-0000-0000-0000-000000000002';
  IF (SELECT display_name FROM public.profiles
       WHERE user_id='00000000-0000-0000-0000-000000000002') <> 'Nome legítimo'
  THEN RAISE EXCEPTION 'ordinary profile write blocked'; END IF;
  SELECT public.choose_starter_class('mago') INTO v_response;
  IF v_response->>'starter_class' <> 'mago'
     OR v_response->>'starter_item' <> 'Grimorio Basico'
  THEN RAISE EXCEPTION 'starter class result wrong'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.choose_starter_class('guerreiro');
  EXCEPTION WHEN OTHERS THEN v_failed := SQLERRM LIKE '%STARTER_CLASS_ALREADY_CHOSEN%';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'second initial choice accepted'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.allocate_skill_node('g_golpe');
  EXCEPTION WHEN OTHERS THEN v_failed := SQLERRM LIKE '%SKILL_TREE_CLASS_LOCKED%';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'foreign tree accepted'; END IF;
  PERFORM public.allocate_skill_node('m_dardo');
  IF (SELECT rank FROM public.player_skill_nodes
      WHERE user_id=auth.uid() AND node_id='m_dardo') <> 1
  THEN RAISE EXCEPTION 'legitimate mage point not allocated'; END IF;
  v_failed := false;
  BEGIN
    INSERT INTO public.player_skill_nodes(user_id,node_id,rank,source)
    VALUES(auth.uid(),'g_golpe',9,'scroll');
  EXCEPTION WHEN OTHERS THEN v_failed := SQLSTATE = '42501';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'direct forged node INSERT accepted'; END IF;
  v_failed := false;
  BEGIN
    UPDATE public.player_skill_nodes SET rank=9,source='scroll'
    WHERE user_id=auth.uid() AND node_id='m_dardo';
  EXCEPTION WHEN OTHERS THEN v_failed := SQLSTATE = '42501';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'direct rank/source UPDATE accepted'; END IF;
  v_failed := false;
  BEGIN
    DELETE FROM public.player_skill_nodes
    WHERE user_id=auth.uid() AND node_id='m_dardo';
  EXCEPTION WHEN OTHERS THEN v_failed := SQLSTATE = '42501';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'direct node DELETE accepted'; END IF;
  v_failed := false;
  BEGIN
    TRUNCATE public.player_skill_nodes;
  EXCEPTION WHEN OTHERS THEN v_failed := SQLSTATE = '42501';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'direct node TRUNCATE accepted'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.advance_hero_class('00000002-0000-0000-0000-000000000002');
  EXCEPTION WHEN OTHERS THEN v_failed := SQLERRM LIKE '%CLASS_LEVEL_OR_BRANCH_LOCKED%';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'level gate bypassed'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.advance_hero_class('00000002-0000-0000-0000-000000000001');
  EXCEPTION WHEN OTHERS THEN v_failed := SQLERRM LIKE '%CLASS_LEVEL_OR_BRANCH_LOCKED%';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'foreign branch bypassed'; END IF;
  IF EXISTS(SELECT 1 FROM public.profiles
            WHERE user_id='00000000-0000-0000-0000-000000000003'
              AND display_name='Nome legítimo')
  THEN RAISE EXCEPTION 'auth.uid isolation failed'; END IF;
END $$;
RESET ROLE;
UPDATE public.profiles SET level=5 WHERE user_id='00000000-0000-0000-0000-000000000002';
SET ROLE authenticated;
DO $$
DECLARE v_failed boolean;
BEGIN
  PERFORM public.advance_hero_class('00000002-0000-0000-0000-000000000002');
  IF (SELECT current_class_id FROM public.profiles WHERE user_id=auth.uid())
     <> '00000002-0000-0000-0000-000000000002'
  THEN RAISE EXCEPTION 'Mago promotion failed'; END IF;
  BEGIN
    PERFORM public.advance_hero_class('00000003-0000-0000-0000-000000000003');
  EXCEPTION WHEN OTHERS THEN v_failed := SQLERRM LIKE '%CLASS_LEVEL_OR_BRANCH_LOCKED%';
  END;
  IF NOT COALESCE(v_failed,false) THEN RAISE EXCEPTION 'tier 3 level gate bypassed'; END IF;
END $$;
RESET ROLE;
UPDATE public.profiles SET level=15 WHERE user_id='00000000-0000-0000-0000-000000000002';
SET ROLE authenticated;
DO $$
DECLARE v_result jsonb; v_failed boolean;
BEGIN
  PERFORM public.advance_hero_class('00000003-0000-0000-0000-000000000003');
  SELECT public.perform_class_respec('guerreiro') INTO v_result;
  IF v_result->>'starter_class' <> 'guerreiro'
     OR v_result->>'was_free' <> 'true'
     OR (SELECT gold FROM public.user_balance WHERE user_id=auth.uid()) <> 200
     OR (SELECT current_class_id FROM public.profiles WHERE user_id=auth.uid()) IS NOT NULL
     OR (SELECT starter_class FROM public.profiles WHERE user_id=auth.uid()) <> 'guerreiro'
     OR (SELECT rank FROM public.player_skill_nodes
         WHERE user_id=auth.uid() AND node_id='m_dardo') <> 1
  THEN RAISE EXCEPTION 'first respec was not atomic or history was lost'; END IF;
  SELECT public.perform_class_respec('mago') INTO v_result;
  IF v_result->>'was_free' <> 'false'
     OR (SELECT gold FROM public.user_balance WHERE user_id=auth.uid()) <> 80
     OR (SELECT count(*) FROM public.gold_history WHERE user_id=auth.uid()) <> 1
  THEN RAISE EXCEPTION 'paid respec accounting wrong'; END IF;
  BEGIN
    PERFORM public.perform_class_respec('guerreiro');
  EXCEPTION WHEN OTHERS THEN v_failed := SQLERRM LIKE '%INSUFFICIENT_GOLD%';
  END;
  IF NOT COALESCE(v_failed,false)
     OR (SELECT gold FROM public.user_balance WHERE user_id=auth.uid()) <> 80
  THEN RAISE EXCEPTION 'insufficient gold was not rejected'; END IF;
END $$;
RESET ROLE;

CREATE FUNCTION public.fail_profile_respec_test() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'INJECTED_PROFILE_FAILURE'; END $$;
CREATE TRIGGER fail_profile_respec_test AFTER UPDATE OF starter_class ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.fail_profile_respec_test();
UPDATE public.user_balance SET gold=200
WHERE user_id='00000000-0000-0000-0000-000000000002';
SET ROLE authenticated;
DO $$
DECLARE v_failed boolean;
BEGIN
  BEGIN
    PERFORM public.perform_class_respec('guerreiro');
  EXCEPTION WHEN OTHERS THEN v_failed := SQLERRM LIKE '%INJECTED_PROFILE_FAILURE%';
  END;
  IF NOT COALESCE(v_failed,false)
     OR (SELECT gold FROM public.user_balance WHERE user_id=auth.uid()) <> 200
     OR (SELECT starter_class FROM public.profiles WHERE user_id=auth.uid()) <> 'mago'
     OR (SELECT count(*) FROM public.gold_history WHERE user_id=auth.uid()) <> 1
  THEN RAISE EXCEPTION 'respec charge did not roll back'; END IF;
END $$;
RESET ROLE;
DROP TRIGGER fail_profile_respec_test ON public.profiles;
DROP FUNCTION public.fail_profile_respec_test();
SELECT 'HERO_CLASS_AUTHORITY_PASS' AS result;
