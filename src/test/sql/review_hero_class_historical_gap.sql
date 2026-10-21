-- Run before migration. Historical row has a class tier jump 2 -> 4.
-- A correct ancestry seed must reject it without changing the profile.
UPDATE public.classes SET column_index=4,level_min=35
WHERE id='00000003-0000-0000-0000-000000000003';
INSERT INTO public.profiles(user_id,level,onboarding_completed,starter_class,
  starter_item,current_class_id,display_name)
VALUES('00000000-0000-0000-0000-000000000005',35,true,'mago',
  'Grimorio Basico','00000003-0000-0000-0000-000000000003','Gap tier histórico');
