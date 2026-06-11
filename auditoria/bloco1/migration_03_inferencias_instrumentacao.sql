-- ============================================================================
-- BLOCO 1 / Migration 03 — [INFERÊNCIA] — separada conforme combinado
--
-- combat_turn_logs tem 0 LINHAS (COUNT(*) real em 11/06/2026; boss_battles e
-- personagens também vazios). Regra do projeto: SEM DADOS, NENHUM número de
-- balanceamento muda às cegas. Portanto esta migration NÃO altera bosses,
-- skills nem itens — ela só prepara a instrumentação pra próxima auditoria
-- ter resposta imediata quando houver logs.
--
-- As inferências estáticas (TTK×TTD por nível, economia de mana) estão no
-- RELATORIO.md — são hipóteses a validar com esta view, não fatos.
-- ============================================================================

CREATE OR REPLACE VIEW public.vw_combat_balance AS
SELECT
  ctl.combate_id,
  ctl.user_id,
  b.level                                   AS boss_level,
  b.name                                    AS boss_name,
  p.nivel                                   AS player_level,
  max(ctl.rodada)                           AS rodadas,
  max(ctl.status)        FILTER (WHERE ctl.status <> 'em_andamento') AS resultado,
  sum(ctl.dano_player)                      AS dano_total_player,
  sum(ctl.dano_boss)                        AS dano_total_boss,
  round(avg(ctl.dano_player), 1)            AS dano_medio_player,
  round(avg(ctl.dano_boss), 1)              AS dano_medio_boss,
  max(ctl.dano_player)                      AS pico_dano_player,   -- vigia o teto da cadeia
  array_agg(DISTINCT ctl.habilidade_player) AS skills_usadas,      -- skill dominante/morta
  min(ctl.created_at)                       AS inicio,
  max(ctl.created_at)                       AS fim
FROM public.combat_turn_logs ctl
JOIN public.combates_ativos ca ON ca.id = ctl.combate_id
JOIN public.bosses b           ON b.id = ca.boss_id
LEFT JOIN public.personagens p ON p.id = ctl.user_id
GROUP BY ctl.combate_id, ctl.user_id, b.level, b.name, p.nivel;

COMMENT ON VIEW public.vw_combat_balance IS
  'Auditoria de balanceamento: 1 linha por combate. Sobrevivência por nível = resultado×boss_level−player_level; skill morta = ausente em skills_usadas; teto de stacking = pico_dano_player.';

-- ============================================================================
-- ROLLBACK:
-- DROP VIEW IF EXISTS public.vw_combat_balance;
-- ============================================================================
