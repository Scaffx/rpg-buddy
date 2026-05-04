-- Adiciona coluna claimed_at em user_achievements
-- Conquistas já existentes (desbloqueadas automaticamente antes desta mudança)
-- são marcadas como já resgatadas para não confundir usuários antigos.
ALTER TABLE public.user_achievements
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

-- Marca todas as conquistas existentes como já resgatadas
UPDATE public.user_achievements
SET claimed_at = unlocked_at
WHERE claimed_at IS NULL;
