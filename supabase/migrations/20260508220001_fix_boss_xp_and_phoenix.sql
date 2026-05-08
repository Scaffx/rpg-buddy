-- ============================================================
-- Fix XP e Gold dos Bosses
--
-- Problema: xp_reward estava em valores muito baixos (~10-20) após
-- a redução de 90% em migration anterior, mas processar_turno
-- usava bossLevel * 30 gerando discrepância entre o mostrado e o dado.
--
-- Solução: atualizar xp_reward e gold_reward no banco para valores
-- reais e proporcionar recompensas significativas por boss.
--
-- Também:
--  • Adiciona coluna phoenix_rebirths à hero_story_choices para
--    rastrear quantas vezes o herói já matou a Fênix do Caos
--  • Adiciona Esfinge do Deserto como boss de fusão com a Fênix
-- ============================================================

-- ── 1. Corrigir XP e Gold de todos os bosses existentes ──────
-- Formula: XP = level * 80 + 20 (base decente, escala bem)
--          Gold = level * 15 + 10
UPDATE public.bosses SET
  xp_reward   = (level * 80) + 20,
  gold_reward  = (level * 15) + 10
WHERE name NOT ILIKE '%guerreiro%imortal%';

-- Guerreiro Imortal: recompensa premium (requer item especial para derrotar)
UPDATE public.bosses SET
  xp_reward   = 1200,
  gold_reward  = 300
WHERE name ILIKE '%guerreiro%imortal%';

-- Fênix do Caos: recompensa alta pela dificuldade dos 3 renascimentos
UPDATE public.bosses SET
  xp_reward   = 600,
  gold_reward  = 150
WHERE name ILIKE '%fênix%' OR name ILIKE '%fenix%' OR name ILIKE '%phoenix%';

-- ── 2. Rastrear renascimentos da Fênix por usuário ────────────
ALTER TABLE public.hero_story_choices
  ADD COLUMN IF NOT EXISTS phoenix_kill_count   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS phoenix_fused         boolean NOT NULL DEFAULT false;

-- ── 3. Adicionar Esfinge do Deserto como boss do DB ──────────
-- (já pode existir; usamos DO $$ para idempotência)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.bosses WHERE name ILIKE '%esfinge%deserto%'
  ) THEN
    INSERT INTO public.bosses
      (name, description, hp, level, xp_reward, gold_reward, icon, keys_cost, element)
    VALUES (
      'Fênix + Esfinge do Deserto',
      'A Fênix do Caos e a Esfinge do Deserto uniram suas forças. Uma dupla imparável de fogo e areia — o caos de uma e a sabedoria sombria da outra. Para derrotá-las é preciso vencer as duas.',
      900,
      12,
      1500,
      350,
      '🔥🦁',
      3,
      'fire'
    );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
