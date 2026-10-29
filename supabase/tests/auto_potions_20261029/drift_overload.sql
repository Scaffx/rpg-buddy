\set ON_ERROR_STOP on
CREATE FUNCTION public.get_adventure_auto_potions_state(p_probe integer)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$ SELECT '{}'::jsonb $$;
