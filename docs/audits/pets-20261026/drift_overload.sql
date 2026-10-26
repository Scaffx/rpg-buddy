-- An existing overload with the new RPC name must not survive the migration.
CREATE FUNCTION public.set_active_adventure_pet(p_companion_id text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=''
AS $$ SELECT '{}'::jsonb $$;
GRANT EXECUTE ON FUNCTION public.set_active_adventure_pet(text) TO anon;
