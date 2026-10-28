\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id) VALUES('a0000000-0000-0000-0000-00000000a481');
INSERT INTO public.profiles(user_id,level,starter_class)
  VALUES('a0000000-0000-0000-0000-00000000a481',100,'guerreiro');
SET ROLE authenticated;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000a481';
DO $$ BEGIN PERFORM public.sync_auto_adventure(); END $$;
RESET ROLE;
DO $long$
DECLARE b app_private.adventure_battles%ROWTYPE; enemies jsonb; e jsonb; s integer;
BEGIN
  SELECT * INTO STRICT b FROM app_private.adventure_battles
    WHERE user_id='a0000000-0000-0000-0000-00000000a481';
  SELECT jsonb_agg(x||jsonb_build_object('max_hp',100000)
    ORDER BY (x->>'slot')::integer) INTO enemies
    FROM jsonb_array_elements(b.rules_snapshot->'enemies') x;
  e:=app_private.adventure_simulate_horde(
    b.started_at,b.hero_attack,b.hero_defense,b.hero_max_hp,b.hero_max_mp,
    enemies,b.skills,coalesce(b.rules_snapshot->>'default_effect','physical'),0,
    b.rules_snapshot->'pet'->'sustain');
  IF jsonb_array_length(e)<=192 OR jsonb_array_length(e)>1200
    OR (e->-1->>'at')::timestamptz > b.started_at+interval '15 minutes'
    OR (e->-1->>'hero_hp')::integer<=0
    OR (e->-1->>'enemy_hp')::integer<=0
  THEN RAISE EXCEPTION 'DRAW_FIXTURE_NOT_BOUNDED'; END IF;
  RAISE NOTICE 'HORDE_CLOCK_DRAW events=% last_seconds=%',
    jsonb_array_length(e),extract(epoch FROM (e->-1->>'at')::timestamptz-b.started_at);
  UPDATE app_private.adventure_battles SET
    enemy_max_hp=300000,rules_snapshot=rules_snapshot||jsonb_build_object('enemies',enemies),
    events=e,ends_at=(e->-1->>'at')::timestamptz
    WHERE id=b.id;
  SELECT greatest(1,ceil(extract(epoch FROM ends_at-clock_timestamp()))::integer)
    INTO s FROM app_private.adventure_battles WHERE id=b.id;
  UPDATE app_private.adventure_battles SET
    started_at=started_at-make_interval(secs=>s),
    ends_at=ends_at-make_interval(secs=>s),
    events=(SELECT jsonb_agg(jsonb_set(x,'{at}',
      to_jsonb((x->>'at')::timestamptz-make_interval(secs=>s))) ORDER BY ord)
      FROM jsonb_array_elements(events) WITH ORDINALITY a(x,ord))
    WHERE id=b.id;
END $long$;
SET ROLE authenticated;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000a481';
DO $$ BEGIN PERFORM public.sync_auto_adventure(); END $$;
RESET ROLE;
DO $assert$
BEGIN
  IF NOT (SELECT status='draw' AND gold_awarded=0
    FROM app_private.adventure_battles
    WHERE user_id='a0000000-0000-0000-0000-00000000a481')
    OR NOT (SELECT last_result->>'end_reason'='event_limit'
      AND stage=1 AND adventure_mode='progressing'
      FROM public.adventure_state
      WHERE user_id='a0000000-0000-0000-0000-00000000a481')
    OR EXISTS (SELECT 1 FROM public.gold_history
      WHERE user_id='a0000000-0000-0000-0000-00000000a481' AND type='adventure')
  THEN RAISE EXCEPTION 'HORDE_DRAW_ASSERT'; END IF;
END $assert$;
ROLLBACK;
