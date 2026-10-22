\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.ok(p_ok boolean,p_label text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  IF p_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'GOLD_CONCURRENT_ASSERT: %',p_label; END IF;
END $$;
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.adventure_encounters
  WHERE user_id='11111111-1111-1111-1111-111111111111'
    AND stage=10 AND won AND gold BETWEEN 13 AND 48), 'one first-clear encounter');
SELECT pg_temp.ok((SELECT count(*)=1 FROM app_private.adventure_battles
  WHERE user_id='11111111-1111-1111-1111-111111111111'
    AND stage=10 AND status='won' AND gold_awarded BETWEEN 13 AND 48),
  'one paid battle');
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.gold_history
  WHERE user_id='11111111-1111-1111-1111-111111111111' AND type='adventure'),
  'one ledger credit');
SELECT pg_temp.ok((SELECT b.gold=3800+e.gold FROM public.user_balance b
  JOIN public.adventure_encounters e USING(user_id)
  WHERE b.user_id='11111111-1111-1111-1111-111111111111' AND e.stage=10),
  'balance credited once');
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.user_inventory i
  JOIN app_private.adventure_battles b ON b.item_id=i.item_id AND b.user_id=i.user_id
  WHERE i.user_id='11111111-1111-1111-1111-111111111111'
    AND b.stage=10 AND b.gold_awarded>12 AND i.quantity=1),
  'one boss item');
SELECT pg_temp.ok((SELECT level=10 AND total_xp=0 FROM public.profiles
  WHERE user_id='11111111-1111-1111-1111-111111111111'),
  'no XP or level mutation');
SELECT user_id,stage,gold FROM public.adventure_encounters
WHERE user_id='11111111-1111-1111-1111-111111111111' AND stage=10;
SELECT 'GOLD_RANGE_CONCURRENT_PASS' AS result;
ROLLBACK;
