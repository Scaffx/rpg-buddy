\set ON_ERROR_STOP on
INSERT INTO auth.users(id) VALUES ('a0000000-0000-0000-0000-00000000b909');
INSERT INTO public.profiles(user_id,level,starter_class) VALUES
  ('a0000000-0000-0000-0000-00000000b909',1,'novato');
INSERT INTO public.adventure_state(user_id,stage,last_tick_at) VALUES
  ('a0000000-0000-0000-0000-00000000b909',15,clock_timestamp());
INSERT INTO public.user_inventory(user_id,item_id,quantity,equipped) VALUES
  ('a0000000-0000-0000-0000-00000000b909','36aa16a5-153d-4c08-941e-ae3ee51d54d4',1,false);
INSERT INTO app_private.adventure_auto_potion_selection(user_id,enabled,effective_at) VALUES
  ('a0000000-0000-0000-0000-00000000b909',true,clock_timestamp()-interval '1 minute');
SET ROLE authenticated;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000b909';
SELECT public.sync_auto_adventure() AS battle \gset potion_
SELECT public.get_adventure_auto_potions_state() AS reserved \gset potion_
RESET ROLE;
CREATE TEMP TABLE auto_potion_public_capture(kind text PRIMARY KEY,value jsonb);
INSERT INTO auto_potion_public_capture VALUES ('reserved',:'potion_reserved'::jsonb);
DO $test$
BEGIN
  IF (SELECT value->'reservations'->0->>'status'
    FROM auto_potion_public_capture WHERE kind='reserved')<>'reserved' THEN
    RAISE EXCEPTION 'AUTO_POTION_FIXTURE_NOT_RESERVED'; END IF;
END $test$;
SELECT pg_sleep(greatest(0,extract(epoch FROM
  (SELECT r.event_at-clock_timestamp()+interval '200 milliseconds'
     FROM app_private.adventure_auto_potion_receipts r
    WHERE r.user_id='a0000000-0000-0000-0000-00000000b909' LIMIT 1))));
SET ROLE authenticated;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000b909';
SELECT public.get_adventure_auto_potions_state() AS used \gset potion_
RESET ROLE;
INSERT INTO auto_potion_public_capture VALUES ('used',:'potion_used'::jsonb);
DO $test$
BEGIN
  IF (SELECT value->'reservations'->0->>'status'
    FROM auto_potion_public_capture WHERE kind='used')<>'used' THEN
    RAISE EXCEPTION 'AUTO_POTION_FIXTURE_NOT_USED'; END IF;
END $test$;
SELECT jsonb_pretty(jsonb_build_object(
  'hp_event',(SELECT x FROM app_private.adventure_battles b,
      LATERAL jsonb_array_elements(b.events) x
      WHERE b.user_id='a0000000-0000-0000-0000-00000000b909'
        AND x->>'skill_id'='consumable.hp' LIMIT 1),
  'mp_event',(SELECT x FROM app_private.adventure_battles b,
      LATERAL jsonb_array_elements(b.events) x
      WHERE b.user_id='a0000000-0000-0000-0000-00000000b903'
        AND x->>'skill_id'='consumable.mp' LIMIT 1),
  'state_reserved',(SELECT value FROM auto_potion_public_capture WHERE kind='reserved'),
  'state_used',(SELECT value FROM auto_potion_public_capture WHERE kind='used')));
