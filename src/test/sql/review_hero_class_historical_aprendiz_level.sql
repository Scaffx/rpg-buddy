\set ON_ERROR_STOP on
-- Run before the class migration. Level 5 may still await human advancement.
INSERT INTO public.profiles(user_id,level,onboarding_completed,starter_class,
  starter_item,current_class_id,display_name)
VALUES
  ('00000000-0000-0000-0000-000000000014',4,true,'mago',
   'Grimorio Basico','00000001-0000-0000-0000-000000000001',
   'Aprendiz nível 4'),
  ('00000000-0000-0000-0000-000000000015',5,true,'mago',
   'Grimorio Basico','00000001-0000-0000-0000-000000000001',
   'Aprendiz aguardando evolução'),
  ('00000000-0000-0000-0000-000000000016',5,false,NULL,NULL,
   '00000001-0000-0000-0000-000000000001',
   'Aprendiz sem classe inicial');
