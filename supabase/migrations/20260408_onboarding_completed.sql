-- Adiciona coluna onboarding_completed na tabela profiles
-- Todos os usuários (novos e existentes) precisam completar o onboarding pelo menos 1 vez
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

-- Coluna starter_class e starter_item para persistir no banco (antes era só localStorage)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS starter_class text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS starter_item text;
