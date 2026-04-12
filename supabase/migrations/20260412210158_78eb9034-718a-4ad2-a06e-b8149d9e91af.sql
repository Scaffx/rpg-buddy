CREATE OR REPLACE FUNCTION public.get_rankings(p_region text DEFAULT NULL::text)
 RETURNS TABLE(user_id uuid, display_name text, level integer, total_xp integer, region text, avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT 
    p.user_id,
    COALESCE(p.display_name, 'Aventureiro') as display_name,
    p.level,
    p.total_xp,
    p.region,
    p.avatar_url
  FROM public.profiles p
  WHERE (p_region IS NULL OR p.region = p_region)
  ORDER BY p.level DESC, p.total_xp DESC
  LIMIT 100;
$$;