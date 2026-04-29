CREATE TABLE IF NOT EXISTS public.npc_weekly_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_token text NOT NULL,
  npc_id text NOT NULL,
  challenge_id text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  xp_reward integer NOT NULL DEFAULT 25,
  gold_reward integer NOT NULL DEFAULT 10,
  reward_item_id uuid REFERENCES public.game_items(id) ON DELETE SET NULL,
  reward_item_quantity integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_token, challenge_id)
);

CREATE INDEX IF NOT EXISTS idx_npc_weekly_challenges_user_week
  ON public.npc_weekly_challenges (user_id, week_token);

ALTER TABLE public.npc_weekly_challenges ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'npc_weekly_challenges'
      AND policyname = 'users_own_npc_weekly_challenges'
  ) THEN
    CREATE POLICY "users_own_npc_weekly_challenges" ON public.npc_weekly_challenges
      FOR ALL TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.npc_weekly_challenges TO authenticated;