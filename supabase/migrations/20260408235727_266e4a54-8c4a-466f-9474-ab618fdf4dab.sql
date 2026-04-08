
-- 1. Enable RLS on daily_tracking
ALTER TABLE public.daily_tracking ENABLE ROW LEVEL SECURITY;

-- 2. Add owner-scoped policies
CREATE POLICY "Users can view own daily tracking"
  ON public.daily_tracking FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own daily tracking"
  ON public.daily_tracking FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own daily tracking"
  ON public.daily_tracking FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own daily tracking"
  ON public.daily_tracking FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 3. Make body-photos bucket private
UPDATE storage.buckets SET public = false WHERE id = 'body-photos';

-- 4. Remove the overly permissive public read policy
DROP POLICY IF EXISTS "Anyone can view body photos" ON storage.objects;
