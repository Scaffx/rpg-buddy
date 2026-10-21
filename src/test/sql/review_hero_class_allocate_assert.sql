\set ON_ERROR_STOP on
DO $$ BEGIN
  IF (SELECT rank FROM public.player_skill_nodes
      WHERE user_id='00000000-0000-0000-0000-000000000002' AND node_id='m_dardo')<>1
    OR (SELECT count(*) FROM public.player_skill_nodes
      WHERE user_id='00000000-0000-0000-0000-000000000002')<>1 THEN
    RAISE EXCEPTION 'concurrent allocation overspent level-1 budget';
  END IF;
END $$;
SELECT 'REVIEW_HERO_CLASS_ALLOCATE_RACE_PASS' AS result;
