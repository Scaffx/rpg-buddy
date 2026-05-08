-- ============================================================
-- PORTAL EVENT REDESIGN — portal diário (1 por dia)
--
-- Mudanças em relação ao sistema anterior:
--  • 1 portal POR DIA (antes: 4 por semana, usuário escolhia)
--  • Cor do portal é OCULTA até ser escaneada com item de loja
--  • Fragmentos são COMPARTILHADOS entre todos que limparam
--  • Dungeon é sorteada ALEATORIAMENTE após fechar o portal
--  • Reset de fragmentos acontece semanalmente (domingo meia-noite)
--  • Jogador tem 1 semana para se preparar após descobrir a dungeon
-- ============================================================

-- ── 1. Adicionar colunas ao portal_events ──────────────────
ALTER TABLE portal_events
  ADD COLUMN IF NOT EXISTS portal_color    TEXT CHECK (portal_color IN ('blue','yellow','red','legendary')),
  ADD COLUMN IF NOT EXISTS dungeon_tier    TEXT CHECK (dungeon_tier IN ('medium','hard','legendary','ultra')),
  ADD COLUMN IF NOT EXISTS dungeon_tier_weight JSONB DEFAULT '{"medium":45,"hard":35,"legendary":15,"ultra":5}'::jsonb,
  ADD COLUMN IF NOT EXISTS portal_closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS total_fragments_dropped INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_fragments_drop      INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS legendary_item_dropped  BOOLEAN NOT NULL DEFAULT FALSE;

-- Nota: portal_events.ends_at continua sendo usado para expirar o portal.
-- Para eventos diários, ends_at = starts_at + 24h.

-- ── 2. Tabela de participantes do portal (quem fechou) ─────
CREATE TABLE IF NOT EXISTS portal_run_participants (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID        NOT NULL REFERENCES portal_events(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id)    ON DELETE CASCADE,
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_id, user_id)
);

-- ── 3. Adicionar colunas ao portal_runs ────────────────────
-- fragments_received: quantos fragmentos esse usuário recebeu ao fechar
ALTER TABLE portal_runs
  ADD COLUMN IF NOT EXISTS fragments_received INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS legendary_item_received BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 4. Adicionar campo de escaneamento por usuário ─────────
-- Guarda quais portais cada usuário já escaneou (sabe a cor antes de entrar)
CREATE TABLE IF NOT EXISTS portal_scans (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID        NOT NULL REFERENCES portal_events(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id)    ON DELETE CASCADE,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_id, user_id)
);

-- ── 5. Tabela de fragmentos semanais por jogador ───────────
-- Fragmentos da semana atual (resetam todo domingo)
-- Separado de lifetime_fragments (total histórico)
ALTER TABLE player_portal_fragments
  ADD COLUMN IF NOT EXISTS weekly_fragments  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS week_start        DATE,
  ADD COLUMN IF NOT EXISTS pending_dungeon   TEXT CHECK (pending_dungeon IN ('medium','hard','legendary','ultra')),
  ADD COLUMN IF NOT EXISTS dungeon_revealed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dungeon_expires_at  TIMESTAMPTZ;

-- ── 6. RLS para novas tabelas ──────────────────────────────
ALTER TABLE portal_run_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_scans            ENABLE ROW LEVEL SECURITY;

CREATE POLICY "portal_participants_select"
  ON portal_run_participants FOR SELECT USING (TRUE); -- todos podem ver quem fechou
CREATE POLICY "portal_participants_insert"
  ON portal_run_participants FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "portal_scans_select"
  ON portal_scans FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "portal_scans_insert"
  ON portal_scans FOR INSERT WITH CHECK (user_id = auth.uid());

-- ── 7. RPC: get_active_portal_event (reescrita) ────────────
-- Retorna o portal diário ativo.
-- portal_color é NULL se o usuário não escaneou (e não fechou) o portal.
CREATE OR REPLACE FUNCTION get_active_portal_event()
RETURNS TABLE (
  event_id           UUID,
  starts_at          TIMESTAMPTZ,
  ends_at            TIMESTAMPTZ,
  hours_left         NUMERIC,
  portal_color       TEXT,   -- NULL se não escaneou/fechou
  color_revealed     BOOLEAN,
  already_completed  BOOLEAN,
  participant_count  BIGINT,
  runs_this_week     JSONB,
  pending_dungeon    TEXT,
  dungeon_expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  RETURN QUERY
  SELECT
    pe.id,
    pe.starts_at,
    pe.ends_at,
    ROUND(EXTRACT(EPOCH FROM (pe.ends_at - NOW())) / 3600, 1),
    -- Revela a cor apenas se o usuário escaneou OU já fechou o portal
    CASE
      WHEN EXISTS(
        SELECT 1 FROM portal_scans ps
        WHERE ps.event_id = pe.id AND ps.user_id = v_uid
      ) OR EXISTS(
        SELECT 1 FROM portal_runs pr
        WHERE pr.event_id = pe.id AND pr.user_id = v_uid AND pr.completed = TRUE
      ) THEN pe.portal_color
      ELSE NULL
    END,
    -- color_revealed: booleano para a UI saber se a cor está visível
    (
      EXISTS(
        SELECT 1 FROM portal_scans ps
        WHERE ps.event_id = pe.id AND ps.user_id = v_uid
      ) OR EXISTS(
        SELECT 1 FROM portal_runs pr
        WHERE pr.event_id = pe.id AND pr.user_id = v_uid AND pr.completed = TRUE
      )
    ),
    -- already_completed: se este usuário já fechou hoje
    EXISTS(
      SELECT 1 FROM portal_runs pr
      WHERE pr.event_id = pe.id AND pr.user_id = v_uid AND pr.completed = TRUE
    ),
    -- participant_count: quantos já fecharam este portal
    (SELECT COUNT(*) FROM portal_run_participants p2 WHERE p2.event_id = pe.id),
    -- runs_this_week: histórico da semana (para fragmentos)
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
          'color',              pr.portal_color,
          'xp',                 pr.xp_earned,
          'fragments_received', pr.fragments_received,
          'legendary_item',     pr.legendary_item_received
        ))
       FROM portal_runs pr
       WHERE pr.user_id  = v_uid
         AND pr.ran_at   >= date_trunc('week', NOW())
         AND pr.completed = TRUE
      ),
      '[]'::jsonb
    ),
    -- pending_dungeon: dungeon sorteada aguardando o usuário
    ppf.pending_dungeon,
    ppf.dungeon_expires_at
  FROM portal_events pe
  LEFT JOIN player_portal_fragments ppf ON ppf.user_id = v_uid
  WHERE pe.is_active = TRUE
    AND pe.starts_at <= NOW()
    AND pe.ends_at   >  NOW()
  ORDER BY pe.starts_at DESC
  LIMIT 1;
END;
$$;

-- ── 8. RPC: scan_portal ────────────────────────────────────
-- Consome 1x "Escaner de Portal" do inventário e revela a cor.
CREATE OR REPLACE FUNCTION scan_portal(p_event_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_uid         UUID := auth.uid();
  v_scanner_id  UUID;
  v_inv_id      UUID;
  v_color       TEXT;
BEGIN
  -- Portal deve existir e estar ativo
  SELECT portal_color INTO v_color
  FROM portal_events
  WHERE id = p_event_id AND is_active = TRUE AND ends_at > NOW();
  IF NOT FOUND OR v_color IS NULL THEN
    RETURN jsonb_build_object('error', 'Portal não encontrado ou já expirado.');
  END IF;

  -- Já escaneou?
  IF EXISTS(SELECT 1 FROM portal_scans WHERE event_id = p_event_id AND user_id = v_uid) THEN
    RETURN jsonb_build_object('portal_color', v_color, 'already_scanned', TRUE);
  END IF;

  -- Busca o item "Escaner de Portal" no inventário do usuário
  SELECT gi.id INTO v_scanner_id
  FROM game_items gi
  WHERE gi.effect = 'portal_scan' AND gi.is_consumable = TRUE
  LIMIT 1;

  IF v_scanner_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Item Escaner de Portal não encontrado no sistema.');
  END IF;

  SELECT pi.id INTO v_inv_id
  FROM player_inventory pi
  WHERE pi.user_id = v_uid AND pi.item_id = v_scanner_id AND pi.quantity > 0
  LIMIT 1;

  IF v_inv_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Você não possui um Escaner de Portal.');
  END IF;

  -- Consome 1 unidade do item
  UPDATE player_inventory
  SET quantity = quantity - 1
  WHERE id = v_inv_id;

  DELETE FROM player_inventory WHERE id = v_inv_id AND quantity <= 0;

  -- Registra o escaneamento
  INSERT INTO portal_scans (event_id, user_id) VALUES (p_event_id, v_uid)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('portal_color', v_color, 'already_scanned', FALSE);
END;
$$;

-- ── 9. RPC: complete_portal_run (reescrita) ────────────────
-- Distribui fragmentos entre TODOS os participantes.
-- Lógica:
--   1. Registra o run do usuário
--   2. Adiciona usuário aos participantes
--   3. Rola o drop de fragmentos (base + aleatorio conforme cor)
--   4. Distribui fragmentos igualmente entre participantes
--   5. Verifica item lendário (5% por herói, por portal vermelho/lendário)
--   6. Sorteia dungeon pendente (se ainda não foi sorteada este evento)
CREATE OR REPLACE FUNCTION complete_portal_run(
  p_event_id     UUID,
  p_xp_earned    INTEGER,
  p_gold_earned  INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_uid              UUID := auth.uid();
  v_already_won      BOOLEAN;
  v_portal_color     TEXT;
  v_max_frags        INTEGER;
  v_frag_chance      NUMERIC;
  v_frags_dropped    INTEGER := 0;
  v_frag_per_player  INTEGER := 0;
  v_legendary_drop   BOOLEAN := FALSE;
  v_participant_count BIGINT;
  v_dungeon_tier     TEXT;
  v_roll             NUMERIC;
  v_week_start       DATE;
  v_dungeon_already  TEXT;
  r                  RECORD;
BEGIN
  -- Verifica se já completou hoje
  SELECT EXISTS(
    SELECT 1 FROM portal_runs
    WHERE user_id = v_uid AND event_id = p_event_id AND completed = TRUE
  ) INTO v_already_won;

  IF v_already_won THEN
    RETURN jsonb_build_object('already_claimed', TRUE);
  END IF;

  -- Pega dados do portal
  SELECT portal_color, max_fragments_drop
  INTO v_portal_color, v_max_frags
  FROM portal_events
  WHERE id = p_event_id AND is_active = TRUE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Portal não encontrado.');
  END IF;

  -- Define % de drop e máx por cor
  CASE v_portal_color
    WHEN 'blue'      THEN v_frag_chance := 0.05; v_max_frags := 2;
    WHEN 'yellow'    THEN v_frag_chance := 0.10; v_max_frags := 3;
    WHEN 'red'       THEN v_frag_chance := 0.15; v_max_frags := 4;
    WHEN 'legendary' THEN v_frag_chance := 0.25; v_max_frags := 6;
    ELSE                  v_frag_chance := 0.05; v_max_frags := 1;
  END CASE;

  -- Rola item lendário (5% por herói, apenas red/legendary)
  IF v_portal_color IN ('red','legendary') THEN
    IF random() < 0.05 THEN
      v_legendary_drop := TRUE;
    END IF;
  END IF;

  -- Adiciona participante (idempotente)
  INSERT INTO portal_run_participants (event_id, user_id)
  VALUES (p_event_id, v_uid)
  ON CONFLICT DO NOTHING;

  -- Registra o run SEM fragmentos ainda (serão calculados abaixo)
  INSERT INTO portal_runs
    (user_id, event_id, portal_color, completed, xp_earned, gold_earned,
     fragment_earned, fragments_received, legendary_item_received)
  VALUES
    (v_uid, p_event_id, v_portal_color, TRUE, p_xp_earned, p_gold_earned,
     FALSE, 0, v_legendary_drop);

  -- ── Rolagem de fragmentos ──────────────────────────────
  -- Só rola se der a chance
  IF random() < v_frag_chance THEN
    -- Drop aleatório entre 1 e v_max_frags
    v_frags_dropped := 1 + floor(random() * v_max_frags)::INTEGER;
  END IF;

  -- Conta participantes (incluindo este)
  SELECT COUNT(*) INTO v_participant_count
  FROM portal_run_participants WHERE event_id = p_event_id;

  -- Divide fragmentos entre participantes (mínimo 0, arredondado para baixo)
  IF v_frags_dropped > 0 AND v_participant_count > 0 THEN
    v_frag_per_player := GREATEST(1, floor(v_frags_dropped::NUMERIC / v_participant_count)::INTEGER);

    -- Distribui para TODOS os participantes deste portal
    FOR r IN
      SELECT prp.user_id FROM portal_run_participants prp WHERE prp.event_id = p_event_id
    LOOP
      -- Atualiza o run com fragmentos
      UPDATE portal_runs
      SET fragment_earned = TRUE, fragments_received = v_frag_per_player
      WHERE user_id = r.user_id AND event_id = p_event_id AND completed = TRUE;

      -- Atualiza fragmentos do jogador
      v_week_start := date_trunc('week', NOW())::DATE;
      INSERT INTO player_portal_fragments
        (user_id, fragments, lifetime_fragments, weekly_fragments, week_start)
      VALUES
        (r.user_id, v_frag_per_player, v_frag_per_player, v_frag_per_player, v_week_start)
      ON CONFLICT (user_id) DO UPDATE SET
        fragments          = player_portal_fragments.fragments + v_frag_per_player,
        lifetime_fragments = player_portal_fragments.lifetime_fragments + v_frag_per_player,
        weekly_fragments   = CASE
          WHEN player_portal_fragments.week_start = v_week_start
          THEN player_portal_fragments.weekly_fragments + v_frag_per_player
          ELSE v_frag_per_player
        END,
        week_start = v_week_start,
        updated_at = NOW();
    END LOOP;
  END IF;

  -- ── Sorteia dungeon (somente se o usuário ainda não tem pendente) ──
  SELECT ppf.pending_dungeon INTO v_dungeon_already
  FROM player_portal_fragments ppf WHERE ppf.user_id = v_uid;

  IF v_dungeon_already IS NULL THEN
    v_roll := random() * 100;
    IF    v_roll < 45 THEN v_dungeon_tier := 'medium';
    ELSIF v_roll < 80 THEN v_dungeon_tier := 'hard';      -- 45+35
    ELSIF v_roll < 95 THEN v_dungeon_tier := 'legendary'; -- +15
    ELSE                   v_dungeon_tier := 'ultra';     -- +5
    END IF;

    UPDATE player_portal_fragments
    SET
      pending_dungeon    = v_dungeon_tier,
      dungeon_revealed_at = NOW(),
      dungeon_expires_at  = NOW() + INTERVAL '7 days'
    WHERE user_id = v_uid;
  ELSE
    v_dungeon_tier := v_dungeon_already;
  END IF;

  RETURN jsonb_build_object(
    'already_claimed',      FALSE,
    'portal_color',         v_portal_color,
    'frags_dropped',        v_frags_dropped,
    'frag_per_player',      v_frag_per_player,
    'participant_count',    v_participant_count,
    'legendary_item',       v_legendary_drop,
    'dungeon_tier',         v_dungeon_tier
  );
END;
$$;

-- ── 10. RPC: reset_weekly_portal_fragments ─────────────────
-- Deve ser chamada por cron toda segunda-feira 00:00 UTC
-- (ou pode ser chamada manualmente para testar).
CREATE OR REPLACE FUNCTION reset_weekly_portal_fragments()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE player_portal_fragments
  SET
    weekly_fragments = 0,
    week_start       = date_trunc('week', NOW())::DATE,
    updated_at       = NOW();
  -- NÃO zera pending_dungeon — o jogador ainda tem a semana toda para entrar
END;
$$;

-- ── 11. RPC: claim_pending_dungeon ─────────────────────────
-- Usuário confirma que vai entrar na dungeon sorteada.
-- Remove o pending e debita os fragmentos.
CREATE OR REPLACE FUNCTION claim_pending_dungeon()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_tier  TEXT;
  v_frags INTEGER;
BEGIN
  SELECT pending_dungeon, fragments
  INTO v_tier, v_frags
  FROM player_portal_fragments
  WHERE user_id = v_uid;

  IF v_tier IS NULL THEN
    RETURN jsonb_build_object('error', 'Nenhuma dungeon pendente.');
  END IF;

  IF v_frags < 10 THEN
    RETURN jsonb_build_object('error', 'Fragmentos insuficientes para entrar na dungeon.');
  END IF;

  UPDATE player_portal_fragments
  SET
    fragments          = fragments - 10,
    pending_dungeon    = NULL,
    dungeon_revealed_at = NULL,
    dungeon_expires_at  = NULL,
    updated_at         = NOW()
  WHERE user_id = v_uid;

  RETURN jsonb_build_object('tier', v_tier, 'ok', TRUE);
END;
$$;

-- ── 12. Indexes para novas tabelas ─────────────────────────
CREATE INDEX IF NOT EXISTS portal_participants_event_idx
  ON portal_run_participants(event_id);
CREATE INDEX IF NOT EXISTS portal_scans_event_user_idx
  ON portal_scans(event_id, user_id);
