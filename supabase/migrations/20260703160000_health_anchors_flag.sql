-- Âncoras de saúde: refeição/água deixam de ser missões e viram condições do
-- "dia perfeito", cumpridas ao registrar no Perfil/Saúde (meal_log/water_log).
-- Opt-in por usuário (default false p/ não mudar o gate de bônus de quem não usa).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS health_anchors_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.health_anchors_enabled IS
  'Quando true, o "dia perfeito" exige refeição + água registradas (meal_log/water_log) além das âncoras-missão. Substitui as missões-âncora de refeição/água.';