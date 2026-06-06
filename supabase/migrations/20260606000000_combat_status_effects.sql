-- Roadmap #4 (combos): status persistente do boss entre turnos do combate solo.
-- JSON: { burning, bleeding, wet, frozen, vulnerable } -> turnos restantes / stacks.
-- Aditivo: combate existente é idêntico quando o objeto está vazio ({}).
ALTER TABLE public.combates_ativos
  ADD COLUMN IF NOT EXISTS boss_status jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.combates_ativos.boss_status IS
  'Status de combate aplicados ao boss (combos): { burning, bleeding, wet, frozen, vulnerable }. Turnos restantes (ou stacks para bleeding).';
