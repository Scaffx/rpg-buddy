
CREATE TABLE public.user_health_stats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  weight_kg NUMERIC DEFAULT 70,
  max_hp INTEGER DEFAULT 100,
  current_hp INTEGER DEFAULT 100,
  max_mp INTEGER DEFAULT 10,
  current_mp INTEGER DEFAULT 10,
  fatigue INTEGER DEFAULT 0,
  meals_target INTEGER DEFAULT 3,
  meals_completed INTEGER DEFAULT 0,
  water_target_ml INTEGER DEFAULT 2450,
  water_completed_ml INTEGER DEFAULT 0,
  last_reset_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.user_health_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own health stats"
  ON public.user_health_stats FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own health stats"
  ON public.user_health_stats FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own health stats"
  ON public.user_health_stats FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.meal_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  meal_date DATE NOT NULL DEFAULT CURRENT_DATE,
  meal_number INTEGER NOT NULL,
  logged_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.meal_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own meal logs"
  ON public.meal_log FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.water_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount_ml INTEGER NOT NULL DEFAULT 250,
  logged_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.water_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own water logs"
  ON public.water_log FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
