\set ON_ERROR_STOP on
BEGIN;
DO $assert$
BEGIN
  IF NOT (SELECT engine_version='v3' AND status='fighting'
      AND events->0 ? 'actor' AND NOT (events->0 ? 'actor_slot')
    FROM app_private.adventure_battles
    WHERE user_id='a0000000-0000-0000-0000-00000000a471')
  THEN RAISE EXCEPTION 'LEGACY_ROW_CHANGED_BY_MIGRATION'; END IF;
END $assert$;
DO $due$
DECLARE s integer;
BEGIN
  SELECT greatest(1,ceil(extract(epoch FROM ends_at-clock_timestamp()))::integer)
    INTO s FROM app_private.adventure_battles
    WHERE user_id='a0000000-0000-0000-0000-00000000a471';
  UPDATE app_private.adventure_battles SET
    started_at=started_at-make_interval(secs=>s),
    ends_at=ends_at-make_interval(secs=>s),
    events=(SELECT jsonb_agg(jsonb_set(x,'{at}',
      to_jsonb((x->>'at')::timestamptz-make_interval(secs=>s))) ORDER BY ord)
      FROM jsonb_array_elements(events) WITH ORDINALITY a(x,ord))
    WHERE user_id='a0000000-0000-0000-0000-00000000a471';
END $due$;
SET ROLE authenticated;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000a471';
DO $$ BEGIN PERFORM public.sync_auto_adventure(); PERFORM public.sync_auto_adventure(); END $$;
RESET ROLE;
DO $assert$
BEGIN
  IF NOT (SELECT engine_version='v3' AND status='won'
    FROM app_private.adventure_battles
    WHERE user_id='a0000000-0000-0000-0000-00000000a471' AND stage=1)
    OR (SELECT count(*) FROM public.adventure_encounters
      WHERE user_id='a0000000-0000-0000-0000-00000000a471' AND stage=1)<>1
    OR (SELECT count(*) FROM public.gold_history
      WHERE user_id='a0000000-0000-0000-0000-00000000a471' AND type='adventure')<>1
  THEN RAISE EXCEPTION 'LEGACY_SETTLEMENT_NOT_ONCE'; END IF;
END $assert$;
UPDATE public.adventure_state SET last_tick_at=clock_timestamp()-interval '2 seconds'
  WHERE user_id='a0000000-0000-0000-0000-00000000a471';
SET ROLE authenticated;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000a471';
DO $$ BEGIN PERFORM public.sync_auto_adventure(); END $$;
RESET ROLE;
DO $assert$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_private.adventure_battles
    WHERE user_id='a0000000-0000-0000-0000-00000000a471'
      AND stage=2 AND engine_version='v4_horde')
  THEN RAISE EXCEPTION 'LEGACY_NEXT_NOT_HORDE'; END IF;
END $assert$;
ROLLBACK;
