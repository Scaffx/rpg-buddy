-- Daily tracking table
CREATE TABLE public.daily_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  water_ml INTEGER NOT NULL DEFAULT 0,
  meals_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);

ALTER TABLE public.daily_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own daily tracking" ON public.daily_tracking FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own daily tracking" ON public.daily_tracking FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own daily tracking" ON public.daily_tracking FOR UPDATE USING (auth.uid() = user_id);

CREATE TRIGGER update_daily_tracking_updated_at BEFORE UPDATE ON public.daily_tracking FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
