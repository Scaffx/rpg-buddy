-- ============================================================
-- DUNGEON CO-OP SYSTEM
-- Sessions + players + invite codes + RPC helpers
-- ============================================================

-- ── Sessions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dungeon_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dungeon_id    TEXT NOT NULL,
  host_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invite_code   TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'waiting',   -- waiting | in_progress | completed | failed
  layout_index  INTEGER NOT NULL DEFAULT 0,
  current_room  INTEGER NOT NULL DEFAULT 0,
  session_log   JSONB NOT NULL DEFAULT '[]'::jsonb,
  session_loot  JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dungeon_sessions_invite_code_key UNIQUE (invite_code),
  CONSTRAINT dungeon_sessions_status_check CHECK (status IN ('waiting','in_progress','completed','failed'))
);

-- ── Session players ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dungeon_session_players (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES dungeon_sessions(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  TEXT NOT NULL,
  current_hp    INTEGER NOT NULL,
  max_hp        INTEGER NOT NULL,
  player_level  INTEGER NOT NULL DEFAULT 1,
  player_atk    INTEGER NOT NULL DEFAULT 10,
  player_def    INTEGER NOT NULL DEFAULT 5,
  is_host       BOOLEAN NOT NULL DEFAULT FALSE,
  is_alive      BOOLEAN NOT NULL DEFAULT TRUE,
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dungeon_session_players_unique UNIQUE (session_id, user_id)
);

-- ── Indexes ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS dungeon_sessions_invite_code_idx ON dungeon_sessions (invite_code);
CREATE INDEX IF NOT EXISTS dungeon_sessions_host_idx ON dungeon_sessions (host_user_id);
CREATE INDEX IF NOT EXISTS dungeon_session_players_session_idx ON dungeon_session_players (session_id);
CREATE INDEX IF NOT EXISTS dungeon_session_players_user_idx ON dungeon_session_players (user_id);

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE dungeon_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dungeon_session_players ENABLE ROW LEVEL SECURITY;

-- Sessions: visible to host + members
CREATE POLICY "dungeon_sessions_select"
  ON dungeon_sessions FOR SELECT
  USING (
    host_user_id = auth.uid() OR
    id IN (SELECT session_id FROM dungeon_session_players WHERE user_id = auth.uid())
  );

CREATE POLICY "dungeon_sessions_insert"
  ON dungeon_sessions FOR INSERT
  WITH CHECK (host_user_id = auth.uid());

CREATE POLICY "dungeon_sessions_update"
  ON dungeon_sessions FOR UPDATE
  USING (host_user_id = auth.uid());

-- Session players: visible to all members of same session
CREATE POLICY "dungeon_session_players_select"
  ON dungeon_session_players FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM dungeon_sessions WHERE host_user_id = auth.uid()
      UNION
      SELECT session_id FROM dungeon_session_players dsp2 WHERE dsp2.user_id = auth.uid()
    )
  );

CREATE POLICY "dungeon_session_players_insert"
  ON dungeon_session_players FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "dungeon_session_players_update"
  ON dungeon_session_players FOR UPDATE
  USING (user_id = auth.uid());

-- ── Realtime ────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE dungeon_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE dungeon_session_players;

-- ── Helper: generate 6-char invite code ─────────────────────
CREATE OR REPLACE FUNCTION generate_dungeon_invite_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code  TEXT := '';
  i     INTEGER;
BEGIN
  FOR i IN 1..6 LOOP
    code := code || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN code;
END;
$$;

-- ── RPC: create_dungeon_session ──────────────────────────────
CREATE OR REPLACE FUNCTION create_dungeon_session(
  p_dungeon_id   TEXT,
  p_display_name TEXT,
  p_current_hp   INTEGER,
  p_max_hp       INTEGER,
  p_player_level INTEGER,
  p_player_atk   INTEGER,
  p_player_def   INTEGER
)
RETURNS TABLE (session_id UUID, invite_code TEXT, layout_index INTEGER)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_session_id   UUID;
  v_code         TEXT;
  v_layout       INTEGER;
  v_attempt      INTEGER := 0;
BEGIN
  -- Cancel any stale waiting session for this user+dungeon
  UPDATE dungeon_sessions SET status = 'failed'
  WHERE host_user_id = auth.uid()
    AND dungeon_id = p_dungeon_id
    AND status = 'waiting';

  -- Generate unique invite code
  LOOP
    v_code := generate_dungeon_invite_code();
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM dungeon_sessions ds WHERE ds.invite_code = v_code
    );
    v_attempt := v_attempt + 1;
    IF v_attempt > 20 THEN
      RAISE EXCEPTION 'Could not generate unique invite code';
    END IF;
  END LOOP;

  v_layout := floor(random() * 3)::integer;

  INSERT INTO dungeon_sessions (dungeon_id, host_user_id, invite_code, layout_index)
  VALUES (p_dungeon_id, auth.uid(), v_code, v_layout)
  RETURNING id INTO v_session_id;

  INSERT INTO dungeon_session_players
    (session_id, user_id, display_name, current_hp, max_hp, player_level, player_atk, player_def, is_host)
  VALUES
    (v_session_id, auth.uid(), p_display_name, p_current_hp, p_max_hp, p_player_level, p_player_atk, p_player_def, TRUE);

  RETURN QUERY SELECT v_session_id, v_code, v_layout;
END;
$$;

-- ── RPC: join_dungeon_session ────────────────────────────────
CREATE OR REPLACE FUNCTION join_dungeon_session(
  p_invite_code  TEXT,
  p_display_name TEXT,
  p_current_hp   INTEGER,
  p_max_hp       INTEGER,
  p_player_level INTEGER,
  p_player_atk   INTEGER,
  p_player_def   INTEGER
)
RETURNS TABLE (session_id UUID, dungeon_id TEXT, layout_index INTEGER, host_name TEXT)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_session      dungeon_sessions%ROWTYPE;
  v_player_count INTEGER;
  v_host_name    TEXT;
BEGIN
  SELECT * INTO v_session
  FROM dungeon_sessions
  WHERE invite_code = upper(p_invite_code)
    AND status = 'waiting';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sessão não encontrada ou já iniciada. Verifique o código.';
  END IF;

  SELECT COUNT(*) INTO v_player_count
  FROM dungeon_session_players WHERE session_id = v_session.id;

  IF v_player_count >= 4 THEN
    RAISE EXCEPTION 'Sessão cheia — máximo 4 jogadores.';
  END IF;

  -- Already joined → just return
  IF EXISTS (
    SELECT 1 FROM dungeon_session_players
    WHERE session_id = v_session.id AND user_id = auth.uid()
  ) THEN
    SELECT display_name INTO v_host_name
    FROM dungeon_session_players
    WHERE session_id = v_session.id AND is_host = TRUE
    LIMIT 1;
    RETURN QUERY SELECT v_session.id, v_session.dungeon_id, v_session.layout_index, v_host_name;
    RETURN;
  END IF;

  INSERT INTO dungeon_session_players
    (session_id, user_id, display_name, current_hp, max_hp, player_level, player_atk, player_def, is_host)
  VALUES
    (v_session.id, auth.uid(), p_display_name, p_current_hp, p_max_hp, p_player_level, p_player_atk, p_player_def, FALSE);

  SELECT display_name INTO v_host_name
  FROM dungeon_session_players
  WHERE session_id = v_session.id AND is_host = TRUE
  LIMIT 1;

  RETURN QUERY SELECT v_session.id, v_session.dungeon_id, v_session.layout_index, v_host_name;
END;
$$;

-- ── RPC: start_dungeon_session ───────────────────────────────
CREATE OR REPLACE FUNCTION start_dungeon_session(p_session_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_player_count INTEGER;
BEGIN
  -- Only host can start
  IF NOT EXISTS (
    SELECT 1 FROM dungeon_sessions
    WHERE id = p_session_id AND host_user_id = auth.uid() AND status = 'waiting'
  ) THEN
    RAISE EXCEPTION 'Apenas o host pode iniciar a sessão.';
  END IF;

  SELECT COUNT(*) INTO v_player_count
  FROM dungeon_session_players WHERE session_id = p_session_id;

  IF v_player_count < 2 THEN
    RAISE EXCEPTION 'Precisa de pelo menos 2 jogadores para iniciar.';
  END IF;

  UPDATE dungeon_sessions
  SET status = 'in_progress', updated_at = NOW()
  WHERE id = p_session_id;
END;
$$;

-- ── RPC: get_dungeon_session_with_players ────────────────────
CREATE OR REPLACE FUNCTION get_dungeon_session_with_players(p_session_id UUID)
RETURNS TABLE (
  session_id    UUID,
  dungeon_id    TEXT,
  status        TEXT,
  layout_index  INTEGER,
  invite_code   TEXT,
  player_count  BIGINT,
  players       JSONB
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ds.id,
    ds.dungeon_id,
    ds.status,
    ds.layout_index,
    ds.invite_code,
    (SELECT COUNT(*) FROM dungeon_session_players dsp2 WHERE dsp2.session_id = ds.id),
    (SELECT jsonb_agg(jsonb_build_object(
      'userId', dsp3.user_id,
      'displayName', dsp3.display_name,
      'hp', dsp3.current_hp,
      'maxHp', dsp3.max_hp,
      'level', dsp3.player_level,
      'atk', dsp3.player_atk,
      'def', dsp3.player_def,
      'isHost', dsp3.is_host,
      'isAlive', dsp3.is_alive
    ) ORDER BY dsp3.joined_at)
    FROM dungeon_session_players dsp3 WHERE dsp3.session_id = ds.id)
  FROM dungeon_sessions ds
  WHERE ds.id = p_session_id;
END;
$$;
