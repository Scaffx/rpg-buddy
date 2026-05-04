-- ================================================================
-- Funções RPC para Ranking (Leaderboard) com SECURITY DEFINER
-- Bypass de RLS para exibir todos os usuários no ranking.
-- ================================================================

-- ── Global leaderboard ────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_global_leaderboard(p_limit int DEFAULT 100)
RETURNS TABLE (
  user_id     uuid,
  display_name text,
  total_xp    int,
  level       int,
  starter_class text,
  avatar_url  text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT user_id, display_name, total_xp, level, starter_class, avatar_url
  FROM public.profiles
  ORDER BY total_xp DESC
  LIMIT p_limit;
$$;

-- ── Regional leaderboard ─────────────────────────────────────
CREATE OR REPLACE FUNCTION get_regional_leaderboard(p_region text, p_limit int DEFAULT 100)
RETURNS TABLE (
  user_id     uuid,
  display_name text,
  total_xp    int,
  level       int,
  starter_class text,
  avatar_url  text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT user_id, display_name, total_xp, level, starter_class, avatar_url
  FROM public.profiles
  WHERE region = p_region
  ORDER BY total_xp DESC
  LIMIT p_limit;
$$;

-- ── Class leaderboard (global) ────────────────────────────────
CREATE OR REPLACE FUNCTION get_class_leaderboard(p_class text, p_limit int DEFAULT 100)
RETURNS TABLE (
  user_id     uuid,
  display_name text,
  total_xp    int,
  level       int,
  starter_class text,
  avatar_url  text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT user_id, display_name, total_xp, level, starter_class, avatar_url
  FROM public.profiles
  WHERE starter_class = p_class
  ORDER BY total_xp DESC
  LIMIT p_limit;
$$;

-- ── Class leaderboard (regional) ─────────────────────────────
CREATE OR REPLACE FUNCTION get_regional_class_leaderboard(p_region text, p_class text, p_limit int DEFAULT 100)
RETURNS TABLE (
  user_id     uuid,
  display_name text,
  total_xp    int,
  level       int,
  starter_class text,
  avatar_url  text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT user_id, display_name, total_xp, level, starter_class, avatar_url
  FROM public.profiles
  WHERE region = p_region
    AND starter_class = p_class
  ORDER BY total_xp DESC
  LIMIT p_limit;
$$;

-- ── Weekly leaderboard (global) ───────────────────────────────
-- Conta missões concluídas nos últimos 7 dias por usuário
CREATE OR REPLACE FUNCTION get_weekly_leaderboard(p_limit int DEFAULT 100)
RETURNS TABLE (
  user_id      uuid,
  display_name text,
  total_xp     int,
  level        int,
  starter_class text,
  avatar_url   text,
  weekly_count bigint
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    p.user_id,
    p.display_name,
    p.total_xp,
    p.level,
    p.starter_class,
    p.avatar_url,
    COUNT(a.user_id) AS weekly_count
  FROM public.profiles p
  LEFT JOIN public.activity_log a
    ON a.user_id = p.user_id
    AND a.action = 'mission_completed'
    AND a.created_at >= (NOW() - INTERVAL '7 days')
  GROUP BY p.user_id, p.display_name, p.total_xp, p.level, p.starter_class, p.avatar_url
  HAVING COUNT(a.user_id) > 0
  ORDER BY weekly_count DESC
  LIMIT p_limit;
$$;

-- ── Weekly leaderboard (regional) ────────────────────────────
CREATE OR REPLACE FUNCTION get_regional_weekly_leaderboard(p_region text, p_limit int DEFAULT 100)
RETURNS TABLE (
  user_id      uuid,
  display_name text,
  total_xp     int,
  level        int,
  starter_class text,
  avatar_url   text,
  weekly_count bigint
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    p.user_id,
    p.display_name,
    p.total_xp,
    p.level,
    p.starter_class,
    p.avatar_url,
    COUNT(a.user_id) AS weekly_count
  FROM public.profiles p
  LEFT JOIN public.activity_log a
    ON a.user_id = p.user_id
    AND a.action = 'mission_completed'
    AND a.created_at >= (NOW() - INTERVAL '7 days')
  WHERE p.region = p_region
  GROUP BY p.user_id, p.display_name, p.total_xp, p.level, p.starter_class, p.avatar_url
  HAVING COUNT(a.user_id) > 0
  ORDER BY weekly_count DESC
  LIMIT p_limit;
$$;

-- Permissões para usuários autenticados chamarem as funções
GRANT EXECUTE ON FUNCTION get_global_leaderboard(int)           TO authenticated;
GRANT EXECUTE ON FUNCTION get_regional_leaderboard(text, int)   TO authenticated;
GRANT EXECUTE ON FUNCTION get_class_leaderboard(text, int)      TO authenticated;
GRANT EXECUTE ON FUNCTION get_regional_class_leaderboard(text, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION get_weekly_leaderboard(int)           TO authenticated;
GRANT EXECUTE ON FUNCTION get_regional_weekly_leaderboard(text, int) TO authenticated;
