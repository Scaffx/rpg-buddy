-- ============================================================
-- Reviver o Esqueleto Campeão para todos os usuários
-- Apaga registros de vitória (won=true) na boss_battles,
-- permitindo que qualquer usuário que já derrotou o boss
-- possa enfrentá-lo novamente e receber as recompensas.
-- ============================================================

-- 1. Remove todas as vitórias registradas contra bosses do tipo Esqueleto
DELETE FROM public.boss_battles
WHERE won = true
  AND boss_id IN (
    SELECT id FROM public.bosses
    WHERE name ILIKE '%esquelet%'
  );

-- 2. Encerra combates ativos em andamento contra o Esqueleto
--    (evita que usuários fiquem presos em combate fantasma)
UPDATE public.combates_ativos
SET status = 'abandonado'
WHERE status = 'em_andamento'
  AND boss_id IN (
    SELECT id FROM public.bosses
    WHERE name ILIKE '%esquelet%'
  );
