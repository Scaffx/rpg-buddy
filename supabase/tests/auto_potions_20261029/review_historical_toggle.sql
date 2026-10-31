\set ON_ERROR_STOP on
INSERT INTO auth.users(id) VALUES ('a0000000-0000-0000-0000-00000000b90c');
INSERT INTO public.profiles(user_id,level,starter_class) VALUES
  ('a0000000-0000-0000-0000-00000000b90c',1,'novato');
INSERT INTO public.adventure_state(user_id,stage,last_tick_at) VALUES
  ('a0000000-0000-0000-0000-00000000b90c',15,clock_timestamp());
SET ROLE authenticated;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000b90c';
SELECT public.sync_auto_adventure() AS prior \gset review_
RESET ROLE;
UPDATE app_private.adventure_battles b SET
  started_at=b.started_at-interval '4 minutes',
  ends_at=b.ends_at-interval '4 minutes',
  events=(SELECT jsonb_agg(jsonb_set(e.x,'{at}',
    to_jsonb((e.x->>'at')::timestamptz-interval '4 minutes')) ORDER BY e.n)
    FROM jsonb_array_elements(b.events) WITH ORDINALITY e(x,n))
  WHERE b.user_id='a0000000-0000-0000-0000-00000000b90c';
INSERT INTO public.user_inventory(user_id,item_id,quantity,equipped) VALUES
  ('a0000000-0000-0000-0000-00000000b90c','36aa16a5-153d-4c08-941e-ae3ee51d54d4',3,false);
SET ROLE authenticated;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000b90c';
SELECT public.set_adventure_auto_potions_enabled(true) AS enabled \gset review_
SELECT public.sync_auto_adventure() AS offline \gset review_
RESET ROLE;
DO $review$
DECLARE v_effective timestamptz; v_old_count integer;
BEGIN
  SELECT effective_at INTO STRICT v_effective FROM app_private.adventure_auto_potion_selection
    WHERE user_id='a0000000-0000-0000-0000-00000000b90c';
  SELECT count(*) INTO v_old_count FROM app_private.adventure_battles b
    WHERE b.user_id='a0000000-0000-0000-0000-00000000b90c'
      AND b.started_at<v_effective;
  IF v_old_count<2 OR EXISTS (
    SELECT 1 FROM app_private.adventure_auto_potion_receipts r
      JOIN app_private.adventure_battles b ON b.id=r.battle_id
    WHERE r.user_id='a0000000-0000-0000-0000-00000000b90c'
      AND b.started_at<v_effective)
  THEN RAISE EXCEPTION 'REVIEW_RETROACTIVE_TOGGLE: old_battles=%',v_old_count; END IF;
  RAISE NOTICE 'REVIEW_NO_RETROACTIVE_TOGGLE_PASS old_battles=%',v_old_count;
END $review$;
