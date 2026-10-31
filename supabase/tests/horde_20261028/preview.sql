\set ON_ERROR_STOP on
-- IDs artificiais. Apenas PostgreSQL 17 local; nenhuma identidade real.
INSERT INTO auth.users(id) VALUES
  ('a0000000-0000-0000-0000-00000000a411'),
  ('a0000000-0000-0000-0000-00000000a412');
INSERT INTO public.profiles(user_id,level,starter_class,current_class_id,combat_skill_loadout)
VALUES
  ('a0000000-0000-0000-0000-00000000a411',20,'mago',
    '00000002-0000-0000-0000-000000000002',
    jsonb_build_array(jsonb_build_object('id','aprendiz-golpe'),
      jsonb_build_object('id','m_dardo'))),
  ('a0000000-0000-0000-0000-00000000a412',40,'mago',
    '00000002-0000-0000-0000-000000000002',
    jsonb_build_array(jsonb_build_object('id','aprendiz-golpe'),
      jsonb_build_object('id','m_dardo')));
INSERT INTO public.player_skill_nodes(user_id,node_id,rank) VALUES
  ('a0000000-0000-0000-0000-00000000a411','aprendiz-golpe',1),
  ('a0000000-0000-0000-0000-00000000a411','m_dardo',1),
  ('a0000000-0000-0000-0000-00000000a412','aprendiz-golpe',1),
  ('a0000000-0000-0000-0000-00000000a412','m_dardo',1);
INSERT INTO public.adventure_state(user_id,last_tick_at,stage)
  VALUES('a0000000-0000-0000-0000-00000000a412',clock_timestamp(),10);
SET ROLE authenticated;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000a411';
DO $$ BEGIN PERFORM public.sync_auto_adventure(); END $$;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000a412';
DO $$ BEGIN PERFORM public.sync_auto_adventure(); END $$;
RESET ROLE;
