\set ON_ERROR_STOP on
INSERT INTO auth.users(id) VALUES ('c0000000-0000-0000-0000-000000000401');
INSERT INTO public.profiles(user_id,level,starter_class,total_xp)
VALUES('c0000000-0000-0000-0000-000000000401',10,'novato',700);
INSERT INTO public.user_balance(user_id,balance_percent,gold)
VALUES('c0000000-0000-0000-0000-000000000401',100,300)
ON CONFLICT (user_id) DO UPDATE SET gold=300;
INSERT INTO public.companions(id,user_id,companion_type,origin,name)
VALUES('d0000000-0000-0000-0000-000000000401',
  'c0000000-0000-0000-0000-000000000401','dog','shop','Concurrent');
UPDATE app_private.pet_care_state SET baseline_at=clock_timestamp()-interval '72 hours',
  last_care_at=clock_timestamp()-interval '72 hours'
WHERE companion_id='d0000000-0000-0000-0000-000000000401';
