\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id) VALUES ('77777777-7777-7777-7777-777777777777');
INSERT INTO public.profiles(user_id,level,starter_class) VALUES
  ('77777777-7777-7777-7777-777777777777',50,'guerreiro');
SET ROLE authenticated;
SET request.jwt.claim.sub='77777777-7777-7777-7777-777777777777';
SELECT public.sync_auto_adventure() AS initial_snapshot \gset
RESET ROLE;
UPDATE app_private.adventure_battles b SET
  started_at=b.started_at-interval '2 hours',
  ends_at=b.ends_at-interval '2 hours',
  events=(SELECT jsonb_agg(jsonb_set(e,'{at}',
    to_jsonb((e->>'at')::timestamptz-interval '2 hours')) ORDER BY ord)
    FROM jsonb_array_elements(b.events) WITH ORDINALITY x(e,ord))
WHERE b.user_id='77777777-7777-7777-7777-777777777777' AND b.status='fighting';
SET ROLE authenticated;
DO $$
DECLARE v_snapshot jsonb; v_calls integer:=0; v_battles integer:=0; v_defeats integer:=0;
  v_start timestamptz:=clock_timestamp();
BEGIN
  LOOP
    v_snapshot:=public.sync_auto_adventure();
    v_calls:=v_calls+1;
    v_battles:=v_battles+(v_snapshot->'catchup'->>'battles')::integer;
    v_defeats:=v_defeats+(v_snapshot->'catchup'->>'defeats')::integer;
    EXIT WHEN (v_snapshot->'catchup'->>'pending')::boolean=false;
    IF v_calls>=40 THEN RAISE EXCEPTION 'offline catchup did not converge'; END IF;
  END LOOP;
  RAISE NOTICE 'offline calls=% battles=% defeats=% seconds=%',v_calls,v_battles,
    v_defeats,round(extract(epoch FROM clock_timestamp()-v_start)::numeric,3);
  IF v_battles<400 OR v_calls<15 THEN RAISE EXCEPTION 'offline batch depth unexpectedly short'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF (SELECT total_xp<>0 OR level<>50 FROM public.profiles
    WHERE user_id='77777777-7777-7777-7777-777777777777') THEN
    RAISE EXCEPTION 'offline gained progression'; END IF;
  IF (SELECT gold_today>120 OR loot_today>2 OR stage<1
    FROM public.adventure_state WHERE user_id='77777777-7777-7777-7777-777777777777') THEN
    RAISE EXCEPTION 'offline daily cap or stage'; END IF;
  IF (SELECT count(*)>128 FROM app_private.adventure_battles
    WHERE user_id='77777777-7777-7777-7777-777777777777') THEN
    RAISE EXCEPTION 'offline timeline retention'; END IF;
END $$;
SELECT stage,adventure_mode,gold_today,loot_today,
  (SELECT count(*) FROM app_private.adventure_battles
    WHERE user_id='77777777-7777-7777-7777-777777777777') AS timelines,
  (SELECT count(*) FROM public.adventure_encounters
    WHERE user_id='77777777-7777-7777-7777-777777777777') AS first_clears
FROM public.adventure_state WHERE user_id='77777777-7777-7777-7777-777777777777';
ROLLBACK;
