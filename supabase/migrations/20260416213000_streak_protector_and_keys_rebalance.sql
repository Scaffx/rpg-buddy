-- Streak protector system + mission key rebalance support

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS streak_protector_charges integer NOT NULL DEFAULT 2,
ADD COLUMN IF NOT EXISTS streak_protector_max integer NOT NULL DEFAULT 3,
ADD COLUMN IF NOT EXISTS streak_protector_week text,
ADD COLUMN IF NOT EXISTS streak_current_days integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS streak_last_completed_date date;

UPDATE public.profiles
SET streak_protector_charges = COALESCE(streak_protector_charges, 2),
    streak_protector_max = LEAST(3, GREATEST(1, COALESCE(streak_protector_max, 3))),
    streak_current_days = COALESCE(streak_current_days, 0)
WHERE streak_protector_charges IS NULL
   OR streak_protector_max IS NULL
   OR streak_current_days IS NULL;

-- Loja do Tempo item to recover/protect streak when user fails missions.
INSERT INTO public.shop_items (name, description, cost_percent, duration, icon, icon_color, effect)
SELECT
  'Protetor de Streak',
  'Evita a quebra da streak ao falhar missao. Concede +1 carga semanal (max 3).',
  100,
  'Semanal',
  'Shield',
  'red',
  'streak_protector'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.shop_items
  WHERE effect = 'streak_protector'
);
