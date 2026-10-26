INSERT INTO auth.users(id) VALUES ('c0000000-0000-0000-0000-000000000001');
INSERT INTO public.profiles(user_id,level,starter_class,total_xp)
VALUES ('c0000000-0000-0000-0000-000000000001',50,'guerreiro',900);
INSERT INTO public.user_balance(user_id,gold)
VALUES ('c0000000-0000-0000-0000-000000000001',100)
ON CONFLICT(user_id) DO UPDATE SET gold=EXCLUDED.gold;
INSERT INTO public.companions(id,user_id,companion_type,origin,name) VALUES
  ('c0000000-0000-0000-0000-000000000011',
   'c0000000-0000-0000-0000-000000000001','mini_kraken','audit_one','One'),
  ('c0000000-0000-0000-0000-000000000012',
   'c0000000-0000-0000-0000-000000000001','mini_necromante','audit_two','Two');
INSERT INTO app_private.adventure_pet_allowlist(user_id)
VALUES ('c0000000-0000-0000-0000-000000000001');
