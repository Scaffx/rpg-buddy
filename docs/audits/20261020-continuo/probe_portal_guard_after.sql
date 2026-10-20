SELECT 'trigger_enabled=' || t.tgenabled::text || ' function=' || t.tgfoid::regprocedure::text
FROM pg_trigger t WHERE t.tgrelid='public.profiles'::regclass AND t.tgname='guard_profiles_economy';
SET ROLE authenticated;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000006';
UPDATE public.profiles SET level=50 WHERE user_id=auth.uid();
SELECT 'forged_level=' || level FROM public.profiles WHERE user_id=auth.uid();
SELECT 'ultra_created=' || (public.portal_coop_create('fragments','ultra',NULL,
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa46',NULL)->>'session_id')::uuid AS result;
RESET ROLE;
