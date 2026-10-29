\set ON_ERROR_STOP on
CREATE OR REPLACE FUNCTION app_private.adventure_simulate_horde(
  p_start timestamptz,p_attack integer,p_defense integer,p_max_hp integer,
  p_max_mp integer,p_enemies jsonb,p_skills jsonb,p_default_effect text,
  p_rotation integer,p_sustain jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT '[]'::jsonb
$$;
