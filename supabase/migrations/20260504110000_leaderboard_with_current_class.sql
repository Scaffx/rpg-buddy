-- ================================================================
-- Leaderboard RPCs — adiciona current_class_name via JOIN com classes
-- ================================================================

CREATE OR REPLACE FUNCTION get_global_leaderboard(p_limit int DEFAULT 100)
RETURNS TABLE (
  user_id            uuid,
  display_name       text,
  total_xp           int,
  level              int,
  starter_class      text,
  current_class_name text,
  avatar_url         text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT p.user_id, p.display_name, p.total_xp, p.level, p.starter_class,
         c.name AS current_class_name, p.avatar_url
  FROM public.profiles p
  LEFT JOIN public.classes c ON c.id = p.current_class_id
  ORDER BY p.total_xp DESC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION get_regional_leaderboard(p_region text, p_limit int DEFAULT 100)
RETURNS TABLE (
  user_id            uuid,
  display_name       text,
  total_xp           int,
  level              int,
  starter_class      text,
  current_class_name text,
  avatar_url         text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT p.user_id, p.display_name, p.total_xp, p.level, p.starter_class,
         c.name AS current_class_name, p.avatar_url
  FROM public.profiles p
  LEFT JOIN public.classes c ON c.id = p.current_class_id
  WHERE p.region = p_region
  ORDER BY p.total_xp DESC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION get_class_leaderboard(p_class text, p_limit int DEFAULT 100)
RETURNS TABLE (
  user_id            uuid,
  display_name       text,
  total_xp           int,
  level              int,
  starter_class      text,
  current_class_name text,
  avatar_url         text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT p.user_id, p.display_name, p.total_xp, p.level, p.starter_class,
         c.name AS current_class_name, p.avatar_url
  FROM public.profiles p
  LEFT JOIN public.classes c ON c.id = p.current_class_id
  WHERE p.starter_class = p_class
  ORDER BY p.total_xp DESC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION get_regional_class_leaderboard(p_region text, p_class text, p_limit int DEFAULT 100)
RETURNS TABLE (
  user_id            uuid,
  display_name       text,
  total_xp           int,
  level              int,
  starter_class      text,
  current_class_name text,
  avatar_url         text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT p.user_id, p.display_name, p.total_xp, p.level, p.starter_class,
         c.name AS current_class_name, p.avatar_url
  FROM public.profiles p
  LEFT JOIN public.classes c ON c.id = p.current_class_id
  WHERE p.region = p_region
    AND p.starter_class = p_class
  ORDER BY p.total_xp DESC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION get_weekly_leaderboard(p_limit int DEFAULT 100)
RETURNS TABLE (
  user_id            uuid,
  display_name       text,
  total_xp           int,
  level              int,
  starter_class      text,
  current_class_name text,
  avatar_url         text,
  weekly_count       bigint
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT p.user_id, p.display_name, p.total_xp, p.level, p.starter_class,
         c.name AS current_class_name, p.avatar_url,
         COUNT(a.user_id) AS weekly_count
  FROM public.profiles p
  LEFT JOIN public.classes c ON c.id = p.current_class_id
  LEFT JOIN public.activity_log a
    ON a.user_id = p.user_id
    AND a.action = 'mission_completed'
    AND a.created_at >= (NOW() - INTERVAL '7 days')
  GROUP BY p.user_id, p.display_name, p.total_xp, p.level, p.starter_class, c.name, p.avatar_url
  HAVING COUNT(a.user_id) > 0
  ORDER BY weekly_count DESC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION get_regional_weekly_leaderboard(p_region text, p_limit int DEFAULT 100)
RETURNS TABLE (
  user_id            uuid,
  display_name       text,
  total_xp           int,
  level              int,
  starter_class      text,
  current_class_name text,
  avatar_url         text,
  weekly_count       bigint
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT p.user_id, p.display_name, p.total_xp, p.level, p.starter_class,
         c.name AS current_class_name, p.avatar_url,
         COUNT(a.user_id) AS weekly_count
  FROM public.profiles p
  LEFT JOIN public.classes c ON c.id = p.current_class_id
  LEFT JOIN public.activity_log a
    ON a.user_id = p.user_id
    AND a.action = 'mission_completed'
    AND a.created_at >= (NOW() - INTERVAL '7 days')
  WHERE p.region = p_region
  GROUP BY p.user_id, p.display_name, p.total_xp, p.level, p.starter_class, c.name, p.avatar_url
  HAVING COUNT(a.user_id) > 0
  ORDER BY weekly_count DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION get_global_leaderboard(int)                        TO authenticated;
GRANT EXECUTE ON FUNCTION get_regional_leaderboard(text, int)                TO authenticated;
GRANT EXECUTE ON FUNCTION get_class_leaderboard(text, int)                   TO authenticated;
GRANT EXECUTE ON FUNCTION get_regional_class_leaderboard(text, text, int)    TO authenticated;
GRANT EXECUTE ON FUNCTION get_weekly_leaderboard(int)                        TO authenticated;
GRANT EXECUTE ON FUNCTION get_regional_weekly_leaderboard(text, int)         TO authenticated;
