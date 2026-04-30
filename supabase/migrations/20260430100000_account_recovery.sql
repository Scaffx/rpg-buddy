-- ================================================================
-- Account Recovery: permite que usuários antigos recuperem seus dados
-- após re-cadastro no novo projeto Supabase.
-- ================================================================

-- Função que retorna perfis "órfãos" (importados via script de migração)
-- Identificados pelo email placeholder: migrated_*@rpgbuddy.import
CREATE OR REPLACE FUNCTION public.get_orphaned_profiles()
RETURNS TABLE (
  old_user_id  uuid,
  display_name text,
  level        integer,
  total_xp     integer,
  avatar_url   text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT
      p.user_id,
      p.display_name,
      p.level,
      p.total_xp,
      p.avatar_url
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.user_id
    WHERE u.email LIKE 'migrated_%@rpgbuddy.import'
    ORDER BY p.level DESC, p.total_xp DESC;
END;
$$;

-- Acesso público (a função usa SECURITY DEFINER, dados não são sensíveis)
GRANT EXECUTE ON FUNCTION public.get_orphaned_profiles() TO anon, authenticated;
