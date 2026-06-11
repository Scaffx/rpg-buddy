-- ============================================================================
-- BLOCO 1 / Migration 01 — [DADO SÓLIDO] — SEGURA PARA RODAR HOJE
-- Trava a forja de combat_turn_logs pelo cliente.
--
-- Evidência: pg_policies mostra "Users can insert own combat turn logs"
--   (INSERT, with_check auth.uid() = user_id). O ÚNICO escritor legítimo é o
--   edge function processar_turno, que usa SERVICE_ROLE e ignora RLS.
--   Nenhum insert client-side em combat_turn_logs existe no src/ do origin/main
--   (verificado por grep em 11/06/2026). Logo: zero impacto em fluxo de jogo.
--
-- Por que importa: combat_turn_logs é a fonte de verdade das auditorias de
--   balanceamento (este projeto inteiro depende dela). Cliente podendo inserir
--   = dados de balanceamento envenenáveis + histórico de combate forjável.
-- ============================================================================

DROP POLICY IF EXISTS "Users can insert own combat turn logs" ON public.combat_turn_logs;

-- ============================================================================
-- ROLLBACK (valor antigo):
-- CREATE POLICY "Users can insert own combat turn logs"
--   ON public.combat_turn_logs
--   FOR INSERT
--   WITH CHECK (auth.uid() = user_id);
-- ============================================================================
