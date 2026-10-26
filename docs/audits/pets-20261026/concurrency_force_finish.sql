DO $audit$
DECLARE v_id uuid; v_events jsonb;
BEGIN
  SELECT id,events INTO v_id,v_events FROM app_private.adventure_battles
  WHERE user_id='c0000000-0000-0000-0000-000000000001' AND status='fighting'
  ORDER BY created_at LIMIT 1;
  IF v_id IS NULL OR jsonb_array_length(v_events)=0 THEN
    RAISE EXCEPTION 'CONCURRENCY_FIXTURE_BATTLE_MISSING';
  END IF;
  v_events:=jsonb_set(v_events,
    ARRAY[(jsonb_array_length(v_events)-1)::text,'enemy_hp'],'0'::jsonb);
  UPDATE app_private.adventure_battles SET
    ends_at=clock_timestamp()-interval '1 second',events=v_events
  WHERE id=v_id;
END $audit$;
