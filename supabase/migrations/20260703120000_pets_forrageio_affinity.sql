-- Pets Fase 1.5 (forrageio): afinidade + controle diário nos companions.
-- Aditivo e idempotente. RLS já existe ("Users manage own companion") — o dono
-- atualiza esses campos pelo cliente (job de forrageio). Sem XP/ouro envolvidos.

ALTER TABLE public.companions
  ADD COLUMN IF NOT EXISTS affinity           integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_forage_at     date,
  ADD COLUMN IF NOT EXISTS last_affinity_date date;

COMMENT ON COLUMN public.companions.affinity IS
  'Afinidade do pet: +1 por dia perfeito (todas as âncoras completas). Escala a raridade do forrageio.';
COMMENT ON COLUMN public.companions.last_forage_at IS
  'Data do último forrageio (YYYY-MM-DD). Garante 1x/dia.';
COMMENT ON COLUMN public.companions.last_affinity_date IS
  'Data do último ganho de afinidade. Garante +1 no máximo por dia.';
