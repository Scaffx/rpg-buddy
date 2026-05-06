-- ================================================================
-- Leaderboard: Streak + Campeões por Classe
-- ================================================================
-- Adiciona 2 RPCs novas para a tela de Ranking:
--   1) get_streak_leaderboard       — top jogadores por current_streak
--   2) get_class_champions          — #1 jogador (por XP) de cada classe
--
-- Mesma assinatura visual das outras RPCs do leaderboard:
-- SECURITY DEFINER, STABLE, retornando classe atual via JOIN com classes.

-- ── Streak leaderboard (global) ───────────────────────────────────
CREATE OR REPLACE FUNCTION get_streak_leaderboard(p_limit int DEFAULT 100)
RETURNS TABLE (
  user_id            uuid,
  display_name       text,
  total_xp           int,
  level              int,
  starter_class      text,
  current_class_name text,
  avatar_url         text,
  current_streak     int
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT p.user_id, p.display_name, p.total_xp, p.level, p.starter_class,
         c.name AS current_class_name, p.avatar_url,
         COALESCE(p.current_streak, 0) AS current_streak
  FROM public.profiles p
  LEFT JOIN public.classes c ON c.id = p.current_class_id
  WHERE COALESCE(p.current_streak, 0) > 0
  ORDER BY p.current_streak DESC NULLS LAST, p.total_xp DESC
  LIMIT p_limit;
$$;

-- ── Streak leaderboard (regional) ─────────────────────────────────
CREATE OR REPLACE FUNCTION get_regional_streak_leaderboard(p_region text, p_limit int DEFAULT 100)
RETURNS TABLE (
  user_id            uuid,
  display_name       text,
  total_xp           int,
  level              int,
  starter_class      text,
  current_class_name text,
  avatar_url         text,
  current_streak     int
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT p.user_id, p.display_name, p.total_xp, p.level, p.starter_class,
         c.name AS current_class_name, p.avatar_url,
         COALESCE(p.current_streak, 0) AS current_streak
  FROM public.profiles p
  LEFT JOIN public.classes c ON c.id = p.current_class_id
  WHERE p.region = p_region
    AND COALESCE(p.current_streak, 0) > 0
  ORDER BY p.current_streak DESC NULLS LAST, p.total_xp DESC
  LIMIT p_limit;
$$;

-- ── Class champions: #1 de cada classe (por XP) ──────────────────
-- Retorna apenas o líder de cada starter_class — um overview rápido
-- pra ver quem está dominando cada classe sem precisar selecionar
-- uma de cada vez no dropdown.
CREATE OR REPLACE FUNCTION get_class_champions()
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
  WITH ranked AS (
    SELECT
      p.user_id, p.display_name, p.total_xp, p.level, p.starter_class,
      c.name AS current_class_name, p.avatar_url,
      ROW_NUMBER() OVER (
        PARTITION BY p.starter_class
        ORDER BY p.total_xp DESC, p.user_id ASC
      ) AS rn
    FROM public.profiles p
    LEFT JOIN public.classes c ON c.id = p.current_class_id
    WHERE p.starter_class IS NOT NULL
  )
  SELECT user_id, display_name, total_xp, level, starter_class,
         current_class_name, avatar_url
  FROM ranked
  WHERE rn = 1
  ORDER BY total_xp DESC;
$$;

-- ── Class champions (regional) ───────────────────────────────────
CREATE OR REPLACE FUNCTION get_regional_class_champions(p_region text)
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
  WITH ranked AS (
    SELECT
      p.user_id, p.display_name, p.total_xp, p.level, p.starter_class,
      c.name AS current_class_name, p.avatar_url,
      ROW_NUMBER() OVER (
        PARTITION BY p.starter_class
        ORDER BY p.total_xp DESC, p.user_id ASC
      ) AS rn
    FROM public.profiles p
    LEFT JOIN public.classes c ON c.id = p.current_class_id
    WHERE p.region = p_region
      AND p.starter_class IS NOT NULL
  )
  SELECT user_id, display_name, total_xp, level, starter_class,
         current_class_name, avatar_url
  FROM ranked
  WHERE rn = 1
  ORDER BY total_xp DESC;
$$;

GRANT EXECUTE ON FUNCTION get_streak_leaderboard(int)             TO authenticated;
GRANT EXECUTE ON FUNCTION get_regional_streak_leaderboard(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION get_class_champions()                   TO authenticated;
GRANT EXECUTE ON FUNCTION get_regional_class_champions(text)      TO authenticated;

NOTIFY pgrst, 'reload schema';
