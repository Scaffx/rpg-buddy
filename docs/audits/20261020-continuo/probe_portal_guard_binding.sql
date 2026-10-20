-- Same trigger name and enabled state, but a different function binding.
CREATE FUNCTION public._guard_profiles_economy_dummy()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
DROP TRIGGER guard_profiles_economy ON public.profiles;
CREATE TRIGGER guard_profiles_economy BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public._guard_profiles_economy_dummy();
