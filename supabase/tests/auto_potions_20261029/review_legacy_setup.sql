\set ON_ERROR_STOP on
INSERT INTO auth.users(id) VALUES
  ('a0000000-0000-0000-0000-00000000b90a'),
  ('a0000000-0000-0000-0000-00000000b90b');
INSERT INTO public.profiles(user_id,level,starter_class) VALUES
  ('a0000000-0000-0000-0000-00000000b90a',1,'novato'),
  ('a0000000-0000-0000-0000-00000000b90b',1,'novato');
INSERT INTO public.adventure_state(user_id,stage,last_tick_at) VALUES
  ('a0000000-0000-0000-0000-00000000b90a',15,clock_timestamp()),
  ('a0000000-0000-0000-0000-00000000b90b',15,clock_timestamp());
INSERT INTO public.user_inventory(user_id,item_id,quantity,equipped) VALUES
  ('a0000000-0000-0000-0000-00000000b90a','36aa16a5-153d-4c08-941e-ae3ee51d54d4',1,false),
  ('a0000000-0000-0000-0000-00000000b90b','36aa16a5-153d-4c08-941e-ae3ee51d54d4',1,false);
INSERT INTO app_private.adventure_auto_potion_selection(user_id,enabled,effective_at) VALUES
  ('a0000000-0000-0000-0000-00000000b90a',true,clock_timestamp()-interval '1 minute'),
  ('a0000000-0000-0000-0000-00000000b90b',true,clock_timestamp()-interval '1 minute');
