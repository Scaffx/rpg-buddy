-- Run after the C4 assertions and the reachable-catalog calibration migration.
-- These users are new: no C4 equipment, simulated drops, or historical wins.
CREATE FUNCTION pg_temp.assert_true(ok boolean,msg text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'assertion failed: %',msg; END IF; END $$;
CREATE FUNCTION pg_temp.routine_level(p_xp integer) RETURNS integer
LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(max(n), 1)
  FROM generate_series(1, 60) n
  WHERE p_xp >= 150*n*(n-1) + (10*n*(n-1)*(2*n-1))/3
$$;
SELECT pg_temp.assert_true(pg_temp.routine_level(1176000)=50
  AND pg_temp.routine_level(252000)=28,
  'routine XP curve maps accumulated XP to levels 50 and 28');

INSERT INTO auth.users(id) VALUES
  ('44444444-4444-4444-4444-444444444444'),
  ('55555555-5555-5555-5555-555555555555');
INSERT INTO public.profiles(user_id,total_xp,level,starter_class) VALUES
  ('44444444-4444-4444-4444-444444444444',1176000,
   pg_temp.routine_level(1176000),'guerreiro'),
  ('55555555-5555-5555-5555-555555555555',0,1,'guerreiro');
INSERT INTO public.attributes(user_id,name,xp,level) VALUES
  ('44444444-4444-4444-4444-444444444444','forca',252000,
   pg_temp.routine_level(252000));
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.user_inventory
  WHERE user_id='44444444-4444-4444-4444-444444444444'),
  'reachability profile starts with no inventory');

INSERT INTO public.adventure_state(user_id,stage,last_tick_at) VALUES
  ('44444444-4444-4444-4444-444444444444',10,now()-interval '30 minutes'),
  ('55555555-5555-5555-5555-555555555555',30,now()-interval '30 minutes');

-- Fixture advances the server cursor to cover each catalog mapping. It does
-- not assert that a human has played 570 stages or earned this XP in a test.
DO $$
DECLARE
  n integer;
  v_result jsonb;
BEGIN
  FOR n IN 1..57 LOOP
    UPDATE public.adventure_state
       SET stage=n*10,attempt=0,last_tick_at=now()-interval '30 minutes'
     WHERE user_id='44444444-4444-4444-4444-444444444444';
    PERFORM set_config('request.jwt.claim.sub',
      '44444444-4444-4444-4444-444444444444',true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_result := public.sync_auto_adventure();
    EXECUTE 'SET LOCAL ROLE postgres';
    IF (v_result->>'stage')::integer <> n*10+1
       OR v_result->'last_result'->>'boss_id' <>
          ('00000000-0000-0000-0000-' || lpad(n::text,12,'0')) THEN
      RAISE EXCEPTION 'boss % failed to advance with catalog identity',n;
    END IF;
  END LOOP;
END $$;
SELECT pg_temp.assert_true((SELECT count(*)=57 AND bool_and(e.won)
  AND bool_and(e.hero_power=400)
  AND bool_and(e.enemy_power=least(400,30+floor(1.5*e.stage)::integer))
  AND bool_and(e.boss_id=b.id)
  FROM public.adventure_encounters e
  JOIN public.bosses b ON b.level=e.stage/10 AND b.is_world_event=false
  WHERE e.user_id='44444444-4444-4444-4444-444444444444'
    AND e.kind='boss' AND e.stage BETWEEN 10 AND 570),
  'all 57 regular bosses are won with routine-derived power 400 and exact IDs');
SELECT pg_temp.assert_true((SELECT count(*)=3 AND bool_and(e.boss_id =
  ('00000000-0000-0000-0000-' || lpad((e.stage/10)::text,12,'0'))::uuid)
  AND bool_and(e.enemy_power = 30 + floor(1.5*e.stage)::integer)
  FROM public.adventure_encounters e
  WHERE e.user_id='44444444-4444-4444-4444-444444444444'
    AND e.stage IN (10,20,30) AND e.won),
  'stages 10, 20 and 30 keep their specific catalog IDs and slope');
SELECT pg_temp.assert_true((SELECT count(*)=57 FROM public.boss_battles
  WHERE user_id='44444444-4444-4444-4444-444444444444' AND won),
  'one verified boss counter per regular boss');
SET ROLE authenticated;
SET request.jwt.claim.sub='44444444-4444-4444-4444-444444444444';
SELECT pg_temp.assert_true((SELECT count(*)=7 FROM public.get_pet_catalog()
  WHERE unlocked AND pet_type IN (SELECT pet_type FROM public.pet_catalog
    WHERE unlock_boss_id IS NOT NULL)),
  'all seven catalog pet rights follow exact boss wins');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT enemy_power=400 AND hero_power=400
  AND boss_id='00000000-0000-0000-0000-000000000057'::uuid
  FROM public.adventure_encounters
  WHERE user_id='44444444-4444-4444-4444-444444444444' AND stage=570),
  'Chronos at stage 570 is reachable without equipment');
SELECT pg_temp.assert_true((SELECT gold_today=120 AND loot_today=2
  FROM public.adventure_state
  WHERE user_id='44444444-4444-4444-4444-444444444444'),
  'daily gold and loot caps persist across the catalog');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.user_inventory
  WHERE user_id='44444444-4444-4444-4444-444444444444' AND equipped),
  'awarded common drops are not equipped in reachability scenario');
SELECT pg_temp.assert_true((SELECT total_xp=1176000 AND level=50 FROM public.profiles
  WHERE user_id='44444444-4444-4444-4444-444444444444'),
  'boss victories did not change routine XP or profile level');
SELECT pg_temp.assert_true((SELECT xp=252000 AND level=28 FROM public.attributes
  WHERE user_id='44444444-4444-4444-4444-444444444444' AND name='forca'),
  'boss victories did not change trained attribute XP or level');

SET ROLE authenticated;
SET request.jwt.claim.sub='44444444-4444-4444-4444-444444444444';
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=57 FROM public.adventure_encounters
  WHERE user_id='44444444-4444-4444-4444-444444444444'),
  'immediate replay does not add an encounter');

UPDATE public.adventure_state SET stage=580,attempt=0,
  last_tick_at=now()-interval '30 minutes'
WHERE user_id='44444444-4444-4444-4444-444444444444';
SET ROLE authenticated;
SET request.jwt.claim.sub='44444444-4444-4444-4444-444444444444';
SELECT public.sync_auto_adventure();
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=1 AND bool_and(won)
  AND bool_and(boss_id='00000000-0000-0000-0000-000000000001'::uuid)
  AND bool_and(enemy_power=400 AND hero_power=400)
  FROM public.adventure_encounters
  WHERE user_id='44444444-4444-4444-4444-444444444444' AND stage=580),
  'first cycle returns to first boss with one reachable encounter');
SELECT pg_temp.assert_true((SELECT count(*)=57 FROM public.boss_battles
  WHERE user_id='44444444-4444-4444-4444-444444444444' AND won),
  'cycle does not duplicate boss ledger');

UPDATE public.adventure_state SET stage=1000,attempt=0,
  last_tick_at=now()-interval '1 hour'
WHERE user_id='44444444-4444-4444-4444-444444444444';
SET ROLE authenticated;
SET request.jwt.claim.sub='44444444-4444-4444-4444-444444444444';
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.assert_true((SELECT won AND enemy_power=400 AND hero_power=400
  FROM public.adventure_encounters
  WHERE user_id='44444444-4444-4444-4444-444444444444' AND stage=1000),
  'boss cap is 400');
SELECT pg_temp.assert_true((SELECT won AND enemy_power=380 AND hero_power=400
  FROM public.adventure_encounters
  WHERE user_id='44444444-4444-4444-4444-444444444444' AND stage=1001),
  'normal cap is 380');
SELECT pg_temp.assert_true((SELECT gold_today=120 AND loot_today=2
  FROM public.adventure_state
  WHERE user_id='44444444-4444-4444-4444-444444444444'),
  'caps survive continued wins');
SELECT pg_temp.assert_true((SELECT total_xp=1176000 AND level=50 FROM public.profiles
  WHERE user_id='44444444-4444-4444-4444-444444444444')
  AND (SELECT xp=252000 AND level=28 FROM public.attributes
    WHERE user_id='44444444-4444-4444-4444-444444444444' AND name='forca'),
  'catalog, cycle and capped stages preserve routine XP, level and attributes');

SET ROLE authenticated;
SET request.jwt.claim.sub='55555555-5555-5555-5555-555555555555';
SELECT public.sync_auto_adventure();
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=1 AND bool_and(NOT won)
  AND bool_and(hero_power=73 AND enemy_power=75)
  FROM public.adventure_encounters
  WHERE user_id='55555555-5555-5555-5555-555555555555' AND stage=30),
  'weak untrained hero loses boss 30 without replay credit');
SELECT pg_temp.assert_true((SELECT stage=30 AND attempt=1 FROM public.adventure_state
  WHERE user_id='55555555-5555-5555-5555-555555555555'),
  'weak hero stays on defeated stage');
SELECT pg_temp.assert_true((SELECT total_xp=0 AND level=1 FROM public.profiles
  WHERE user_id='55555555-5555-5555-5555-555555555555'),
  'defeat leaves weak hero XP and level unchanged');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.attributes
  WHERE user_id='55555555-5555-5555-5555-555555555555'),
  'defeat does not create attributes');
SELECT 'reachable catalog SQL assertions passed' AS result;
