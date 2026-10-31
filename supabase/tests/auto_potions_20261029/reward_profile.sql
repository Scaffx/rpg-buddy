\set ON_ERROR_STOP on
INSERT INTO auth.users(id) VALUES ('a0000000-0000-0000-0000-00000000b908');
INSERT INTO public.profiles(user_id,level,total_xp,starter_class,current_class_id,combat_skill_loadout)
VALUES ('a0000000-0000-0000-0000-00000000b908',1,0,'mago',
  '00000002-0000-0000-0000-000000000002','[{"id":"auto_potion_mp_probe"}]');
INSERT INTO public.player_skill_nodes(user_id,node_id,rank) VALUES
  ('a0000000-0000-0000-0000-00000000b908','auto_potion_mp_probe',1);
INSERT INTO public.adventure_state(user_id,stage,last_tick_at) VALUES
  ('a0000000-0000-0000-0000-00000000b908',1,clock_timestamp());
INSERT INTO public.user_inventory(user_id,item_id,quantity,equipped) VALUES
  ('a0000000-0000-0000-0000-00000000b908','ea63052e-8530-4c4e-98ed-9d62a9cbf781',1,false);
INSERT INTO app_private.adventure_auto_potion_selection(user_id,enabled,effective_at) VALUES
  ('a0000000-0000-0000-0000-00000000b908',true,clock_timestamp()-interval '1 minute');
SET ROLE authenticated;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000b908';
SELECT public.sync_auto_adventure() AS first \gset potion_
RESET ROLE;
DO $test$
DECLARE b app_private.adventure_battles%ROWTYPE;
BEGIN
  SELECT * INTO STRICT b FROM app_private.adventure_battles
    WHERE user_id='a0000000-0000-0000-0000-00000000b908' LIMIT 1;
  IF b.events->-1->>'enemy_hp'<>'0' OR NOT EXISTS
    (SELECT 1 FROM app_private.adventure_auto_potion_receipts r
      WHERE r.battle_id=b.id AND r.potion_type='mp') THEN
    RAISE EXCEPTION 'AUTO_POTION_REWARD_FIXTURE_NO_POTION_WIN'; END IF;
END $test$;
-- Bring only this fixture battle to its finished timestamp. Its event order
-- and relative intervals remain unchanged; no system clock is modified.
WITH shift AS (
  SELECT id,ends_at-(clock_timestamp()-interval '100 milliseconds') AS delta
    FROM app_private.adventure_battles
    WHERE user_id='a0000000-0000-0000-0000-00000000b908'
)
UPDATE app_private.adventure_battles b SET
  started_at=b.started_at-s.delta,ends_at=b.ends_at-s.delta,
  events=(SELECT jsonb_agg(jsonb_set(e.x,'{at}',
    to_jsonb((e.x->>'at')::timestamptz-s.delta)) ORDER BY e.n)
    FROM jsonb_array_elements(b.events) WITH ORDINALITY e(x,n))
  FROM shift s WHERE b.id=s.id;
SET ROLE authenticated;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000b908';
SELECT public.sync_auto_adventure() AS settled \gset potion_
RESET ROLE;
DO $test$
BEGIN
  IF (SELECT status FROM app_private.adventure_battles
      WHERE user_id='a0000000-0000-0000-0000-00000000b908')<>'won'
    OR (SELECT count(*) FROM public.gold_history WHERE
      user_id='a0000000-0000-0000-0000-00000000b908' AND type='adventure')<>1
    OR (SELECT total_xp FROM public.profiles
      WHERE user_id='a0000000-0000-0000-0000-00000000b908')<>0
    OR (SELECT level FROM public.profiles
      WHERE user_id='a0000000-0000-0000-0000-00000000b908')<>1 THEN
    RAISE EXCEPTION 'AUTO_POTION_REWARD_OR_XP'; END IF;
  RAISE NOTICE 'AUTO_POTIONS_REWARD_ONCE_NO_XP_PASS';
END $test$;
BEGIN;
DELETE FROM app_private.adventure_battles
  WHERE user_id='a0000000-0000-0000-0000-00000000b908';
DO $test$
BEGIN
  IF (SELECT count(*) FROM app_private.adventure_auto_potion_receipts
    WHERE user_id='a0000000-0000-0000-0000-00000000b908')<>1 THEN
    RAISE EXCEPTION 'AUTO_POTION_RECEIPT_PRUNED'; END IF;
  RAISE NOTICE 'AUTO_POTIONS_RECEIPT_RETENTION_PASS';
END $test$;
ROLLBACK;
