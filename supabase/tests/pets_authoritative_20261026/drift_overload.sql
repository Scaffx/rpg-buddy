-- An existing overload of the incoming public RPC must fail preflight.
CREATE FUNCTION public.set_active_adventure_pet(p_companion_id text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=''
AS $$ SELECT '{}'::jsonb $$;
GRANT EXECUTE ON FUNCTION public.set_active_adventure_pet(text) TO anon;
DO $drift$
BEGIN
  IF NOT has_function_privilege('anon','public.set_active_adventure_pet(text)','EXECUTE')
  THEN RAISE EXCEPTION 'OVERLOAD_DRIFT_NOT_CREATED'; END IF;
END $drift$;
