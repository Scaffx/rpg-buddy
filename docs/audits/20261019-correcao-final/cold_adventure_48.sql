-- Independent rollback-only reconciliation proof. Backdates only local fixture
-- state; it does not alter the operating-system clock or published service.
BEGIN;
SET LOCAL statement_timeout='60s';
INSERT INTO auth.users(id,email) VALUES
 ('a1400000-0000-0000-0000-000000000001','cold-adventure@example.invalid');
INSERT INTO public.game_items(id,name,category,rarity,shop_price,stackable,
 is_consumable,level_required,atk_bonus)
VALUES ('a1400000-0000-0000-0000-000000000011','Audit weapon',
 'weapon','comum',30,false,false,1,200);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='a1400000-0000-0000-0000-000000000001';
SELECT public.purchase_game_item('a1400000-0000-0000-0000-000000000011',
 'a1400000-0000-0000-0000-000000000012');
RESET ROLE;
UPDATE public.user_inventory SET equipped=true
WHERE user_id='a1400000-0000-0000-0000-000000000001';
INSERT INTO public.adventure_state(user_id,stage,attempt,last_tick_at,reward_day,gold_today,loot_today)
VALUES ('a1400000-0000-0000-0000-000000000001',1,0,
 now()-interval '36 hours',(now() AT TIME ZONE 'America/Sao_Paulo')::date,0,0);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='a1400000-0000-0000-0000-000000000001';
DO $first$
DECLARE snapshot jsonb;
BEGIN
 snapshot := public.sync_auto_adventure();
 IF (SELECT count(*) FROM public.adventure_encounters WHERE user_id=auth.uid()) <> 48
    OR (SELECT stage FROM public.adventure_state WHERE user_id=auth.uid()) <> 49
    OR (SELECT gold_today FROM public.adventure_state WHERE user_id=auth.uid()) <> 120
    OR (SELECT loot_today FROM public.adventure_state WHERE user_id=auth.uid()) <> 2
    OR (SELECT gold FROM public.user_balance WHERE user_id=auth.uid()) <> 190
    OR (SELECT count(*) FROM public.adventure_encounters
        WHERE user_id=auth.uid() AND kind='boss' AND won) <> 4
    OR (SELECT total_xp FROM public.profiles WHERE user_id=auth.uid()) <> 0
    OR EXISTS (SELECT 1 FROM public.attributes WHERE user_id=auth.uid() AND xp<>0)
 THEN RAISE EXCEPTION 'CATCHUP_48_OR_DAILY_CAP_WRONG: %',snapshot; END IF;
 PERFORM public.sync_auto_adventure();
 IF (SELECT count(*) FROM public.adventure_encounters WHERE user_id=auth.uid()) <> 48
    OR (SELECT gold FROM public.user_balance WHERE user_id=auth.uid()) <> 190
 THEN RAISE EXCEPTION 'REPLAY_DUPLICATED_ADVENTURE_REWARD'; END IF;
 RAISE NOTICE 'COLD_ADVENTURE_PASS: 48 stages, 4 bosses, 120 gold, 2 loot, zero XP, replay stable';
END $first$;
RESET ROLE;
-- Simulate São Paulo day rollover in fixture state only, then one elapsed tick.
UPDATE public.adventure_state SET reward_day=(now() AT TIME ZONE 'America/Sao_Paulo')::date-1,
 last_tick_at=now()-interval '30 minutes'
WHERE user_id='a1400000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='a1400000-0000-0000-0000-000000000001';
DO $rollover$
BEGIN
 PERFORM public.sync_auto_adventure();
 IF (SELECT stage FROM public.adventure_state WHERE user_id=auth.uid()) <> 50
    OR (SELECT gold_today FROM public.adventure_state WHERE user_id=auth.uid()) <> 4
    OR (SELECT gold FROM public.user_balance WHERE user_id=auth.uid()) <> 194
 THEN RAISE EXCEPTION 'SAO_PAULO_DAY_RESET_WRONG'; END IF;
 RAISE NOTICE 'COLD_DAY_ROLLOVER_PASS: new São Paulo day credits 4 gold';
END $rollover$;
ROLLBACK;
