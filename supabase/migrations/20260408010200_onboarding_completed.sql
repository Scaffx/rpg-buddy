-- Adiciona coluna onboarding_completed na tabela profiles
-- Todos os usuários (novos e existentes) precisam completar o onboarding pelo menos 1 vez
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

-- Coluna starter_class e starter_item para persistir no banco (antes era só localStorage)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS starter_class text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS starter_item text;

-- Marca usuários já existentes como tendo concluído o onboarding
-- (contas criadas antes dessa migration já usavam o app normalmente)
UPDATE profiles SET onboarding_completed = true WHERE onboarding_completed = false;
