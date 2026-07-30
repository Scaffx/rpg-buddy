-- Backfill do loadout de combate.
--
-- Bug: aprender uma habilidade (player_skill_nodes, via allocate_skill_node) NÃO
-- a coloca em profiles.combat_skill_loadout, que é a única fonte lida pelo
-- combate. Quem nunca abriu o editor de loadout entrava em toda luta apenas com
-- Ataque Básico — na prática, 100% dos perfis existentes.
--
-- Aqui preenchemos o loadout de quem está vazio com as habilidades que a pessoa
-- JÁ desbloqueou. Mesmo formato produzido por buildTreeSkillEntry (src/lib/combat.ts):
-- power escala com o rank via pct_per_rank. Só toca em quem está vazio, então é
-- idempotente e nunca sobrescreve escolha de jogador.

WITH skills_por_usuario AS (
  SELECT
    psn.user_id,
    jsonb_agg(
      jsonb_build_object(
        'id',          stn.id,
        'name',        stn.name,
        'power',       round(
                         COALESCE((stn.effect->>'power')::numeric, 30)
                         * (1 + (GREATEST(1, psn.rank) - 1)
                                * COALESCE((stn.effect->>'pct_per_rank')::numeric, 10) / 100)
                       ),
        'cooldown',    COALESCE((stn.effect->>'cooldown')::numeric, 2),
        'category',    CASE WHEN COALESCE(stn.effect->>'element', 'arcano') = 'fisico'
                            THEN 'fisica' ELSE 'magica' END,
        'tier',        'classe',
        'mpCost',      COALESCE((stn.effect->>'mpCost')::numeric, 0),
        'effectType',  COALESCE(stn.effect->>'effectType', 'dano'),
        'effectLabel', COALESCE(stn.description, ''),
        'element',     COALESCE(stn.effect->>'element', 'arcano')
      )
      ORDER BY stn.tier, stn.name
    ) AS loadout
  FROM public.player_skill_nodes psn
  JOIN public.skill_tree_nodes stn ON stn.id = psn.node_id
  WHERE psn.rank >= 1
    AND stn.node_type = 'skill'
  GROUP BY psn.user_id
)
UPDATE public.profiles p
SET combat_skill_loadout = s.loadout
FROM skills_por_usuario s
WHERE p.user_id = s.user_id
  AND (
    p.combat_skill_loadout IS NULL
    OR jsonb_array_length(COALESCE(p.combat_skill_loadout, '[]'::jsonb)) = 0
  );
