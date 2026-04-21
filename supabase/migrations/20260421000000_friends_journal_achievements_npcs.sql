-- =============================================================
-- Migration: Sistema de Amigos, Diário de Aventura,
--            Conquistas e NPCs com recompensas reais
-- =============================================================

-- ─────────────────────────────────────────
-- 1. SISTEMA DE AMIGOS
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.friend_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requester_id, receiver_id)
);

-- Índices para buscas rápidas
CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver  ON public.friend_requests (receiver_id, status);
CREATE INDEX IF NOT EXISTS idx_friend_requests_requester ON public.friend_requests (requester_id, status);

-- RLS
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_see_own_requests"  ON public.friend_requests
  FOR SELECT USING (auth.uid() = requester_id OR auth.uid() = receiver_id);

CREATE POLICY "users_send_requests"     ON public.friend_requests
  FOR INSERT WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "receiver_updates_status" ON public.friend_requests
  FOR UPDATE USING (auth.uid() = receiver_id OR auth.uid() = requester_id);

CREATE POLICY "users_delete_own_requests" ON public.friend_requests
  FOR DELETE USING (auth.uid() = requester_id OR auth.uid() = receiver_id);

-- ─────────────────────────────────────────
-- 2. DIÁRIO DE AVENTURA
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.adventure_journal (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  content    text NOT NULL DEFAULT '',
  mood       text CHECK (mood IN ('feliz', 'neutro', 'cansado', 'motivado', 'ansioso')) DEFAULT 'neutro',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, entry_date)
);

CREATE INDEX IF NOT EXISTS idx_adventure_journal_user_date
  ON public.adventure_journal (user_id, entry_date DESC);

ALTER TABLE public.adventure_journal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_journal" ON public.adventure_journal
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────
-- 3. SISTEMA DE CONQUISTAS
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.achievements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text UNIQUE NOT NULL,
  title           text NOT NULL,
  description     text NOT NULL,
  icon            text NOT NULL DEFAULT '🏆',
  xp_reward       int  NOT NULL DEFAULT 30,
  gold_reward     int  NOT NULL DEFAULT 20,
  condition_type  text NOT NULL,  -- ex: 'missions_streak', 'boss_kill', 'level_reached'
  condition_value int  NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_achievements (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id uuid NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  unlocked_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_user_achievements_user
  ON public.user_achievements (user_id, unlocked_at DESC);

ALTER TABLE public.achievements     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "achievements_public_read" ON public.achievements FOR SELECT USING (true);

CREATE POLICY "users_see_own_achievements" ON public.user_achievements
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "system_grants_achievements" ON public.user_achievements
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Conquistas iniciais
INSERT INTO public.achievements (slug, title, description, icon, xp_reward, gold_reward, condition_type, condition_value) VALUES
  ('first_mission',       'Primeiro Passo',       'Complete sua primeira missão.',                 '🌱', 30,  20, 'missions_total',  1),
  ('missions_7_streak',   'Semana Perfeita',       'Complete missões por 7 dias seguidos.',         '🔥', 80,  50, 'missions_streak', 7),
  ('missions_30_total',   'Veterano',              'Complete 30 missões ao longo do jogo.',         '⚔️', 60,  40, 'missions_total',  30),
  ('boss_first_kill',     'Caçador de Bosses',     'Derrote um boss pela primeira vez.',            '💀', 100, 60, 'boss_kills',      1),
  ('boss_5_kills',        'Exterminador',          'Derrote 5 bosses diferentes.',                  '🗡️', 150, 80, 'boss_kills',      5),
  ('level_5',             'Aprendiz Dedicado',     'Alcance o nível 5.',                            '📈', 40,  25, 'level_reached',   5),
  ('level_10',            'Guerreiro Experiente',  'Alcance o nível 10.',                           '🌟', 70,  45, 'level_reached',   10),
  ('level_20',            'Mestre da Jornada',     'Alcance o nível 20.',                           '👑', 120, 75, 'level_reached',   20),
  ('journal_7_entries',   'Cronista',              'Escreva no diário por 7 dias diferentes.',      '📖', 50,  30, 'journal_entries', 7),
  ('friend_first',        'Laços de Aventura',     'Adicione seu primeiro amigo.',                  '🤝', 40,  25, 'friends_total',   1),
  ('water_7_days',        'Hidratado',             'Beba toda a meta de água por 7 dias seguidos.', '💧', 50,  30, 'water_streak',    7),
  ('full_loadout',        'Arsenal Completo',      'Equipe 4 habilidades no loadout de combate.',   '🎯', 30,  20, 'loadout_full',    4)
ON CONFLICT (slug) DO NOTHING;

-- ─────────────────────────────────────────
-- 4. DESAFIOS DE NPC (substitui localStorage)
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.npc_challenge_completions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  npc_id       text NOT NULL,
  challenge_id text NOT NULL,
  week_token   text NOT NULL,  -- token da semana (segunda-feira YYYY-MM-DD)
  completed_at timestamptz NOT NULL DEFAULT now(),
  xp_earned    int NOT NULL DEFAULT 0,
  gold_earned  int NOT NULL DEFAULT 0,
  UNIQUE (user_id, npc_id, challenge_id, week_token)
);

CREATE INDEX IF NOT EXISTS idx_npc_completions_user_week
  ON public.npc_challenge_completions (user_id, week_token);

ALTER TABLE public.npc_challenge_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_npc_completions" ON public.npc_challenge_completions
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
