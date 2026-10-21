-- Independent same-transaction economy and class-path probe after migration.
\set ON_ERROR_STOP on
BEGIN;
SET ROLE authenticated;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
DO $$ BEGIN
  PERFORM public.choose_starter_class('mago');
  PERFORM public.allocate_skill_node('m_dardo');
END $$;
RESET ROLE;

UPDATE public.profiles SET level=5
WHERE user_id='00000000-0000-0000-0000-000000000002';
SET ROLE authenticated;
DO $$
DECLARE denied boolean := false;
BEGIN
  PERFORM public.advance_hero_class('00000002-0000-0000-0000-000000000002');
  IF (SELECT current_class_id FROM public.profiles WHERE user_id=auth.uid())
     <> '00000002-0000-0000-0000-000000000002'::uuid THEN
    RAISE EXCEPTION 'legitimate base promotion missing';
  END IF;
  BEGIN
    PERFORM public.advance_hero_class('00000003-0000-0000-0000-000000000003');
  EXCEPTION WHEN OTHERS THEN denied := SQLERRM LIKE '%CLASS_LEVEL_OR_BRANCH_LOCKED%';
  END;
  IF NOT denied THEN RAISE EXCEPTION 'tier 3 level gate bypassed'; END IF;
END $$;
RESET ROLE;

UPDATE public.profiles SET level=15
WHERE user_id='00000000-0000-0000-0000-000000000002';
SET ROLE authenticated;
DO $$
DECLARE response jsonb; denied boolean := false;
BEGIN
  PERFORM public.advance_hero_class('00000003-0000-0000-0000-000000000003');
  response := public.perform_class_respec('guerreiro');
  IF response->>'was_free'<>'true'
    OR (SELECT gold FROM public.user_balance WHERE user_id=auth.uid())<>200
    OR (SELECT starter_class FROM public.profiles WHERE user_id=auth.uid())<>'guerreiro'
    OR (SELECT current_class_id FROM public.profiles WHERE user_id=auth.uid()) IS NOT NULL
    OR (SELECT rank FROM public.player_skill_nodes
       WHERE user_id=auth.uid() AND node_id='m_dardo')<>1 THEN
    RAISE EXCEPTION 'free class respec or mirror wrong';
  END IF;
  response := public.perform_class_respec('mago');
  IF response->>'was_free'<>'false'
    OR (SELECT gold FROM public.user_balance WHERE user_id=auth.uid())<>80
    OR (SELECT count(*) FROM public.gold_history
       WHERE user_id=auth.uid() AND type='respec_classe' AND amount=-120)<>1 THEN
    RAISE EXCEPTION 'paid class respec not exactly 120';
  END IF;
  BEGIN
    PERFORM public.perform_class_respec('guerreiro');
  EXCEPTION WHEN OTHERS THEN denied := SQLERRM LIKE '%INSUFFICIENT_GOLD%';
  END;
  IF NOT denied
    OR (SELECT gold FROM public.user_balance WHERE user_id=auth.uid())<>80
    OR (SELECT starter_class FROM public.profiles WHERE user_id=auth.uid())<>'mago'
    OR (SELECT count(*) FROM public.gold_history WHERE user_id=auth.uid())<>1 THEN
    RAISE EXCEPTION 'insufficient balance changed economy or class';
  END IF;
END $$;
RESET ROLE;

CREATE FUNCTION public.review_hero_class_fail_after_charge() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'REVIEW_INJECTED_FAILURE'; END $$;
CREATE TRIGGER review_hero_class_fail_after_charge
AFTER UPDATE OF starter_class ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.review_hero_class_fail_after_charge();
UPDATE public.user_balance SET gold=200
WHERE user_id='00000000-0000-0000-0000-000000000002';
SET ROLE authenticated;
DO $$
DECLARE denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.perform_class_respec('guerreiro');
  EXCEPTION WHEN OTHERS THEN denied := SQLERRM LIKE '%REVIEW_INJECTED_FAILURE%';
  END;
  IF NOT denied
    OR (SELECT gold FROM public.user_balance WHERE user_id=auth.uid())<>200
    OR (SELECT starter_class FROM public.profiles WHERE user_id=auth.uid())<>'mago'
    OR (SELECT count(*) FROM public.gold_history WHERE user_id=auth.uid())<>1 THEN
    RAISE EXCEPTION 'charge and class did not roll back together';
  END IF;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'REVIEW_HERO_CLASS_RESPEC_PASS' AS result;
