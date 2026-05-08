-- ============================================================
-- DUNGEON PARTNERSHIPS (Party Bond System)
-- Registra vínculo entre pares de jogadores que completaram
-- dungeons juntos. Quanto mais runs, maior o bond tier e
-- maiores os bônus passivos de XP, gold e drop.
-- ============================================================

-- ── Main table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dungeon_partnerships (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- user_a_id é sempre o menor UUID (canonical ordering para evitar duplicatas)
  user_a_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  runs_together     INTEGER     NOT NULL DEFAULT 0,
  victories_together INTEGER    NOT NULL DEFAULT 0,
  last_dungeon_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- garante par único independente da ordem
  CONSTRAINT dungeon_partnerships_unique UNIQUE (user_a_id, user_b_id),
  -- evita auto-parceria
  CONSTRAINT dungeon_partnerships_no_self CHECK (user_a_id <> user_b_id),
  -- canonical ordering: user_a < user_b
  CONSTRAINT dungeon_partnerships_order  CHECK (user_a_id < user_b_id)
);

-- ── Indexes ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS dungeon_partnerships_a_idx ON dungeon_partnerships (user_a_id);
CREATE INDEX IF NOT EXISTS dungeon_partnerships_b_idx ON dungeon_partnerships (user_b_id);

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE dungeon_partnerships ENABLE ROW LEVEL SECURITY;

-- Visível para qualquer um dos dois parceiros
CREATE POLICY "partnerships_select"
  ON dungeon_partnerships FOR SELECT
  USING (user_a_id = auth.uid() OR user_b_id = auth.uid());

-- Apenas a RPC abaixo faz inserts/updates via SECURITY DEFINER
CREATE POLICY "partnerships_insert"
  ON dungeon_partnerships FOR INSERT
  WITH CHECK (user_a_id = auth.uid() OR user_b_id = auth.uid());

CREATE POLICY "partnerships_update"
  ON dungeon_partnerships FOR UPDATE
  USING (user_a_id = auth.uid() OR user_b_id = auth.uid());

-- ── Realtime ─────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE dungeon_partnerships;

-- ── RPC: record_dungeon_partnership ─────────────────────────
-- Chamada pelo host no final de uma sessão co-op vitoriosa.
-- Para cada par de jogadores (user_a, user_b) faz upsert.
-- p_player_ids: array de UUIDs de todos os participantes (host incluído)
-- p_victory: TRUE = incrementa victories_together também
CREATE OR REPLACE FUNCTION record_dungeon_partnership(
  p_player_ids UUID[],
  p_victory    BOOLEAN DEFAULT TRUE
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_i   INTEGER;
  v_j   INTEGER;
  v_a   UUID;
  v_b   UUID;
  v_len INTEGER;
BEGIN
  v_len := array_length(p_player_ids, 1);
  IF v_len IS NULL OR v_len < 2 THEN RETURN; END IF;

  FOR v_i IN 1..v_len LOOP
    FOR v_j IN (v_i + 1)..v_len LOOP
      -- canonical order: smaller UUID first
      IF p_player_ids[v_i] < p_player_ids[v_j] THEN
        v_a := p_player_ids[v_i];
        v_b := p_player_ids[v_j];
      ELSE
        v_a := p_player_ids[v_j];
        v_b := p_player_ids[v_i];
      END IF;

      INSERT INTO dungeon_partnerships
        (user_a_id, user_b_id, runs_together, victories_together, last_dungeon_at)
      VALUES
        (v_a, v_b, 1, CASE WHEN p_victory THEN 1 ELSE 0 END, NOW())
      ON CONFLICT (user_a_id, user_b_id) DO UPDATE SET
        runs_together      = dungeon_partnerships.runs_together + 1,
        victories_together = dungeon_partnerships.victories_together
                             + CASE WHEN p_victory THEN 1 ELSE 0 END,
        last_dungeon_at    = NOW();
    END LOOP;
  END LOOP;
END;
$$;

-- ── RPC: get_my_partnerships ─────────────────────────────────
-- Retorna todas as parcerias do usuário logado, com dados do
-- parceiro (display_name, level, starter_class) e bond_tier.
-- bond_tier:
--   0 = Conhecidos      (1–2 runs)
--   1 = Companheiros    (3–5 runs)
--   2 = Parceiros       (6–10 runs)
--   3 = Veteranos       (11–20 runs)
--   4 = Lendas          (21+ runs)
CREATE OR REPLACE FUNCTION get_my_partnerships()
RETURNS TABLE (
  partner_id          UUID,
  partner_name        TEXT,
  partner_level       INTEGER,
  partner_class       TEXT,
  runs_together       INTEGER,
  victories_together  INTEGER,
  last_dungeon_at     TIMESTAMPTZ,
  bond_tier           INTEGER,
  xp_bonus_pct        INTEGER,
  gold_bonus_pct      INTEGER,
  drop_bonus_pct      INTEGER
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    CASE WHEN p.user_a_id = auth.uid() THEN p.user_b_id ELSE p.user_a_id END AS partner_id,
    COALESCE(pr.display_name, 'Aventureiro') AS partner_name,
    COALESCE(pr.level, 1)                    AS partner_level,
    COALESCE(pr.starter_class, 'novato')     AS partner_class,
    p.runs_together,
    p.victories_together,
    p.last_dungeon_at,
    -- bond_tier calculation
    CASE
      WHEN p.runs_together >= 21 THEN 4
      WHEN p.runs_together >= 11 THEN 3
      WHEN p.runs_together >= 6  THEN 2
      WHEN p.runs_together >= 3  THEN 1
      ELSE 0
    END AS bond_tier,
    -- xp_bonus_pct
    CASE
      WHEN p.runs_together >= 21 THEN 20
      WHEN p.runs_together >= 11 THEN 15
      WHEN p.runs_together >= 6  THEN 10
      WHEN p.runs_together >= 3  THEN 5
      ELSE 0
    END AS xp_bonus_pct,
    -- gold_bonus_pct
    CASE
      WHEN p.runs_together >= 21 THEN 15
      WHEN p.runs_together >= 11 THEN 10
      WHEN p.runs_together >= 6  THEN 5
      ELSE 0
    END AS gold_bonus_pct,
    -- drop_bonus_pct
    CASE
      WHEN p.runs_together >= 21 THEN 15
      WHEN p.runs_together >= 11 THEN 10
      ELSE 0
    END AS drop_bonus_pct
  FROM dungeon_partnerships p
  LEFT JOIN profiles pr
    ON pr.user_id = CASE WHEN p.user_a_id = auth.uid() THEN p.user_b_id ELSE p.user_a_id END
  WHERE p.user_a_id = auth.uid() OR p.user_b_id = auth.uid()
  ORDER BY p.runs_together DESC, p.last_dungeon_at DESC;
END;
$$;
