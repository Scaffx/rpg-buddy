-- Independent reduced probe after the class migration. All changes roll back.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF app_private.hero_class_key('00000000-0000-0000-0000-000000000001') <> 'mago'
    OR NOT app_private.has_hero_class('00000000-0000-0000-0000-000000000001')
    OR (SELECT current_class_id FROM public.profiles
      WHERE user_id='00000000-0000-0000-0000-000000000001') IS NOT NULL THEN
    RAISE EXCEPTION 'historical Lv1 mage identity failed';
  END IF;
  IF has_function_privilege('authenticated','app_private.hero_class_key(uuid)','EXECUTE')
    OR has_function_privilege('authenticated','app_private.has_hero_class(uuid)','EXECUTE')
    OR has_table_privilege('authenticated','app_private.hero_class_identity','UPDATE')
    OR has_table_privilege('authenticated','public.player_skill_nodes','INSERT')
    OR has_table_privilege('authenticated','public.player_skill_nodes','UPDATE')
    OR has_table_privilege('authenticated','public.player_skill_nodes','DELETE')
    OR has_table_privilege('authenticated','public.player_skill_nodes','TRUNCATE')
    OR has_table_privilege('anon','public.player_skill_nodes','TRUNCATE')
    OR has_function_privilege('anon','public.choose_starter_class(text)','EXECUTE')
    OR has_function_privilege('anon','public.allocate_skill_node(text)','EXECUTE') THEN
    RAISE EXCEPTION 'client authority ACL leak';
  END IF;
END $$;

SET ROLE authenticated;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
SET request.jwt.claim.role='service_role';
DO $$
DECLARE denied boolean; v_result jsonb;
BEGIN
  denied := false;
  BEGIN
    UPDATE public.profiles SET starter_class='mago'
    WHERE user_id=auth.uid();
  EXCEPTION WHEN OTHERS THEN
    denied := SQLERRM LIKE '%HERO_CLASS_WRITE_PROTECTED%';
  END;
  IF NOT denied THEN RAISE EXCEPTION 'profile class forged'; END IF;

  UPDATE public.profiles SET display_name='Nome permitido',avatar_url='avatar'
  WHERE user_id=auth.uid();
  IF (SELECT display_name FROM public.profiles WHERE user_id=auth.uid()) <>
     'Nome permitido' THEN RAISE EXCEPTION 'ordinary profile update broken'; END IF;

  denied := false;
  BEGIN
    PERFORM public.allocate_skill_node('m_dardo');
  EXCEPTION WHEN OTHERS THEN
    denied := SQLERRM LIKE '%SKILL_TREE_CLASS_LOCKED%';
  END;
  IF NOT denied THEN RAISE EXCEPTION 'unselected class allocated'; END IF;

  v_result := public.choose_starter_class('mago');
  IF v_result->>'starter_class' <> 'mago'
    OR v_result->>'starter_item' <> 'Grimorio Basico' THEN
    RAISE EXCEPTION 'onboarding choice failed';
  END IF;
  PERFORM public.allocate_skill_node('m_dardo');
  IF (SELECT rank FROM public.player_skill_nodes
      WHERE user_id=auth.uid() AND node_id='m_dardo') <> 1 THEN
    RAISE EXCEPTION 'Lv1 starter node not allocated';
  END IF;

  denied := false;
  BEGIN
    INSERT INTO public.player_skill_nodes(user_id,node_id,rank)
    VALUES(auth.uid(),'g_golpe',99);
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'direct skill INSERT allowed'; END IF;
  denied := false;
  BEGIN
    UPDATE public.player_skill_nodes SET rank=99
      WHERE user_id=auth.uid() AND node_id='m_dardo';
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'direct skill UPDATE allowed'; END IF;
  denied := false;
  BEGIN
    DELETE FROM public.player_skill_nodes
      WHERE user_id=auth.uid() AND node_id='m_dardo';
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'direct skill DELETE allowed'; END IF;
  IF (SELECT rank FROM public.player_skill_nodes
      WHERE user_id=auth.uid() AND node_id='m_dardo') <> 1 THEN
    RAISE EXCEPTION 'direct skill UPDATE or DELETE allowed';
  END IF;
END $$;

SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000004';
DO $$
DECLARE denied boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.profiles(user_id,starter_class)
    VALUES(auth.uid(),'mago');
  EXCEPTION WHEN OTHERS THEN
    denied := SQLERRM LIKE '%HERO_CLASS_WRITE_PROTECTED%';
  END;
  IF NOT denied THEN RAISE EXCEPTION 'forged signup class accepted'; END IF;
  INSERT INTO public.profiles(user_id,display_name)
  VALUES(auth.uid(),'Signup vazio');
  IF (SELECT starter_class FROM public.profiles WHERE user_id=auth.uid())
     IS NOT NULL THEN RAISE EXCEPTION 'blank signup changed class'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'REVIEW_HERO_CLASS_SECURITY_PASS' AS result;
