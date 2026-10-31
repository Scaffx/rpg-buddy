\set ON_ERROR_STOP on
-- Structural retention probe: 129 synthetic settled timelines force the
-- existing 127-row pruning path. The original winning potion receipt is real.
INSERT INTO app_private.adventure_battles
SELECT (jsonb_populate_record(NULL::app_private.adventure_battles,
  to_jsonb(b)||jsonb_build_object(
    'id',gen_random_uuid(),'attempt',i,
    'started_at',b.started_at-i*interval '1 minute',
    'ends_at',b.ends_at-i*interval '1 minute'))).*
FROM app_private.adventure_battles b CROSS JOIN generate_series(1,129) i
WHERE b.user_id='a0000000-0000-0000-0000-00000000b908' AND b.status='won';
INSERT INTO app_private.adventure_auto_potion_receipts
  (battle_id,potion_type,user_id,item_id,item_name,nominal_amount,recovered,event_at)
SELECT oldest.id,r.potion_type,r.user_id,r.item_id,r.item_name,r.nominal_amount,
  r.recovered,r.event_at
FROM (SELECT id FROM app_private.adventure_battles
      WHERE user_id='a0000000-0000-0000-0000-00000000b908'
      ORDER BY started_at ASC LIMIT 1) oldest
CROSS JOIN app_private.adventure_auto_potion_receipts r
WHERE r.user_id='a0000000-0000-0000-0000-00000000b908';
CREATE TEMP TABLE auto_potion_oldest AS
SELECT b.id FROM app_private.adventure_battles b
WHERE b.user_id='a0000000-0000-0000-0000-00000000b908'
ORDER BY b.started_at ASC LIMIT 1;
SET ROLE authenticated;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000b908';
SELECT public.sync_auto_adventure() AS pruned \gset potion_
SELECT public.sync_auto_adventure() AS retry \gset potion_
RESET ROLE;
DO $test$
BEGIN
  IF EXISTS (SELECT 1 FROM app_private.adventure_battles b
      JOIN auto_potion_oldest o ON o.id=b.id)
    OR (SELECT count(*) FROM app_private.adventure_battles
      WHERE user_id='a0000000-0000-0000-0000-00000000b908')>127
    OR (SELECT count(*) FROM app_private.adventure_auto_potion_receipts
      WHERE user_id='a0000000-0000-0000-0000-00000000b908')<>2
    OR NOT EXISTS (SELECT 1 FROM app_private.adventure_auto_potion_receipts r
      JOIN auto_potion_oldest o ON o.id=r.battle_id)
    OR EXISTS (SELECT 1 FROM public.user_inventory WHERE
      user_id='a0000000-0000-0000-0000-00000000b908'
      AND item_id='ea63052e-8530-4c4e-98ed-9d62a9cbf781') THEN
    RAISE EXCEPTION 'AUTO_POTION_PRUNING_OR_RETRY'; END IF;
  RAISE NOTICE 'AUTO_POTIONS_129_PRUNING_RECEIPT_RETRY_PASS';
END $test$;
