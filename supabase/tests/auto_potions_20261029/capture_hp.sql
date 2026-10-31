\set ON_ERROR_STOP on
INSERT INTO auth.users(id) VALUES ('a0000000-0000-0000-0000-00000000b912');
INSERT INTO public.profiles(user_id,level,starter_class) VALUES
  ('a0000000-0000-0000-0000-00000000b912',1,'novato');
INSERT INTO public.adventure_state(user_id,stage,last_tick_at) VALUES
  ('a0000000-0000-0000-0000-00000000b912',15,clock_timestamp());
INSERT INTO public.user_inventory(user_id,item_id,quantity,equipped) VALUES
  ('a0000000-0000-0000-0000-00000000b912','36aa16a5-153d-4c08-941e-ae3ee51d54d4',1,false);
INSERT INTO app_private.adventure_auto_potion_selection(user_id,enabled,effective_at) VALUES
  ('a0000000-0000-0000-0000-00000000b912',true,clock_timestamp()-interval '1 minute');
SET ROLE authenticated;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000b912';
SELECT public.sync_auto_adventure() AS response \gset potion_
RESET ROLE;
SELECT jsonb_pretty(:'potion_response'::jsonb);
