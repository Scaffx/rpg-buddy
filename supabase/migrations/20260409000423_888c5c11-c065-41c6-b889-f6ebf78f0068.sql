
-- Add user_id column
ALTER TABLE public.mission_daily_completions
  ADD COLUMN user_id uuid;

-- Backfill from missions table
UPDATE public.mission_daily_completions mdc
SET user_id = m.user_id
FROM public.missions m
WHERE mdc.mission_id = m.id;

-- Make NOT NULL after backfill
ALTER TABLE public.mission_daily_completions
  ALTER COLUMN user_id SET NOT NULL;

-- Drop old policies
DROP POLICY IF EXISTS "Users can insert own daily completions" ON public.mission_daily_completions;
DROP POLICY IF EXISTS "Users can view own daily completions" ON public.mission_daily_completions;

-- Create new direct user-scoped policies
CREATE POLICY "Users can view own daily completions"
  ON public.mission_daily_completions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own daily completions"
  ON public.mission_daily_completions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own daily completions"
  ON public.mission_daily_completions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own daily completions"
  ON public.mission_daily_completions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
