
-- Add missing attributes for existing users who don't have Autoaperfeiçoamento or Relacionamento
INSERT INTO public.attributes (user_id, name, icon, xp, level)
SELECT u.id, 'Autoaperfeiçoamento', '⭐', 0, 1
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.attributes a WHERE a.user_id = u.id AND a.name = 'Autoaperfeiçoamento'
);

INSERT INTO public.attributes (user_id, name, icon, xp, level)
SELECT u.id, 'Relacionamento', '💜', 0, 1
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.attributes a WHERE a.user_id = u.id AND a.name = 'Relacionamento'
);
