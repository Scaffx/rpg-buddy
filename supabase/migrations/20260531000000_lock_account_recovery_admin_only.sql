-- ================================================================
-- Account Recovery lockdown — torna a recuperação de conta admin-only.
--
-- Contexto: a versão anterior de `get_orphaned_profiles()` era concedida
-- a `anon` e devolvia a lista de TODOS os perfis legados (com seus
-- old_user_id). Combinado com a Edge Function `recover-account`, que não
-- validava a posse da conta, qualquer usuário podia reivindicar (e destruir)
-- o perfil de qualquer vítima — takeover completo de conta.
--
-- Decisão: recuperação passa a ser um procedimento manual, executado apenas
-- por administradores do sistema (app_metadata.role = 'admin'), após
-- verificação de identidade pelo suporte.
-- ================================================================

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
  -- Apenas administradores do sistema podem listar perfis órfãos.
  -- Para qualquer outro chamador, retorna vazio — não vaza alvos de takeover.
  IF NOT public.is_system_admin() THEN
    RETURN;
  END IF;

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

-- Remove acesso anônimo; mantém apenas authenticated (a função já filtra
-- internamente por is_system_admin(), então usuários comuns recebem vazio).
REVOKE EXECUTE ON FUNCTION public.get_orphaned_profiles() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_orphaned_profiles() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_orphaned_profiles() TO authenticated;
