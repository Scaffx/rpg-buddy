-- Backfill: para usuários que possuem talentos comprados mas nenhum equipado
-- (caso comum entre jogadores que adquiriram talentos antes de a coluna
-- equipped existir, ou antes da feature de auto-equipar). Marca os 5
-- primeiros talentos (por ordem de aquisição) como equipped=true.
--
-- Observação: aplica APENAS quando o usuário tem 0 equipados. Se ele já
-- tomou ação consciente de equipar/desequipar, não tocamos no estado.

WITH ranked AS (
  SELECT
    t.id,
    t.personagem_id,
    ROW_NUMBER() OVER (
      PARTITION BY t.personagem_id
      ORDER BY t.created_at ASC, t.id ASC
    ) AS rn,
    SUM(CASE WHEN t.equipped THEN 1 ELSE 0 END) OVER (
      PARTITION BY t.personagem_id
    ) AS user_equipped_count
  FROM public.talentos_jogador t
)
UPDATE public.talentos_jogador
SET equipped = true
WHERE id IN (
  SELECT id
  FROM ranked
  WHERE user_equipped_count = 0
    AND rn <= 5
);

NOTIFY pgrst, 'reload schema';
