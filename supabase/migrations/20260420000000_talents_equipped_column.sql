-- Add equipped column to talentos_jogador if not already present
ALTER TABLE public.talentos_jogador
  ADD COLUMN IF NOT EXISTS equipped boolean NOT NULL DEFAULT false;

-- Give Scaffito (Scaff.scaff444@gmail.com) 2 talent points
UPDATE public.profiles
SET pontos_talento = COALESCE(pontos_talento, 0) + 2
WHERE user_id = (
  SELECT id FROM auth.users WHERE email = 'Scaff.scaff444@gmail.com' LIMIT 1
);

-- Ensure the trigger for 1 point per 5 levels is deployed
-- (already in 20260415210000_talentos_feats.sql, included here as safety backfill)
UPDATE public.profiles
SET pontos_talento = GREATEST(
  COALESCE(pontos_talento, 0),
  floor(COALESCE(level, 1) / 5.0)::integer
)
WHERE pontos_talento < floor(COALESCE(level, 1) / 5.0);

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
