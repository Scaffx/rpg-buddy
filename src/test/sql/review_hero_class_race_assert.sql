\set ON_ERROR_STOP on
DO $$
DECLARE p public.profiles%ROWTYPE; h app_private.hero_class_identity%ROWTYPE;
BEGIN
  SELECT * INTO STRICT p FROM public.profiles
    WHERE user_id='00000000-0000-0000-0000-000000000003';
  SELECT * INTO STRICT h FROM app_private.hero_class_identity
    WHERE user_id=p.user_id;
  IF p.starter_class NOT IN ('mago','gatuno')
    OR (p.starter_class,p.starter_item,p.current_class_id)
       IS DISTINCT FROM (h.starter_class,h.starter_item,h.current_class_id)
    OR p.current_class_id IS NOT NULL
    OR (SELECT gold FROM public.user_balance WHERE user_id=p.user_id)<>80
    OR (SELECT count(*) FROM public.activity_log
        WHERE user_id=p.user_id AND action='class_respec')<>2
    OR (SELECT count(*) FROM public.gold_history
        WHERE user_id=p.user_id AND type='respec_classe' AND amount=-120)<>1 THEN
    RAISE EXCEPTION 'concurrent respec used free credit twice or split mirror/ledger';
  END IF;
END $$;
SELECT 'REVIEW_HERO_CLASS_RACE_PASS' AS result;
