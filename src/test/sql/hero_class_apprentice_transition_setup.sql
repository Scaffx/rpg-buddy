\set ON_ERROR_STOP on
-- Apply after the reduced authority fixture, before the class migration.
-- User 4 has no starter ledger; user 5 has a chosen starter and a pending
-- Aprendiz -> Mago promotion. Neither profile should be rewritten by seed.
INSERT INTO public.profiles(user_id,level,onboarding_completed,starter_class,
  starter_item,current_class_id,display_name)
VALUES
  ('00000000-0000-0000-0000-000000000004',5,true,NULL,NULL,
   '00000001-0000-0000-0000-000000000001','Aprendiz sem base'),
  ('00000000-0000-0000-0000-000000000005',4,true,'mago','Grimorio Basico',
   '00000001-0000-0000-0000-000000000001','Aprendiz com base');
