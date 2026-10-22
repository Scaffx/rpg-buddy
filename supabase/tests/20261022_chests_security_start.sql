\set ON_ERROR_STOP on
DO $acl$ BEGIN
  IF has_table_privilege('authenticated','app_private.adventure_chests','INSERT,UPDATE,DELETE,SELECT')
    OR has_table_privilege('authenticated','app_private.adventure_chest_win_receipts','INSERT,UPDATE,DELETE,SELECT')
    OR has_table_privilege('authenticated','app_private.adventure_battles','INSERT,UPDATE,DELETE')
    OR has_function_privilege('authenticated',
      'app_private.credit_adventure_material(uuid,text,integer,text,uuid)','EXECUTE')
    OR has_function_privilege('anon','public.claim_adventure_chest(uuid)','EXECUTE')
  THEN RAISE EXCEPTION 'client ACL open'; END IF;
END $acl$;

SET ROLE authenticated;
SET request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
DO $test$
DECLARE v_state jsonb; v_first uuid; v_second uuid; v_result jsonb;
BEGIN
  v_state:=public.get_adventure_chests();
  IF (v_state->>'occupied')::integer<>4 OR jsonb_array_length(v_state->'chests')<>4
    OR (v_state->'overflow'->>'count')::integer<>1
    OR (v_state->'overflow'->>'gold')::integer<=0
    OR (v_state->'chests'->0->'minimum'->>'gold')::integer<=0
  THEN RAISE EXCEPTION 'player state mismatch: %',v_state; END IF;
  v_first:=(v_state->'chests'->0->>'id')::uuid;
  v_second:=(v_state->'chests'->1->>'id')::uuid;
  v_result:=public.start_adventure_chest(v_first);
  IF v_result->>'replayed'<>'false' OR v_result->'chest'->>'ready_at' IS NULL THEN
    RAISE EXCEPTION 'start failed: %',v_result; END IF;
  v_result:=public.start_adventure_chest(v_first);
  IF v_result->>'replayed'<>'true' THEN RAISE EXCEPTION 'start replay failed'; END IF;
  BEGIN
    PERFORM public.start_adventure_chest(v_second);
    RAISE EXCEPTION 'second opening accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'CHEST_OPENING_ACTIVE' THEN RAISE; END IF;
  END;
  PERFORM set_config('app.client_time','2099-01-01T00:00:00Z',true);
  BEGIN
    PERFORM public.claim_adventure_chest(v_first);
    RAISE EXCEPTION 'client clock accelerated claim';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'CHEST_NOT_READY' THEN RAISE; END IF;
  END;
  BEGIN
    EXECUTE 'UPDATE app_private.adventure_battles SET status=''won'' WHERE false';
    RAISE EXCEPTION 'client battle DML accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $test$;
SET request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
DO $test$
DECLARE v_state jsonb;
BEGIN
  v_state:=public.get_adventure_chests();
  IF (v_state->>'occupied')::integer<>1
    OR (v_state->'overflow'->>'count')::integer<>0 THEN
    RAISE EXCEPTION 'cross-user state leak'; END IF;
  PERFORM set_config('test.foreign_chest',v_state->'chests'->0->>'id',false);
END $test$;
SET request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
DO $test$ BEGIN
  BEGIN
    PERFORM public.claim_adventure_chest(current_setting('test.foreign_chest')::uuid);
    RAISE EXCEPTION 'foreign claim accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'CHEST_NOT_FOUND' THEN RAISE; END IF;
  END;
END $test$;
RESET ROLE;

-- Privileged fixture-only clock instrumentation. The production RPC never
-- receives a clock argument and the frozen guard rejects these updates.
ALTER TABLE app_private.adventure_chests DISABLE TRIGGER adventure_chest_frozen;
WITH t AS (SELECT clock_timestamp() AS at)
UPDATE app_private.adventure_chests
SET started_at=t.at-interval '2 hours',ready_at=t.at-interval '1 hour'
FROM t WHERE user_id='11111111-1111-1111-1111-111111111111' AND status='opening';
ALTER TABLE app_private.adventure_chests ENABLE TRIGGER adventure_chest_frozen;
DO $test$ BEGIN
  IF (SELECT count(*) FROM app_private.adventure_chests
    WHERE user_id='11111111-1111-1111-1111-111111111111'
      AND status='opening' AND ready_at<clock_timestamp())<>1 THEN
    RAISE EXCEPTION 'clock setup failed'; END IF;
END $test$;
SET ROLE authenticated;
SET request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
DO $test$
DECLARE v_other uuid;
BEGIN
  v_other:=(public.get_adventure_chests()->'chests'->1->>'id')::uuid;
  BEGIN
    PERFORM public.start_adventure_chest(v_other);
    RAISE EXCEPTION 'ready but unclaimed chest freed the opening';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'CHEST_OPENING_ACTIVE' THEN RAISE; END IF;
  END;
END $test$;
RESET ROLE;
