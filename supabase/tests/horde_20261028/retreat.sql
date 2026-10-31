\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id) VALUES('a0000000-0000-0000-0000-00000000a441');
INSERT INTO public.profiles(user_id,level,starter_class)
  VALUES('a0000000-0000-0000-0000-00000000a441',1,'guerreiro');
INSERT INTO public.adventure_state(user_id,last_tick_at,stage)
  VALUES('a0000000-0000-0000-0000-00000000a441',clock_timestamp(),99);
SET ROLE authenticated;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000a441';
DO $$ BEGIN PERFORM public.sync_auto_adventure(); END $$;
RESET ROLE;
DO $due$
DECLARE s integer;
BEGIN
  IF NOT (SELECT (events->-1->>'hero_hp')::integer=0
    AND (events->-1->>'enemy_hp')::integer>0
    FROM app_private.adventure_battles WHERE user_id='a0000000-0000-0000-0000-00000000a441')
  THEN RAISE EXCEPTION 'RETREAT_FIXTURE_DID_NOT_LOSE'; END IF;
  SELECT greatest(1,ceil(extract(epoch FROM ends_at-clock_timestamp()))::integer)
    INTO s FROM app_private.adventure_battles
    WHERE user_id='a0000000-0000-0000-0000-00000000a441';
  UPDATE app_private.adventure_battles SET
    started_at=started_at-make_interval(secs=>s),
    ends_at=ends_at-make_interval(secs=>s),
    events=(SELECT jsonb_agg(jsonb_set(x,'{at}',
      to_jsonb((x->>'at')::timestamptz-make_interval(secs=>s))) ORDER BY ord)
      FROM jsonb_array_elements(events) WITH ORDINALITY a(x,ord))
    WHERE user_id='a0000000-0000-0000-0000-00000000a441';
END $due$;
SET ROLE authenticated;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000a441';
DO $$ BEGIN PERFORM public.sync_auto_adventure(); END $$;
RESET ROLE;
DO $assert$
BEGIN
  IF NOT (SELECT stage=98 AND adventure_mode='holding'
      AND current_battle_id IS NULL FROM public.adventure_state
      WHERE user_id='a0000000-0000-0000-0000-00000000a441')
    OR NOT (SELECT status='defeated' AND gold_awarded=0
      FROM app_private.adventure_battles
      WHERE user_id='a0000000-0000-0000-0000-00000000a441')
    OR EXISTS (SELECT 1 FROM public.gold_history
      WHERE user_id='a0000000-0000-0000-0000-00000000a441' AND type='adventure')
    OR NOT (SELECT level=1 AND total_xp=0 FROM public.profiles
      WHERE user_id='a0000000-0000-0000-0000-00000000a441')
  THEN RAISE EXCEPTION 'HORDE_RETREAT_ASSERT'; END IF;
END $assert$;
ROLLBACK;
