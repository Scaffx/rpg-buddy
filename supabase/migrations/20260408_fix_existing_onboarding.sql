-- Fix: marca todos os perfis existentes como onboarding concluído
-- Usuários que já estavam usando o app antes da coluna onboarding_completed
-- ficaram com false e estão sendo redirecionados ao onboarding novamente
UPDATE profiles SET onboarding_completed = true WHERE onboarding_completed = false;
