-- ============================================================
-- PORTAL EVENT SYSTEM
-- Evento semanal: portal dimensional se abre, jogadores fazem
-- runs por cor (azul/amarelo/vermelho/lendário), coletam
-- Fragmentos de Portal e podem invocar Dungeons Épicas de até
-- 8 jogadores que duram ~1 hora.
-- ============================================================

-- ── Portal events (agenda semanal) ──────────────────────────
CREATE TABLE IF NOT EXISTS portal_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  starts_at   TIMESTAMPTZ NOT NULL,
  ends_at     TIMESTAMPTZ NOT NULL,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Fragmentos por jogador ───────────────────────────────────
CREATE TABLE IF NOT EXISTS player_portal_fragments (
  user_id             UUID    PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  fragments           INTEGER NOT NULL DEFAULT 0 CHECK (fragments >= 0),
  lifetime_fragments  INTEGER NOT NULL DEFAULT 0,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Log de runs de portal ────────────────────────────────────
CREATE TABLE IF NOT EXISTS portal_runs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id        UUID        NOT NULL REFERENCES portal_events(id),
  portal_color    TEXT        NOT NULL CHECK (portal_color IN ('blue','yellow','red','legendary')),
  completed       BOOLEAN     NOT NULL DEFAULT FALSE,
  fragment_earned BOOLEAN     NOT NULL DEFAULT FALSE,
  xp_earned       INTEGER     NOT NULL DEFAULT 0,
  gold_earned     INTEGER     NOT NULL DEFAULT 0,
  ran_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Uma vitória por cor por evento (idempotência de recompensas)
CREATE UNIQUE INDEX IF NOT EXISTS portal_runs_unique_win
  ON portal_runs(user_id, event_id, portal_color)
  WHERE completed = TRUE;

-- ── Sessões de Dungeon de Fragmento (até 8 jogadores) ────────
CREATE TABLE IF NOT EXISTS fragment_dungeon_sessions (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id         UUID    NOT NULL REFERENCES auth.users(id),
  dungeon_tier    TEXT    NOT NULL CHECK (dungeon_tier IN ('medium','hard','legendary','ultra')),
  fragments_spent INTEGER NOT NULL DEFAULT 10,
  status          TEXT    NOT NULL DEFAULT 'lobby'
                           CHECK (status IN ('lobby','active','completed','failed')),
  is_public       BOOLEAN NOT NULL DEFAULT FALSE,
  invite_code     TEXT    UNIQUE,
  max_players     INTEGER NOT NULL DEFAULT 8,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fragment_dungeon_players (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID    NOT NULL REFERENCES fragment_dungeon_sessions(id) ON DELETE CASCADE,
  user_id      UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT    NOT NULL,
  player_level INTEGER NOT NULL DEFAULT 1,
  player_atk   INTEGER NOT NULL DEFAULT 15,
  player_def   INTEGER NOT NULL DEFAULT 8,
  player_class TEXT    NOT NULL DEFAULT 'novato',
  current_hp   INTEGER NOT NULL DEFAULT 100,
  max_hp       INTEGER NOT NULL DEFAULT 100,
  is_host      BOOLEAN NOT NULL DEFAULT FALSE,
  is_alive     BOOLEAN NOT NULL DEFAULT TRUE,
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, user_id)
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS portal_runs_user_idx       ON portal_runs(user_id, ran_at DESC);
CREATE INDEX IF NOT EXISTS portal_runs_event_idx      ON portal_runs(event_id);
CREATE INDEX IF NOT EXISTS frag_sessions_host_idx     ON fragment_dungeon_sessions(host_id);
CREATE INDEX IF NOT EXISTS frag_sessions_public_idx   ON fragment_dungeon_sessions(is_public, status)
  WHERE is_public = TRUE;
CREATE INDEX IF NOT EXISTS frag_players_session_idx   ON fragment_dungeon_players(session_id);
CREATE INDEX IF NOT EXISTS frag_players_user_idx      ON fragment_dungeon_players(user_id);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE portal_events             ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_portal_fragments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_runs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE fragment_dungeon_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fragment_dungeon_players  ENABLE ROW LEVEL SECURITY;

-- portal_events: leitura pública
CREATE POLICY "portal_events_select"
  ON portal_events FOR SELECT USING (TRUE);

-- fragmentos: próprio usuário
CREATE POLICY "fragments_select"
  ON player_portal_fragments FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "fragments_insert"
  ON player_portal_fragments FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "fragments_update"
  ON player_portal_fragments FOR UPDATE USING (user_id = auth.uid());

-- portal_runs: próprio usuário
CREATE POLICY "portal_runs_select"
  ON portal_runs FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "portal_runs_insert"
  ON portal_runs FOR INSERT WITH CHECK (user_id = auth.uid());

-- fragment sessions: host + participantes + públicas
CREATE POLICY "frag_sessions_select"
  ON fragment_dungeon_sessions FOR SELECT
  USING (
    host_id = auth.uid()
    OR is_public = TRUE
    OR id IN (SELECT session_id FROM fragment_dungeon_players WHERE user_id = auth.uid())
  );
CREATE POLICY "frag_sessions_insert"
  ON fragment_dungeon_sessions FOR INSERT WITH CHECK (host_id = auth.uid());
CREATE POLICY "frag_sessions_update"
  ON fragment_dungeon_sessions FOR UPDATE USING (host_id = auth.uid());

-- fragment players: participante ou host
CREATE POLICY "frag_players_select"
  ON fragment_dungeon_players FOR SELECT
  USING (
    user_id = auth.uid()
    OR session_id IN (SELECT id FROM fragment_dungeon_sessions WHERE host_id = auth.uid())
  );
CREATE POLICY "frag_players_insert"
  ON fragment_dungeon_players FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR session_id IN (SELECT id FROM fragment_dungeon_sessions WHERE host_id = auth.uid())
  );

-- ── Realtime ─────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE portal_events;
ALTER PUBLICATION supabase_realtime ADD TABLE fragment_dungeon_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE fragment_dungeon_players;
ALTER PUBLICATION supabase_realtime ADD TABLE player_portal_fragments;

-- ── RPC: get_active_portal_event ─────────────────────────────
CREATE OR REPLACE FUNCTION get_active_portal_event()
RETURNS TABLE (
  event_id       UUID,
  starts_at      TIMESTAMPTZ,
  ends_at        TIMESTAMPTZ,
  hours_left     NUMERIC,
  runs_this_week JSONB
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pe.id,
    pe.starts_at,
    pe.ends_at,
    ROUND(EXTRACT(EPOCH FROM (pe.ends_at - NOW())) / 3600, 1),
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
          'color',    pr.portal_color,
          'xp',       pr.xp_earned,
          'fragment', pr.fragment_earned
        ))
       FROM portal_runs pr
       WHERE pr.user_id  = auth.uid()
         AND pr.event_id = pe.id
         AND pr.completed = TRUE
      ),
      '[]'::jsonb
    )
  FROM portal_events pe
  WHERE pe.is_active = TRUE
    AND pe.starts_at <= NOW()
    AND pe.ends_at   >  NOW()
  ORDER BY pe.starts_at DESC
  LIMIT 1;
END;
$$;

-- ── RPC: complete_portal_run ─────────────────────────────────
-- Idempotente: segunda chamada com a mesma (user, event, color)
-- retorna {already_claimed: true} sem alterar nada.
CREATE OR REPLACE FUNCTION complete_portal_run(
  p_event_id        UUID,
  p_portal_color    TEXT,
  p_xp_earned       INTEGER,
  p_gold_earned     INTEGER,
  p_fragment_earned BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_already_won BOOLEAN;
  v_fragments   INTEGER;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM portal_runs
    WHERE user_id      = auth.uid()
      AND event_id     = p_event_id
      AND portal_color = p_portal_color
      AND completed    = TRUE
  ) INTO v_already_won;

  IF v_already_won THEN
    RETURN jsonb_build_object('already_claimed', TRUE, 'fragments', 0);
  END IF;

  INSERT INTO portal_runs
    (user_id, event_id, portal_color, completed, fragment_earned, xp_earned, gold_earned)
  VALUES
    (auth.uid(), p_event_id, p_portal_color, TRUE,
     p_fragment_earned, p_xp_earned, p_gold_earned);

  IF p_fragment_earned THEN
    INSERT INTO player_portal_fragments(user_id, fragments, lifetime_fragments)
    VALUES (auth.uid(), 1, 1)
    ON CONFLICT (user_id) DO UPDATE SET
      fragments          = player_portal_fragments.fragments + 1,
      lifetime_fragments = player_portal_fragments.lifetime_fragments + 1,
      updated_at         = NOW();
  END IF;

  SELECT COALESCE(
    (SELECT fragments FROM player_portal_fragments WHERE user_id = auth.uid()), 0
  ) INTO v_fragments;

  RETURN jsonb_build_object(
    'already_claimed', FALSE,
    'fragments',       v_fragments
  );
END;
$$;

-- ── RPC: get_my_fragments ────────────────────────────────────
CREATE OR REPLACE FUNCTION get_my_fragments()
RETURNS TABLE (fragments INTEGER, lifetime_fragments INTEGER)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(f.fragments, 0)::INTEGER,
    COALESCE(f.lifetime_fragments, 0)::INTEGER
  FROM (SELECT auth.uid() AS uid) u
  LEFT JOIN player_portal_fragments f ON f.user_id = u.uid;
END;
$$;

-- ── RPC: create_fragment_dungeon ─────────────────────────────
CREATE OR REPLACE FUNCTION create_fragment_dungeon(
  p_tier         TEXT,
  p_is_public    BOOLEAN,
  p_display_name TEXT,
  p_level        INTEGER,
  p_atk          INTEGER,
  p_def          INTEGER,
  p_hp           INTEGER,
  p_max_hp       INTEGER,
  p_class        TEXT DEFAULT 'novato'
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_fragments   INTEGER;
  v_session_id  UUID;
  v_invite_code TEXT;
BEGIN
  SELECT COALESCE(fragments, 0) INTO v_fragments
  FROM player_portal_fragments WHERE user_id = auth.uid();

  IF v_fragments < 10 THEN
    RETURN jsonb_build_object(
      'error', 'Fragmentos insuficientes. Necessário: 10, você tem: ' || v_fragments
    );
  END IF;

  v_invite_code := UPPER(SUBSTRING(MD5(gen_random_uuid()::TEXT), 1, 6));
  v_session_id  := gen_random_uuid();

  UPDATE player_portal_fragments
  SET fragments = fragments - 10, updated_at = NOW()
  WHERE user_id = auth.uid();

  INSERT INTO fragment_dungeon_sessions
    (id, host_id, dungeon_tier, is_public, invite_code, status)
  VALUES
    (v_session_id, auth.uid(), p_tier, p_is_public, v_invite_code, 'lobby');

  INSERT INTO fragment_dungeon_players
    (session_id, user_id, display_name, player_level, player_atk, player_def,
     player_class, current_hp, max_hp, is_host)
  VALUES
    (v_session_id, auth.uid(), p_display_name, p_level, p_atk, p_def,
     p_class, p_hp, p_max_hp, TRUE);

  RETURN jsonb_build_object(
    'session_id',  v_session_id,
    'invite_code', v_invite_code,
    'tier',        p_tier
  );
END;
$$;

-- ── RPC: join_fragment_dungeon ───────────────────────────────
CREATE OR REPLACE FUNCTION join_fragment_dungeon(
  p_invite_code  TEXT,
  p_display_name TEXT,
  p_level        INTEGER,
  p_atk          INTEGER,
  p_def          INTEGER,
  p_hp           INTEGER,
  p_max_hp       INTEGER,
  p_class        TEXT DEFAULT 'novato'
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_session fragment_dungeon_sessions%ROWTYPE;
  v_count   INTEGER;
BEGIN
  SELECT * INTO v_session
  FROM fragment_dungeon_sessions
  WHERE invite_code = UPPER(p_invite_code) AND status = 'lobby';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Sessão não encontrada ou já iniciada.');
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM fragment_dungeon_players WHERE session_id = v_session.id;

  IF v_count >= v_session.max_players THEN
    RETURN jsonb_build_object(
      'error', 'Sessão cheia (máx ' || v_session.max_players || ' jogadores).'
    );
  END IF;

  -- idempotente: já está na sessão
  IF EXISTS(
    SELECT 1 FROM fragment_dungeon_players
    WHERE session_id = v_session.id AND user_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object(
      'session_id',  v_session.id,
      'invite_code', v_session.invite_code,
      'tier',        v_session.dungeon_tier,
      'already_in',  TRUE
    );
  END IF;

  INSERT INTO fragment_dungeon_players
    (session_id, user_id, display_name, player_level, player_atk, player_def,
     player_class, current_hp, max_hp, is_host)
  VALUES
    (v_session.id, auth.uid(), p_display_name, p_level, p_atk, p_def,
     p_class, p_hp, p_max_hp, FALSE);

  RETURN jsonb_build_object(
    'session_id',  v_session.id,
    'invite_code', v_session.invite_code,
    'tier',        v_session.dungeon_tier,
    'is_public',   v_session.is_public
  );
END;
$$;

-- ── RPC: get_public_fragment_dungeons ────────────────────────
CREATE OR REPLACE FUNCTION get_public_fragment_dungeons()
RETURNS TABLE (
  session_id   UUID,
  host_name    TEXT,
  dungeon_tier TEXT,
  invite_code  TEXT,
  player_count BIGINT,
  max_players  INTEGER,
  created_at   TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    COALESCE(hp.display_name, 'Herói') AS host_name,
    s.dungeon_tier,
    s.invite_code,
    COUNT(fp.id),
    s.max_players,
    s.created_at
  FROM fragment_dungeon_sessions s
  LEFT JOIN fragment_dungeon_players hp
    ON hp.session_id = s.id AND hp.is_host = TRUE
  LEFT JOIN fragment_dungeon_players fp
    ON fp.session_id = s.id
  WHERE s.is_public = TRUE
    AND s.status    = 'lobby'
    AND s.created_at > NOW() - INTERVAL '3 hours'
  GROUP BY s.id, hp.display_name
  ORDER BY s.created_at DESC
  LIMIT 20;
END;
$$;

-- ── Seed: evento semanal atual ────────────────────────────────
-- Cria o evento da semana atual se ainda não existir.
INSERT INTO portal_events(starts_at, ends_at)
VALUES (
  date_trunc('week', NOW() AT TIME ZONE 'UTC'),
  date_trunc('week', NOW() AT TIME ZONE 'UTC') + INTERVAL '7 days' - INTERVAL '1 second'
)
ON CONFLICT DO NOTHING;
