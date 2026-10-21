-- Apply after the 20261020 engine and reduced motor fixture, before v3.
INSERT INTO auth.users(id) VALUES('aaaaaaaa-0000-0000-0000-000000000001');
INSERT INTO public.profiles(user_id,level,starter_class)
VALUES('aaaaaaaa-0000-0000-0000-000000000001',50,'guerreiro');
INSERT INTO public.attributes(user_id,name,level)
VALUES('aaaaaaaa-0000-0000-0000-000000000001','forca',5);
SET ROLE authenticated;
SET request.jwt.claim.sub='aaaaaaaa-0000-0000-0000-000000000001';
SELECT public.sync_auto_adventure();
RESET ROLE;
