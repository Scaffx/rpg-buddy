-- ============================================================
-- LIMPEZA: Deletar todos usuários level 1 (sem progresso)
-- Manter apenas os 3 usuários com progresso relevante:
--   LastSlayer   → marcelomoure1@gmail.com
--   Scaffitos    → scaff.scaff444@gmail.com
--   Twiinsensei  → fabiorhc92@gmail.com
--
-- Execute no Supabase Dashboard:
-- https://app.supabase.com/project/jshauyvknqgxhzmslnoc/sql
-- ============================================================

-- ============================================================
-- PASSO 1: Conferir quem SERÁ DELETADO (rode antes de deletar)
-- ============================================================
SELECT
  u.id,
  u.email,
  u.created_at,
  p.username,
  p.level
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE u.email NOT IN (
  'marcelomoure1@gmail.com',
  'scaff.scaff444@gmail.com',
  'fabiorhc92@gmail.com'
)
ORDER BY p.level DESC NULLS LAST, u.created_at;

-- ============================================================
-- PASSO 2: Conferir quem SERÁ MANTIDO
-- ============================================================
SELECT
  u.id,
  u.email,
  p.username,
  p.level,
  p.xp
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE u.email IN (
  'marcelomoure1@gmail.com',
  'scaff.scaff444@gmail.com',
  'fabiorhc92@gmail.com'
)
ORDER BY p.level DESC;

-- ============================================================
-- PASSO 3: DELETAR todos os usuários que NÃO são os 3
-- (Cascata: deleta profiles, attributes, missions, inventory, etc.)
-- SÓ RODE DEPOIS DE CONFIRMAR O PASSO 1
-- ============================================================
DELETE FROM auth.users
WHERE email NOT IN (
  'marcelomoure1@gmail.com',
  'scaff.scaff444@gmail.com',
  'fabiorhc92@gmail.com'
);

-- ============================================================
-- PASSO 4: Verificar que sobrou apenas os 3
-- ============================================================
SELECT u.id, u.email, p.username, p.level
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
ORDER BY p.level DESC;

-- ============================================================
-- APÓS RODAR O SQL:
-- Para enviar reset de senha aos 3 usuários:
--   1. Acesse: https://app.supabase.com/project/jshauyvknqgxhzmslnoc/auth/users
--   2. Clique no usuário → "Send password recovery"
--   Faça isso para cada um dos 3.
-- ============================================================
