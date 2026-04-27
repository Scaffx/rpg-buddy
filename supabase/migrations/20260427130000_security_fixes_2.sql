-- ═══════════════════════════════════════════════════════════════════════════════
-- SECURITY FIXES 2 — Lovable audit 2026-04-27 (round 2)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. subscription_access_keys: RLS completo
--    Somente o webhook (service_role) pode criar chaves (INSERT).
--    Somente o recipient pode resgatar (UPDATE status/redeemed_at).
--    Somente o dono pode deletar (DELETE).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.subscription_access_keys ENABLE ROW LEVEL SECURITY;

-- INSERT: bloqueado para authenticated — chaves são criadas pelo webhook server-side
DROP POLICY IF EXISTS "No direct insert on access keys" ON public.subscription_access_keys;
CREATE POLICY "No direct insert on access keys"
  ON public.subscription_access_keys
  FOR INSERT
  WITH CHECK (false);

-- UPDATE: somente o dono ou o destinatário podem atualizar
--   - dono: pode revogar (status = 'revoked') ou gerenciar
--   - recipient: pode resgatar (status = 'redeemed', redeemed_at, recipient_user_id)
DROP POLICY IF EXISTS "Owner or recipient can update access key" ON public.subscription_access_keys;
CREATE POLICY "Owner or recipient can update access key"
  ON public.subscription_access_keys
  FOR UPDATE
  USING (
    auth.uid() = owner_user_id
    OR auth.uid() = recipient_user_id
  )
  WITH CHECK (
    auth.uid() = owner_user_id
    OR auth.uid() = recipient_user_id
  );

-- DELETE: somente o dono pode apagar
DROP POLICY IF EXISTS "Owner can delete access key" ON public.subscription_access_keys;
CREATE POLICY "Owner can delete access key"
  ON public.subscription_access_keys
  FOR DELETE
  USING (auth.uid() = owner_user_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Funções SECURITY DEFINER ainda sem search_path fixo
--    Corrige todas as funções que o linter ainda aponta.
-- ─────────────────────────────────────────────────────────────────────────────

-- handle_new_user (trigger de criação de perfil) já tem SET search_path = public
-- Reforça para garantir que a versão mais recente no banco também tem.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', 'Aventureiro'))
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.attributes (user_id, name, icon, xp, level) VALUES
    (NEW.id, 'Agilidade',           '⚡', 0, 1),
    (NEW.id, 'Carisma',             '👤', 0, 1),
    (NEW.id, 'Criatividade',        '🎨', 0, 1),
    (NEW.id, 'Disciplina',          '✨', 0, 1),
    (NEW.id, 'Força',               '💪', 0, 1),
    (NEW.id, 'Inteligência',        '🧠', 0, 1),
    (NEW.id, 'Resiliência',         '🛡️', 0, 1),
    (NEW.id, 'Sabedoria',           '📚', 0, 1),
    (NEW.id, 'Vitalidade',          '❤️', 0, 1),
    (NEW.id, 'Autoaperfeiçoamento', '⭐', 0, 1),
    (NEW.id, 'Relacionamento',      '💜', 0, 1)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

-- sync_health_on_profile_level_change — já tem search_path, reforça
CREATE OR REPLACE FUNCTION public.sync_health_on_profile_level_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_max_hp INTEGER;
BEGIN
  IF NEW.level IS NULL THEN RETURN NEW; END IF;

  target_max_hp := 120 + (GREATEST(NEW.level, 1) * 8);

  IF TG_OP = 'UPDATE' AND NEW.level > COALESCE(OLD.level, 1) THEN
    INSERT INTO public.user_health_stats (user_id, max_hp, current_hp, fatigue, last_reset_date)
    VALUES (NEW.user_id, target_max_hp, target_max_hp, 0, CURRENT_DATE)
    ON CONFLICT (user_id)
    DO UPDATE SET
      max_hp           = EXCLUDED.max_hp,
      current_hp       = EXCLUDED.current_hp,
      last_reset_date  = EXCLUDED.last_reset_date,
      updated_at       = now();
  END IF;

  RETURN NEW;
END;
$$;

-- get_rankings — search_path já correto na migration anterior, reforça REVOKE de anon
REVOKE EXECUTE ON FUNCTION public.get_rankings(text) FROM anon;

-- list_system_feedback_admin — corrige search_path se necessário
CREATE OR REPLACE FUNCTION public.list_system_feedback_admin()
RETURNS TABLE (
  id UUID, user_id UUID, title TEXT, message TEXT,
  status TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_system_admin() THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
  SELECT sf.id, sf.user_id, sf.title, sf.message, sf.status, sf.created_at, sf.updated_at
  FROM public.system_feedback sf
  ORDER BY sf.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_system_feedback_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_system_feedback_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.list_system_feedback_admin() TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Revogar EXECUTE de anon em todas as funções SECURITY DEFINER públicas
--    que não devem ser chamadas sem autenticação
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  func_name text;
  func_args text;
BEGIN
  FOR func_name, func_args IN
    SELECT p.proname,
           pg_get_function_identity_arguments(p.oid)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true  -- SECURITY DEFINER
      AND p.proname NOT IN (
        -- Funções que devem ser acessíveis sem login (nenhuma neste app)
        'placeholder_never_match'
      )
  LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon', func_name, func_args);
    EXCEPTION WHEN others THEN
      NULL; -- ignora se já revogado ou função não existe
    END;
  END LOOP;
END;
$$;
