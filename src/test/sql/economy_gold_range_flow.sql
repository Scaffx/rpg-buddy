\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.ok(p_ok boolean,p_label text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  IF p_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'GOLD_RANGE_ASSERT: %',p_label; END IF;
END $$;

-- Fixture identities exist in economy_composed_20261022. The server creates
-- both battle rows; only their clock fields are advanced in this local test.
UPDATE public.profiles SET level=9
  WHERE user_id='33333333-3333-3333-3333-333333333333';
UPDATE public.profiles SET level=10
  WHERE user_id='11111111-1111-1111-1111-111111111111';
INSERT INTO public.adventure_state(user_id,stage,attempt,last_tick_at)
VALUES ('33333333-3333-3333-3333-333333333333',9,0,clock_timestamp()),
       ('11111111-1111-1111-1111-111111111111',10,0,clock_timestamp());
CREATE TEMP TABLE before_gold_range AS
SELECT p.user_id,p.total_xp,p.level,b.gold,
       (SELECT coalesce(jsonb_agg(jsonb_build_object('name',a.name,'xp',a.xp,'level',a.level)
         ORDER BY a.name),'[]'::jsonb) FROM public.attributes a WHERE a.user_id=p.user_id)
         AS attributes,
       (SELECT count(*) FROM public.gold_history h WHERE h.user_id=p.user_id
         AND h.type='adventure') AS ledger_count,
       (SELECT count(*) FROM public.user_inventory i WHERE i.user_id=p.user_id)
         AS inventory_count
FROM public.profiles p JOIN public.user_balance b USING(user_id)
WHERE p.user_id IN ('33333333-3333-3333-3333-333333333333',
                    '11111111-1111-1111-1111-111111111111');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);
SELECT public.sync_auto_adventure() IS NOT NULL AS boss_created;
SELECT set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',true);
SELECT public.sync_auto_adventure() IS NOT NULL AS normal_created;
RESET ROLE;

SELECT pg_temp.ok((SELECT count(*)=2 FROM app_private.adventure_battles b
  WHERE b.status='fighting' AND b.user_id IN
  ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111')),
  'server created two fights');
SELECT user_id,stage,kind,events->-1 AS final_event FROM app_private.adventure_battles
WHERE user_id IN ('33333333-3333-3333-3333-333333333333',
                  '11111111-1111-1111-1111-111111111111') AND status='fighting';
UPDATE app_private.adventure_battles SET
  started_at=clock_timestamp()-interval '2 minutes',
  ends_at=clock_timestamp()-interval '1 second'
WHERE status='fighting' AND user_id IN
  ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);
SELECT public.sync_auto_adventure() IS NOT NULL AS boss_settled;
SELECT set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',true);
SELECT public.sync_auto_adventure() IS NOT NULL AS normal_settled;
RESET ROLE;

SELECT pg_temp.ok((SELECT count(*)=2 FROM public.adventure_encounters e
  WHERE e.user_id IN ('33333333-3333-3333-3333-333333333333',
                      '11111111-1111-1111-1111-111111111111')
    AND e.won AND e.gold BETWEEN 13 AND 48), 'normal and boss first clear over 12');
SELECT pg_temp.ok((SELECT count(*)=2 FROM public.adventure_encounters e
  JOIN app_private.adventure_battles b
    ON b.user_id=e.user_id AND b.stage=e.stage AND b.attempt=e.attempt
  WHERE e.user_id IN ('33333333-3333-3333-3333-333333333333',
                      '11111111-1111-1111-1111-111111111111')
    AND e.gold=b.gold_awarded AND b.status='won'), 'encounter and battle agree');
SELECT e.user_id,e.stage,e.kind,e.gold,b.gold_awarded,b.item_id
FROM public.adventure_encounters e JOIN app_private.adventure_battles b
  ON b.user_id=e.user_id AND b.stage=e.stage AND b.attempt=e.attempt
WHERE e.user_id IN ('33333333-3333-3333-3333-333333333333',
                    '11111111-1111-1111-1111-111111111111')
  AND b.gold_awarded=e.gold AND b.status='won';
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM before_gold_range x
  JOIN public.profiles p USING(user_id)
  WHERE (x.total_xp,x.level) IS DISTINCT FROM (p.total_xp,p.level)
     OR x.attributes IS DISTINCT FROM
       (SELECT coalesce(jsonb_agg(jsonb_build_object('name',a.name,'xp',a.xp,'level',a.level)
          ORDER BY a.name),'[]'::jsonb) FROM public.attributes a WHERE a.user_id=p.user_id)),
  'combat grants no XP, level or attributes');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM before_gold_range x
  JOIN public.user_balance b USING(user_id)
  WHERE b.gold<>x.gold+(SELECT sum(e.gold)::integer FROM public.adventure_encounters e
    WHERE e.user_id=x.user_id)), 'balance equals encounter awards');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM before_gold_range x
  WHERE (SELECT count(*) FROM public.gold_history h WHERE h.user_id=x.user_id
           AND h.type='adventure')<>x.ledger_count+1), 'one gold ledger row each');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.adventure_encounters e
  JOIN public.gold_history h ON h.user_id=e.user_id AND h.type='adventure'
  WHERE e.user_id IN ('33333333-3333-3333-3333-333333333333',
                      '11111111-1111-1111-1111-111111111111')
    AND h.amount<>e.gold), 'ledger amount equals server award');
SELECT pg_temp.ok(EXISTS (SELECT 1 FROM app_private.adventure_battles b
  JOIN public.user_inventory i ON i.user_id=b.user_id AND i.item_id=b.item_id
  WHERE b.user_id='11111111-1111-1111-1111-111111111111'
    AND b.stage=10 AND b.gold_awarded>12 AND i.quantity>0),
  'boss first-clear item is in inventory');
SELECT pg_temp.ok((SELECT count(*)=1 FROM app_private.boss_recipe_unlocks
  WHERE user_id='11111111-1111-1111-1111-111111111111' AND stage=10),
  'boss recipe entitlement atomic with settlement');
SELECT pg_temp.ok((SELECT count(*)=1 FROM app_private.adventure_chest_win_receipts r
  JOIN app_private.adventure_battles b ON b.id=r.battle_id
  WHERE b.user_id='11111111-1111-1111-1111-111111111111' AND b.stage=10),
  'boss chest receipt atomic with settlement');

-- Subsequent calls can create new fights but must not pay the settled rows.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',true);
SELECT public.sync_auto_adventure() IS NOT NULL AS normal_replay;
SELECT set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);
SELECT public.sync_auto_adventure() IS NOT NULL AS boss_replay;
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*)=2 FROM public.gold_history h
  WHERE h.type='adventure' AND h.user_id IN
  ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111')),
  'replay adds no ledger entry');
SELECT pg_temp.ok((SELECT count(*)=1 FROM app_private.adventure_chest_win_receipts r
  JOIN app_private.adventure_battles b ON b.id=r.battle_id
  WHERE b.user_id='11111111-1111-1111-1111-111111111111' AND b.stage=10),
  'replay adds no chest receipt');
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.user_inventory i
  JOIN app_private.adventure_battles b ON b.item_id=i.item_id AND b.user_id=i.user_id
  WHERE i.user_id='11111111-1111-1111-1111-111111111111'
    AND b.stage=10 AND b.gold_awarded>12 AND i.quantity=1),
  'replay adds no boss item');
SELECT 'GOLD_RANGE_FLOW_PASS' AS result;
ROLLBACK;
