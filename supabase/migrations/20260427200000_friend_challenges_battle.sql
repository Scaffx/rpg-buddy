-- ============================================================
-- Desafios entre amigos: rotina e batalha Hero vs Hero
-- ============================================================

CREATE TABLE IF NOT EXISTS friend_challenges (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  challenger_id  uuid        NOT NULL,
  challenged_id  uuid        NOT NULL,
  status         text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'active', 'completed', 'expired')),
  challenge_type text        NOT NULL DEFAULT 'routine'
    CHECK (challenge_type IN ('routine', 'battle')),
  title          text        NOT NULL,
  description    text,
  duration_days  integer     DEFAULT 7,
  winner_id      uuid,
  challenger_completed boolean NOT NULL DEFAULT false,
  challenged_completed boolean NOT NULL DEFAULT false,
  battle_log     jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  accepted_at    timestamptz,
  expires_at     timestamptz,
  completed_at   timestamptz,
  CONSTRAINT fk_challenger FOREIGN KEY (challenger_id)
    REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_challenged FOREIGN KEY (challenged_id)
    REFERENCES public.profiles(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS friend_challenges_challenger_idx ON friend_challenges(challenger_id);
CREATE INDEX IF NOT EXISTS friend_challenges_challenged_idx ON friend_challenges(challenged_id);
CREATE INDEX IF NOT EXISTS friend_challenges_status_idx    ON friend_challenges(status);

-- RLS
ALTER TABLE friend_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view_own_challenges" ON friend_challenges
  FOR SELECT USING (auth.uid() = challenger_id OR auth.uid() = challenged_id);

CREATE POLICY "create_challenge" ON friend_challenges
  FOR INSERT WITH CHECK (auth.uid() = challenger_id);

CREATE POLICY "update_own_challenges" ON friend_challenges
  FOR UPDATE USING (auth.uid() = challenger_id OR auth.uid() = challenged_id);
