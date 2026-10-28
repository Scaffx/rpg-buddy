\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id) VALUES('a0000000-0000-0000-0000-00000000a511');
INSERT INTO public.profiles(user_id,level,starter_class)
VALUES('a0000000-0000-0000-0000-00000000a511',100,'guerreiro');
INSERT INTO public.adventure_state(user_id,last_tick_at,stage)
VALUES('a0000000-0000-0000-0000-00000000a511',clock_timestamp(),10);
SET ROLE authenticated;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000a511';
DO $$ BEGIN PERFORM public.sync_auto_adventure(); END $$;
RESET ROLE;
DO $fixture$
DECLARE b app_private.adventure_battles%ROWTYPE; e jsonb; enemy jsonb;
BEGIN
  SELECT * INTO STRICT b FROM app_private.adventure_battles
    WHERE user_id='a0000000-0000-0000-0000-00000000a511';
  enemy:=jsonb_set(jsonb_set(b.rules_snapshot->'enemies'->0,
    '{power}','1000'::jsonb),'{max_hp}','150'::jsonb);
  e:=app_private.adventure_simulate_horde(clock_timestamp()-interval '420 seconds',
    1,100000,100000,0,jsonb_build_array(enemy),'[]'::jsonb,'physical',0,NULL);
  IF jsonb_array_length(e)<>295 OR (e->-1->>'enemy_hp')::integer<>0
    OR (e->-1->>'hero_hp')::integer<=0
  THEN RAISE EXCEPTION 'DEFENSIVE_SETTLEMENT_FIXTURE_INVALID'; END IF;
  UPDATE app_private.adventure_battles SET
    started_at=(e->0->>'at')::timestamptz-interval '0.8 seconds',
    ends_at=(e->-1->>'at')::timestamptz,
    hero_attack=1,hero_defense=100000,hero_max_hp=100000,hero_max_mp=0,
    enemy_power=1000,enemy_max_hp=150,skills='[]'::jsonb,events=e,
    rules_snapshot=rules_snapshot||jsonb_build_object('enemies',jsonb_build_array(enemy))
  WHERE id=b.id;
END $fixture$;
SET ROLE authenticated;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000a511';
DO $$ BEGIN PERFORM public.sync_auto_adventure(); PERFORM public.sync_auto_adventure(); END $$;
RESET ROLE;
DO $assert$
BEGIN
  IF NOT (SELECT status='won' AND gold_awarded BETWEEN 1 AND 48
    FROM app_private.adventure_battles
    WHERE user_id='a0000000-0000-0000-0000-00000000a511' AND stage=10)
    OR (SELECT count(*)<>1 FROM public.adventure_encounters
      WHERE user_id='a0000000-0000-0000-0000-00000000a511' AND stage=10 AND won)
    OR (SELECT count(*)<>1 FROM public.gold_history
      WHERE user_id='a0000000-0000-0000-0000-00000000a511' AND type='adventure')
    OR (SELECT total_xp<>0 OR level<>100 FROM public.profiles
      WHERE user_id='a0000000-0000-0000-0000-00000000a511')
  THEN RAISE EXCEPTION 'DEFENSIVE_SETTLEMENT_FAILED'; END IF;
  RAISE NOTICE 'DEFENSIVE_SETTLEMENT_PASS one win, one ledger, no XP';
END $assert$;
ROLLBACK;
