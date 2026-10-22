\set ON_ERROR_STOP on
DO $test$
DECLARE v_id uuid; v_n integer:=0; v_end timestamptz;
BEGIN
  LOOP
    v_n:=v_n+1;
    v_id:=md5('chest-test:equipment:'||v_n)::uuid;
    EXIT WHEN app_private.adventure_chest_roll(v_id,'rarity')<7200
      AND app_private.adventure_chest_roll(v_id,'equipment')<500;
    IF v_n>100000 THEN RAISE EXCEPTION 'no equipment seed'; END IF;
  END LOOP;
  v_end:=clock_timestamp()-interval '1 minute';
  INSERT INTO app_private.adventure_battles
    (id,user_id,stage,kind,status,hero_class,hero_level,biome,started_at,ends_at)
  VALUES(v_id,'11111111-1111-1111-1111-111111111111',7,'normal',
    'fighting','guerreiro',5,'forest',v_end-interval '15 seconds',v_end);
  UPDATE app_private.adventure_battles SET status='won' WHERE id=v_id;
  IF (SELECT equipment_item_id FROM app_private.adventure_chests WHERE battle_id=v_id)
      IS DISTINCT FROM 'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid
    OR (SELECT count(*) FROM app_private.adventure_chests
      WHERE user_id='11111111-1111-1111-1111-111111111111' AND status<>'claimed')<>4
  THEN RAISE EXCEPTION 'class/level-safe equipment or freed slot failed'; END IF;
  IF (SELECT quantity FROM public.user_inventory WHERE user_id='11111111-1111-1111-1111-111111111111'
      AND item_id='cccccccc-cccc-cccc-cccc-cccccccccccc')<>1
    OR (SELECT count(*) FROM app_private.adventure_material_receipts
      WHERE source='chest_claim' AND user_id='11111111-1111-1111-1111-111111111111')<>1
  THEN RAISE EXCEPTION 'claim inventory/material payout mismatch'; END IF;
END $test$;

BEGIN;
UPDATE app_private.adventure_chest_rules SET gold_amount=999999,
  scrap_amount=999 WHERE rarity='comum';
DO $test$ BEGIN
  IF EXISTS (SELECT 1 FROM app_private.adventure_chests
      WHERE rarity='comum' AND (gold_amount<>40 OR scrap_amount<>2))
  THEN RAISE EXCEPTION 'rule edit rerolled existing chest'; END IF;
  BEGIN
    UPDATE app_private.adventure_chests SET gold_amount=999
      WHERE user_id='11111111-1111-1111-1111-111111111111' AND status='queued';
    RAISE EXCEPTION 'frozen content mutation accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'CHEST_FROZEN' THEN RAISE; END IF;
  END;
END $test$;
ROLLBACK;

SET ROLE authenticated;
SET request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
DO $test$
DECLARE v_state jsonb; v_chest uuid; v_result jsonb;
BEGIN
  v_state:=public.get_adventure_chests();
  IF jsonb_array_length(v_state->'recent_claims')<>1 OR (v_state->>'occupied')::integer<>4 THEN
    RAISE EXCEPTION 'claim not visible in own state'; END IF;
  v_chest:=(v_state->'chests'->0->>'id')::uuid;
  v_result:=public.start_adventure_chest(v_chest);
  IF v_result->>'replayed'<>'false' THEN RAISE EXCEPTION 'opening did not resume after claim'; END IF;
END $test$;
RESET ROLE;
