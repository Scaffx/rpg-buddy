-- F1 — Combate retomável: fundação para o PiP (F2) e o auto-battle (F4).
--
-- O estado do combate JÁ vive no servidor (combates_ativos para o boss solo,
-- dungeon_sessions + dungeon_session_players para a dungeon). O que faltava era
-- uma pergunta única — "esta pessoa tem combate em andamento agora?" — que o
-- app possa fazer de qualquer tela, sem saber de qual sistema veio.

-- ── 1 combate de boss em andamento por pessoa ────────────────────────────────
-- Sem isto, sair de uma luta e começar outra deixava duas em aberto e o PiP não
-- teria como escolher qual mostrar. Índice parcial: só restringe 'em_andamento'.
CREATE UNIQUE INDEX IF NOT EXISTS combates_ativos_um_em_andamento_por_personagem
  ON public.combates_ativos (personagem_id)
  WHERE status = 'em_andamento';

-- ── Consulta unificada de combate ativo ──────────────────────────────────────
-- Retorna no máximo uma linha. 'kind' diz de qual sistema veio, para o cliente
-- saber para onde navegar ao retomar.
CREATE OR REPLACE FUNCTION public.get_active_combat()
RETURNS TABLE (
  kind          text,
  combat_id     uuid,
  reference_id  text,
  label         text,
  hp_player     integer,
  hp_player_max integer,
  hp_enemy      integer,
  hp_enemy_max  integer,
  turn          text,
  updated_at    timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH viewer AS (SELECT auth.uid() AS id)
  SELECT
    'boss'::text                              AS kind,
    ca.id                                     AS combat_id,
    ca.boss_id::text                          AS reference_id,
    COALESCE(b.name, 'Boss')::text            AS label,
    ca.hp_atual_personagem                    AS hp_player,
    NULLIF(p.hp_max, 0)                       AS hp_player_max,
    ca.hp_atual_boss                          AS hp_enemy,
    NULLIF(b.hp, 0)                           AS hp_enemy_max,
    ca.turno_atual                            AS turn,
    ca.updated_at
  FROM public.combates_ativos ca
  CROSS JOIN viewer v
  LEFT JOIN public.bosses b     ON b.id = ca.boss_id
  LEFT JOIN public.personagens p ON p.id = ca.personagem_id
  WHERE v.id IS NOT NULL
    AND ca.personagem_id = v.id
    AND ca.status = 'em_andamento'

  UNION ALL

  SELECT
    'dungeon'::text                           AS kind,
    ds.id                                     AS combat_id,
    ds.dungeon_id                             AS reference_id,
    COALESCE(ds.dungeon_id, 'Masmorra')::text AS label,
    dsp.current_hp                            AS hp_player,
    dsp.max_hp                                AS hp_player_max,
    NULL::integer                             AS hp_enemy,
    NULL::integer                             AS hp_enemy_max,
    NULL::text                                AS turn,
    ds.updated_at
  FROM public.dungeon_sessions ds
  JOIN public.dungeon_session_players dsp ON dsp.session_id = ds.id
  CROSS JOIN viewer v
  WHERE v.id IS NOT NULL
    AND dsp.user_id = v.id
    AND dsp.is_alive = true
    AND ds.status IN ('aguardando', 'em_andamento', 'waiting', 'active', 'in_progress')

  ORDER BY updated_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_active_combat() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_active_combat() TO authenticated;

-- ── Abandonar o combate ativo ────────────────────────────────────────────────
-- O PiP precisa de um "sair" honesto: fecha a luta do boss como derrota (sem
-- tocar em XP/HP do perfil aqui — a consequência corporal é da F6) para que o
-- índice acima libere a próxima.
CREATE OR REPLACE FUNCTION public.abandon_active_combat()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOT_AUTHENTICATED';
  END IF;

  UPDATE public.combates_ativos
  SET status = 'derrota', updated_at = now()
  WHERE personagem_id = v_uid
    AND status = 'em_andamento';
END;
$$;

REVOKE ALL ON FUNCTION public.abandon_active_combat() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.abandon_active_combat() TO authenticated;
