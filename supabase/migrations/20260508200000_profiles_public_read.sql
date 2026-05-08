-- ================================================================
-- Fix: permitir que usuários autenticados vejam perfis de outros
-- usuários (necessário para Social/amigos mostrar nome, nível e classe).
-- A política anterior só permitia ler o próprio perfil, causando
-- o bug de "Aventureiro / Nv ? · Iniciante" nas solicitações.
-- ================================================================

-- Remove a política restritiva de leitura própria
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

-- Cria política que permite qualquer autenticado ver qualquer perfil
-- (profiles só tem dados de jogo, sem informações sensíveis)
-- Usa DO $$ para não falhar se a política já existir (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'profiles'
      AND policyname = 'Authenticated users can view any profile'
  ) THEN
    CREATE POLICY "Authenticated users can view any profile"
      ON public.profiles FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END
$$;
