-- ============================================================
-- FIX: Recuperar companheiro Ossinho do Scaffitos
-- Execute no Supabase Dashboard SQL Editor
-- https://app.supabase.com/project/jfnospjxdkelxlhcwuia/sql
-- ============================================================

-- PASSO 1: Diagnosticar estado atual do Scaffitos
-- (rode isso primeiro para entender o que está no banco)

SELECT
  u.id           AS user_id,
  u.email,
  p.username,
  p.level,
  hsc.skeleton_champion,
  c.id           AS companion_id,
  c.name         AS companion_name,
  c.companion_type,
  c.origin
FROM auth.users u
JOIN public.profiles p ON p.user_id = u.id
LEFT JOIN public.hero_story_choices hsc ON hsc.user_id = u.id
LEFT JOIN public.companions c ON c.user_id = u.id AND c.origin = 'boss_story'
WHERE u.email = 'scaff.scaff444@gmail.com';

-- ============================================================
-- PASSO 2A: Se hero_story_choices.skeleton_champion = 'adopt'
--           mas NÃO existe companion com origin='boss_story'
--           → criar o companion diretamente
-- ============================================================

-- Descomentar e executar se o diagnóstico mostrar:
--   skeleton_champion = 'adopt' E companion_id = NULL

/*
INSERT INTO public.companions (
  user_id,
  companion_type,
  origin,
  name,
  level,
  xp,
  mood
)
SELECT
  u.id,
  'skeleton_pup',
  'boss_story',
  'Ossinho',   -- nome padrão; altere se o Scaffitos escolheu outro nome
  1,
  0,
  80
FROM auth.users u
WHERE u.email = 'scaff.scaff444@gmail.com'
  AND NOT EXISTS (
    SELECT 1 FROM public.companions c
    WHERE c.user_id = u.id AND c.origin = 'boss_story'
  );
*/

-- ============================================================
-- PASSO 2B: Se hero_story_choices.skeleton_champion = NULL
--           (migration resetou o estado) e também não há companion
--           → restaurar a escolha para que o card "Pronto para adotar"
--             apareça E o Scaffitos possa re-adotar via CompanionPage
-- ============================================================

-- Descomentar e executar se o diagnóstico mostrar:
--   skeleton_champion = NULL E companion_id = NULL
--   E o Scaffitos confirmar que queria adotar

/*
UPDATE public.hero_story_choices
SET skeleton_champion = 'adopt', updated_at = now()
WHERE user_id = (
  SELECT id FROM auth.users WHERE email = 'scaff.scaff444@gmail.com'
);

-- Se não existir linha em hero_story_choices, inserir:
INSERT INTO public.hero_story_choices (user_id, skeleton_champion, updated_at)
SELECT id, 'adopt', now()
FROM auth.users
WHERE email = 'scaff.scaff444@gmail.com'
ON CONFLICT (user_id) DO UPDATE
  SET skeleton_champion = 'adopt', updated_at = now();
*/

-- ============================================================
-- PASSO 3: Verificar resultado
-- ============================================================
SELECT
  c.id,
  c.name,
  c.companion_type,
  c.origin,
  c.level,
  c.mood,
  hsc.skeleton_champion
FROM auth.users u
JOIN public.hero_story_choices hsc ON hsc.user_id = u.id
LEFT JOIN public.companions c ON c.user_id = u.id AND c.origin = 'boss_story'
WHERE u.email = 'scaff.scaff444@gmail.com';
