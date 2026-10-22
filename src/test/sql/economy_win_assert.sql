-- Authenticated battle settlement against the LF-replayed PG17 reduced schema.
BEGIN;
CREATE FUNCTION pg_temp.ok(p_condition boolean,p_message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'ECONOMY_WIN_ASSERT: %',p_message; END IF;
END;
$$;
CREATE TEMP TABLE economy_xp_before AS
SELECT user_id,total_xp FROM public.profiles
WHERE user_id IN ('11111111-1111-1111-1111-111111111111',
                  '33333333-3333-3333-3333-333333333333');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
SELECT pg_temp.ok((public.sync_auto_adventure()->'battle'->>'status')='fighting',
                  'server starts a canonical battle');
RESET ROLE;
SELECT pg_temp.ok((SELECT status='fighting' AND (events->-1->>'enemy_hp')::integer=0
                   FROM app_private.adventure_battles b
                   JOIN public.adventure_state s ON s.current_battle_id=b.id
                   WHERE s.user_id='11111111-1111-1111-1111-111111111111'),
                  'frozen result is a win');
-- Local clock probe: shift the immutable timeline, never the OS clock.
UPDATE app_private.adventure_battles b
SET started_at=b.started_at-interval '25 seconds',
    ends_at=b.ends_at-interval '25 seconds',
    events=(SELECT jsonb_agg(jsonb_set(x.event,'{at}',
                to_jsonb((x.event->>'at')::timestamptz-interval '25 seconds'))
                ORDER BY x.ord)
            FROM jsonb_array_elements(b.events) WITH ORDINALITY x(event,ord))
FROM public.adventure_state s
WHERE s.current_battle_id=b.id AND s.user_id='11111111-1111-1111-1111-111111111111';
UPDATE public.adventure_state SET gold_today=119,loot_today=2,
  next_reward_at=clock_timestamp()+interval '1 hour',adventure_mode='holding'
WHERE user_id='11111111-1111-1111-1111-111111111111';

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
SELECT pg_temp.ok((public.sync_auto_adventure()->'catchup'->>'wins')::integer=1,
                  'one settled win');
SELECT pg_temp.ok((public.sync_auto_adventure()->'catchup'->>'wins')::integer=0,
                  'retry does not recredit the win');
RESET ROLE;
SELECT pg_temp.ok((SELECT gold_today>120 AND loot_today=2 AND adventure_mode='holding'
                   AND stage=1 AND (last_result->>'gold')::integer>0
                   FROM public.adventure_state
                   WHERE user_id='11111111-1111-1111-1111-111111111111'),
                  'gold exceeds former cap without changing hold or item cap');
SELECT pg_temp.ok((SELECT count(*)=1 AND sum(amount)>0 FROM public.gold_history
                   WHERE user_id='11111111-1111-1111-1111-111111111111'
                     AND type='adventure'), 'one positive financial row');
SELECT pg_temp.ok((SELECT count(*)=1 AND max(gold_awarded)>0
                   FROM app_private.adventure_battles
                   WHERE user_id='11111111-1111-1111-1111-111111111111'
                     AND status='won'), 'battle receipt matches one victory');

-- An ended v3 timeline with both sides alive is a draw and earns nothing.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='33333333-3333-3333-3333-333333333333';
DO $$ BEGIN PERFORM public.sync_auto_adventure(); END $$;
RESET ROLE;
UPDATE app_private.adventure_battles b
SET started_at=b.started_at-interval '30 seconds',
    ends_at=b.ends_at-interval '30 seconds',
    events=(SELECT jsonb_agg(CASE WHEN x.ord=jsonb_array_length(b.events)
                THEN jsonb_set(jsonb_set(x.event,'{enemy_hp}','1'::jsonb),'{hero_hp}','1'::jsonb)
                ELSE x.event END ORDER BY x.ord)
            FROM jsonb_array_elements(b.events) WITH ORDINALITY x(event,ord))
FROM public.adventure_state s
WHERE s.current_battle_id=b.id AND s.user_id='33333333-3333-3333-3333-333333333333';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='33333333-3333-3333-3333-333333333333';
DO $$ BEGIN PERFORM public.sync_auto_adventure(); END $$;
RESET ROLE;
SELECT pg_temp.ok((SELECT last_result->>'status'='draw' AND
                         (last_result->>'gold')::integer=0
                   FROM public.adventure_state
                   WHERE user_id='33333333-3333-3333-3333-333333333333'),
                  'draw earns no gold');
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.gold_history
                   WHERE user_id='33333333-3333-3333-3333-333333333333'
                     AND type='adventure'), 'draw has no gold ledger');
SELECT pg_temp.ok((SELECT count(*)=2 FROM economy_xp_before x
                   JOIN public.profiles p USING(user_id)
                   WHERE p.total_xp=x.total_xp),
                  'win and draw do not change routine XP');
SELECT 'ECONOMY_WIN_ASSERT_PASS' AS result;
ROLLBACK;
