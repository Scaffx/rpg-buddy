
-- Add gold column to user_balance
ALTER TABLE public.user_balance ADD COLUMN IF NOT EXISTS gold integer NOT NULL DEFAULT 100;

-- Add failed mission fields to missions
ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS is_failed boolean NOT NULL DEFAULT false;
ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS xp_penalized integer NOT NULL DEFAULT 0;
ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS failed_date date;

-- Gold history table
CREATE TABLE public.gold_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  amount integer NOT NULL,
  reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.gold_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own gold history" ON public.gold_history
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own gold history" ON public.gold_history
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
