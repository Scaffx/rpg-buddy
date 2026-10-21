-- Run after adventure_skill_motor_assert.sql in the same isolated database.
CREATE FUNCTION pg_temp.ok_state(v boolean,m text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'assertion: %',m; END IF; END $$;
CREATE FUNCTION pg_temp.forward_motor(u uuid,s integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE app_private.adventure_battles b
    SET started_at=b.started_at-make_interval(secs=>s),
        ends_at=b.ends_at-make_interval(secs=>s),
        events=(SELECT jsonb_agg(jsonb_set(e,'{at}',
          to_jsonb((e->>'at')::timestamptz-make_interval(secs=>s))) ORDER BY ord)
          FROM jsonb_array_elements(b.events) WITH ORDINALITY x(e,ord))
    WHERE b.id=(SELECT current_battle_id FROM public.adventure_state WHERE user_id=u);
END $$;
CREATE FUNCTION pg_temp.forward_ready_motor(u uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_seconds integer;
BEGIN
  SELECT greatest(2,ceil(extract(epoch FROM b.ends_at-clock_timestamp()))::integer+2)
    INTO STRICT v_seconds FROM app_private.adventure_battles b
    WHERE b.id=(SELECT current_battle_id FROM public.adventure_state WHERE user_id=u);
  PERFORM pg_temp.forward_motor(u,v_seconds);
END $$;

-- One first clear and one economic receipt despite retry.
SELECT pg_temp.forward_ready_motor('22222222-2222-2222-2222-222222222222');
SET ROLE authenticated;
SET request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
SELECT public.sync_auto_adventure();
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.ok_state((SELECT count(*)=1 FROM public.adventure_encounters
  WHERE user_id='22222222-2222-2222-2222-222222222222' AND stage=1 AND won),
  'first clear only once');
SELECT pg_temp.ok_state((SELECT count(*)=1 AND sum(amount)=4 FROM public.gold_history
  WHERE user_id='22222222-2222-2222-2222-222222222222' AND type='adventure'),
  'reward once after retry');
SELECT pg_temp.ok_state((SELECT stage=2 AND current_battle_id IS NOT NULL
  FROM public.adventure_state WHERE user_id='22222222-2222-2222-2222-222222222222'),
  'stage progresses and creates next battle');
SELECT pg_temp.ok_state((SELECT next_reward_at>clock_timestamp()
  FROM public.adventure_state WHERE user_id='22222222-2222-2222-2222-222222222222'),
  '30 minute reward clock');

-- Force a due reward slot in the local fixture and approach both daily caps.
UPDATE public.adventure_state SET gold_today=119,loot_today=2,
  next_reward_at=clock_timestamp()-interval '1 hour'
WHERE user_id='22222222-2222-2222-2222-222222222222';
SELECT pg_temp.forward_ready_motor('22222222-2222-2222-2222-222222222222');
SET ROLE authenticated;
SET request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.ok_state((SELECT gold_today=120 AND loot_today=2
  FROM public.adventure_state WHERE user_id='22222222-2222-2222-2222-222222222222'),
  'daily 120 gold and 2 item caps');
SELECT pg_temp.ok_state((SELECT count(*)=2 AND sum(amount)=5 FROM public.gold_history
  WHERE user_id='22222222-2222-2222-2222-222222222222' AND type='adventure'),
  'only one capped gold paid in second slot');

-- Offline cursor must continue with the exact prior v3 build after live profile
-- and equipment are edited. Existing battle rows are not recomputed.
CREATE TEMP TABLE motor_prior AS SELECT id,hero_attack,hero_defense,hero_max_hp,
  hero_max_mp,skills,rules_snapshot FROM app_private.adventure_battles
  WHERE user_id='44444444-4444-4444-4444-444444444444';
UPDATE public.user_inventory SET equipped=false
WHERE user_id='44444444-4444-4444-4444-444444444444';
UPDATE public.attributes SET level=50
WHERE user_id='44444444-4444-4444-4444-444444444444';
SELECT pg_temp.forward_motor('44444444-4444-4444-4444-444444444444',120);
SET ROLE authenticated;
SET request.jwt.claim.sub='44444444-4444-4444-4444-444444444444';
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.ok_state((SELECT count(*)>1 FROM app_private.adventure_battles
  WHERE user_id='44444444-4444-4444-4444-444444444444'),
  'offline catchup created battles');
SELECT pg_temp.ok_state(NOT EXISTS (
  SELECT 1 FROM app_private.adventure_battles b CROSS JOIN motor_prior p
  WHERE b.user_id='44444444-4444-4444-4444-444444444444'
    AND b.started_at<clock_timestamp()-interval '30 seconds'
    AND (b.hero_attack<>p.hero_attack OR b.hero_defense<>p.hero_defense
      OR b.hero_max_hp<>p.hero_max_hp OR b.hero_max_mp<>p.hero_max_mp
      OR b.skills<>p.skills OR b.rules_snapshot<>p.rules_snapshot)),
  'offline v3 reuses frozen stats, skills and rule version');
SELECT pg_temp.ok_state((SELECT count(*)>=1 FROM app_private.adventure_battles
  WHERE user_id='44444444-4444-4444-4444-444444444444'
    AND started_at<clock_timestamp()-interval '30 seconds'),
  'offline snapshot probe reached older battles');

-- High stage forces retreat and holding; a separately strong hero wins while
-- holding, then the human advance gate permits stage 10 boss.
INSERT INTO auth.users(id) VALUES('99999999-9999-9999-9999-999999999999');
INSERT INTO public.profiles(user_id,level,starter_class)
VALUES('99999999-9999-9999-9999-999999999999',50,'guerreiro');
INSERT INTO public.attributes(user_id,name,level)
VALUES('99999999-9999-9999-9999-999999999999','forca',5);
INSERT INTO public.adventure_state(user_id,stage,attempt,last_tick_at,adventure_mode)
VALUES('99999999-9999-9999-9999-999999999999',9,0,clock_timestamp(),'holding');
INSERT INTO public.adventure_state(user_id,stage,attempt,last_tick_at)
VALUES('11111111-1111-1111-1111-111111111111',250,0,clock_timestamp());
SET ROLE authenticated;
SET request.jwt.claim.sub='99999999-9999-9999-9999-999999999999';
SELECT public.sync_auto_adventure();
SET request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.forward_ready_motor('99999999-9999-9999-9999-999999999999');
SELECT pg_temp.forward_ready_motor('11111111-1111-1111-1111-111111111111');
SET ROLE authenticated;
SET request.jwt.claim.sub='99999999-9999-9999-9999-999999999999';
SELECT public.sync_auto_adventure();
SET request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.ok_state((SELECT adventure_mode='holding' AND stage=9
  FROM public.adventure_state WHERE user_id='99999999-9999-9999-9999-999999999999'),
  'holding win remains at stage 9');
SELECT pg_temp.ok_state((SELECT adventure_mode='holding' AND stage=249
  FROM public.adventure_state WHERE user_id='11111111-1111-1111-1111-111111111111'),
  'defeat retreats one stage and holds');
SET ROLE authenticated;
SET request.jwt.claim.sub='99999999-9999-9999-9999-999999999999';
SELECT public.advance_auto_adventure((SELECT current_battle_id FROM public.adventure_state
  WHERE user_id=auth.uid()));
RESET ROLE;
SELECT pg_temp.ok_state((SELECT advance_requested AND stage=9
  FROM public.adventure_state WHERE user_id='99999999-9999-9999-9999-999999999999'),
  'human advance uses current battle ID');
SELECT pg_temp.forward_ready_motor('99999999-9999-9999-9999-999999999999');
SET ROLE authenticated;
SET request.jwt.claim.sub='99999999-9999-9999-9999-999999999999';
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.ok_state((SELECT stage=10 AND adventure_mode='progressing'
  FROM public.adventure_state WHERE user_id='99999999-9999-9999-9999-999999999999'),
  'advance permits stage 10');
SELECT pg_temp.ok_state((SELECT kind='boss' AND boss_id IS NOT NULL
  FROM app_private.adventure_battles WHERE id=(SELECT current_battle_id
  FROM public.adventure_state WHERE user_id='99999999-9999-9999-9999-999999999999')),
  'boss at stage 10');
