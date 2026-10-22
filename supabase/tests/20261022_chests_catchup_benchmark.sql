\set ON_ERROR_STOP on
\timing on
-- Trigger-only bound for 33,000 server-owned wins over 24 hours. This is not
-- the full sync engine benchmark; it isolates chest cadence/receipt cost.
INSERT INTO auth.users(id) VALUES('33333333-3333-3333-3333-333333333333');
INSERT INTO public.profiles(user_id,level,starter_class,total_xp)
VALUES('33333333-3333-3333-3333-333333333333',5,'guerreiro',0);
INSERT INTO public.user_balance(user_id,gold)
VALUES('33333333-3333-3333-3333-333333333333',1000);
INSERT INTO app_private.adventure_battles
  (id,user_id,stage,kind,status,hero_class,hero_level,biome,started_at,ends_at)
SELECT md5('chest-benchmark:'||g)::uuid,
  '33333333-3333-3333-3333-333333333333'::uuid,
  (g%9)+1,'normal','fighting','guerreiro',5,'forest',
  t.anchor-interval '24 hours'+(g*interval '2.6 seconds'),
  t.anchor-interval '24 hours'+(g*interval '2.6 seconds')+interval '15 seconds'
FROM generate_series(1,33000) g CROSS JOIN (SELECT clock_timestamp() AS anchor) t;
UPDATE app_private.adventure_battles SET status='won'
WHERE user_id='33333333-3333-3333-3333-333333333333';
DO $test$
DECLARE v_receipts integer; v_overflow integer; v_gold integer;
BEGIN
  SELECT count(*),count(*) FILTER (WHERE disposition='overflow')
    INTO v_receipts,v_overflow
    FROM app_private.adventure_chest_win_receipts
    WHERE user_id='33333333-3333-3333-3333-333333333333';
  SELECT coalesce(sum(overflow_gold),0) INTO v_gold
    FROM app_private.adventure_chest_win_receipts
    WHERE user_id='33333333-3333-3333-3333-333333333333';
  IF v_receipts NOT BETWEEN 40 AND 48 OR v_overflow<>v_receipts-4
    OR (SELECT count(*) FROM app_private.adventure_chests
      WHERE user_id='33333333-3333-3333-3333-333333333333')<>4
    OR v_gold<=0
    OR (SELECT total_xp FROM public.profiles
      WHERE user_id='33333333-3333-3333-3333-333333333333')<>0 THEN
    RAISE EXCEPTION 'catchup bound failed: receipts %, overflow %, gold %',
      v_receipts,v_overflow,v_gold;
  END IF;
  RAISE NOTICE '33k wins: % chest/overflow receipts, % overflow, % gold; no XP',
    v_receipts,v_overflow,v_gold;
END $test$;
