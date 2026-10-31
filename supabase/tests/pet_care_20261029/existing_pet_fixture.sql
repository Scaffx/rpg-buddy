\set ON_ERROR_STOP on
INSERT INTO auth.users(id) VALUES('c0000000-0000-0000-0000-000000000001');
INSERT INTO public.profiles(user_id,level,starter_class)
VALUES('c0000000-0000-0000-0000-000000000001',10,'novato');
INSERT INTO public.companions(id,user_id,companion_type,origin,name,created_at)
VALUES('d0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001','dog','lvl3_choice','Legacy',
  '2026-10-20 00:00:00+00');
