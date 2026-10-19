-- Independent public-RPC probe. Run against composed local fixture with
-- psql -X -v ON_ERROR_STOP=1 -f this_file; this file rolls back its own writes.
BEGIN;
SET LOCAL statement_timeout = '30s';
INSERT INTO auth.users(id,email) VALUES
 ('55555555-5555-5555-5555-555555555555','audit-adventure@example.invalid');
INSERT INTO public.adventure_state(user_id,stage,last_tick_at)
VALUES ('55555555-5555-5555-5555-555555555555',9,now()-interval '30 minutes');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
SELECT public.sync_auto_adventure()->>'stage' AS after_9;
RESET ROLE;
UPDATE public.adventure_state SET last_tick_at=now()-interval '30 minutes'
 WHERE user_id='55555555-5555-5555-5555-555555555555';
SET LOCAL ROLE authenticated;
SELECT public.sync_auto_adventure()->>'stage' AS after_10;
RESET ROLE;
UPDATE public.adventure_state SET last_tick_at=now()-interval '30 minutes'
 WHERE user_id='55555555-5555-5555-5555-555555555555';
SET LOCAL ROLE authenticated;
SELECT public.sync_auto_adventure()->>'stage' AS after_11;
RESET ROLE;
UPDATE public.adventure_state SET stage=19,attempt=0,last_tick_at=now()-interval '30 minutes'
 WHERE user_id='55555555-5555-5555-5555-555555555555';
SET LOCAL ROLE authenticated;
SELECT public.sync_auto_adventure()->>'stage' AS after_19;
RESET ROLE;
UPDATE public.adventure_state SET last_tick_at=now()-interval '30 minutes'
 WHERE user_id='55555555-5555-5555-5555-555555555555';
SET LOCAL ROLE authenticated;
SELECT public.sync_auto_adventure()->>'stage' AS after_20;
RESET ROLE;

DO $audit$
DECLARE u uuid := '55555555-5555-5555-5555-555555555555';
BEGIN
 IF (SELECT stage FROM public.adventure_state WHERE user_id=u) <> 21 OR
    (SELECT array_agg(stage::text||':'||kind ORDER BY stage)
       FROM public.adventure_encounters WHERE user_id=u) <>
       ARRAY['9:normal','10:boss','11:normal','19:normal','20:boss'] OR
    (SELECT gold FROM public.user_balance WHERE user_id=u) <> 136 OR
    (SELECT total_xp FROM public.profiles WHERE user_id=u) <> 0 OR
    EXISTS (SELECT 1 FROM public.attributes WHERE user_id=u AND xp<>0) THEN
   RAISE EXCEPTION 'AUDIT_STAGE_OR_REWARD_CONTRACT_FAILED';
 END IF;
 IF has_function_privilege('anon','public.sync_auto_adventure()','EXECUTE') OR
    has_table_privilege('authenticated','public.attributes','TRUNCATE') OR
    has_column_privilege('authenticated','public.attributes','xp','UPDATE') OR
    has_column_privilege('authenticated','public.user_balance','gold','UPDATE') OR
    has_column_privilege('authenticated','public.user_inventory','quantity','UPDATE') OR
    has_table_privilege('authenticated','public.boss_battles','INSERT') THEN
   RAISE EXCEPTION 'AUDIT_PUBLIC_PRIVILEGE_CONTRACT_FAILED';
 END IF;
END;
$audit$;

-- Defeat is automatic and must keep the stage; equipment can enable a retry.
UPDATE public.adventure_state SET stage=100,attempt=0,last_tick_at=now()-interval '30 minutes'
 WHERE user_id='55555555-5555-5555-5555-555555555555';
SET LOCAL ROLE authenticated;
SELECT public.sync_auto_adventure()->>'stage' AS after_defeat;
RESET ROLE;
DO $audit$
BEGIN
 IF (SELECT stage<>100 OR attempt<>1 FROM public.adventure_state
     WHERE user_id='55555555-5555-5555-5555-555555555555') THEN
  RAISE EXCEPTION 'AUDIT_DEFEAT_DID_NOT_PAUSE';
 END IF;
END;
$audit$;
INSERT INTO public.game_items(id,name,category,rarity,atk_bonus)
VALUES ('55555555-5555-5555-5555-555555555557','Audit sword','weapon','comum',80);
INSERT INTO public.user_inventory(user_id,item_id,equipped)
VALUES ('55555555-5555-5555-5555-555555555555',
        '55555555-5555-5555-5555-555555555557',true);
UPDATE public.adventure_state SET last_tick_at=now()-interval '30 minutes'
 WHERE user_id='55555555-5555-5555-5555-555555555555';
SET LOCAL ROLE authenticated;
SELECT public.sync_auto_adventure()->>'stage' AS after_retry;
RESET ROLE;
DO $audit$
DECLARE u uuid := '55555555-5555-5555-5555-555555555555';
BEGIN
 IF (SELECT stage<>101 OR attempt<>0 FROM public.adventure_state WHERE user_id=u) OR
    (SELECT count(*) FROM public.adventure_encounters WHERE user_id=u AND stage=100)<>2 OR
    (SELECT total_xp FROM public.profiles WHERE user_id=u)<>0 THEN
  RAISE EXCEPTION 'AUDIT_DEFEAT_RETRY_FAILED';
 END IF;
 RAISE NOTICE 'AUDIT_PUBLIC_CONTRACT_PASS stage9/10/11/19/20, defeat/retry, economy, ACL';
END;
$audit$;
ROLLBACK;
