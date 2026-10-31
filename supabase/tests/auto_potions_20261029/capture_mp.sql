\set ON_ERROR_STOP on
INSERT INTO auth.users(id) VALUES ('a0000000-0000-0000-0000-00000000b913');
INSERT INTO public.profiles(user_id,level,starter_class,current_class_id,combat_skill_loadout)
VALUES ('a0000000-0000-0000-0000-00000000b913',1,'mago',
  '00000002-0000-0000-0000-000000000002','[{"id":"auto_potion_mp_probe"}]');
INSERT INTO public.player_skill_nodes(user_id,node_id,rank) VALUES
  ('a0000000-0000-0000-0000-00000000b913','auto_potion_mp_probe',1);
INSERT INTO public.adventure_state(user_id,stage,last_tick_at) VALUES
  ('a0000000-0000-0000-0000-00000000b913',15,clock_timestamp());
INSERT INTO public.user_inventory(user_id,item_id,quantity,equipped) VALUES
  ('a0000000-0000-0000-0000-00000000b913','ea63052e-8530-4c4e-98ed-9d62a9cbf781',1,false);
INSERT INTO app_private.adventure_auto_potion_selection(user_id,enabled,effective_at) VALUES
  ('a0000000-0000-0000-0000-00000000b913',true,clock_timestamp()-interval '1 minute');
SET ROLE authenticated;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000b913';
SELECT public.sync_auto_adventure() AS response \gset potion_
RESET ROLE;
SELECT jsonb_pretty(:'potion_response'::jsonb);
