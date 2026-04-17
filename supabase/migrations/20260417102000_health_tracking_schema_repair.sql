-- Repair migration: ensure health/meal/water tracking schema exists even if DB was changed manually.
-- This migration is intentionally idempotent.

-- 1) Core table: user_health_stats
CREATE TABLE IF NOT EXISTS public.user_health_stats (
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_health_stats
  ADD COLUMN IF NOT EXISTS weight_kg NUMERIC DEFAULT 70,
  ADD COLUMN IF NOT EXISTS max_hp INTEGER DEFAULT 100,
  ADD COLUMN IF NOT EXISTS current_hp INTEGER DEFAULT 100,
  ADD COLUMN IF NOT EXISTS max_mp INTEGER DEFAULT 10,
  ADD COLUMN IF NOT EXISTS current_mp INTEGER DEFAULT 10,
  ADD COLUMN IF NOT EXISTS fatigue INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meals_target INTEGER DEFAULT 3,
  ADD COLUMN IF NOT EXISTS meals_completed INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS water_target_ml INTEGER DEFAULT 2450,
  ADD COLUMN IF NOT EXISTS water_completed_ml INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reset_date DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS user_health_stats_user_id_key
  ON public.user_health_stats(user_id);

ALTER TABLE public.user_health_stats ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_health_stats'
      AND policyname = 'Users can view own health stats'
  ) THEN
    CREATE POLICY "Users can view own health stats"
      ON public.user_health_stats FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_health_stats'
      AND policyname = 'Users can insert own health stats'
  ) THEN
    CREATE POLICY "Users can insert own health stats"
      ON public.user_health_stats FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_health_stats'
      AND policyname = 'Users can update own health stats'
  ) THEN
    CREATE POLICY "Users can update own health stats"
      ON public.user_health_stats FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END;
$$;


-- 2) Core table: meal_log
CREATE TABLE IF NOT EXISTS public.meal_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  meal_date DATE NOT NULL DEFAULT CURRENT_DATE,
  meal_number INTEGER NOT NULL,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.meal_log
  ADD COLUMN IF NOT EXISTS meal_date DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS meal_number INTEGER,
  ADD COLUMN IF NOT EXISTS logged_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_meal_log_user_date
  ON public.meal_log(user_id, meal_date);

ALTER TABLE public.meal_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'meal_log'
      AND policyname = 'Users can manage own meal logs'
  ) THEN
    CREATE POLICY "Users can manage own meal logs"
      ON public.meal_log FOR ALL
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END;
$$;

-- 3) Core table: water_log
CREATE TABLE IF NOT EXISTS public.water_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount_ml INTEGER NOT NULL DEFAULT 250,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.water_log
  ADD COLUMN IF NOT EXISTS log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS amount_ml INTEGER NOT NULL DEFAULT 250,
  ADD COLUMN IF NOT EXISTS logged_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_water_log_user_date
  ON public.water_log(user_id, log_date);

ALTER TABLE public.water_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'water_log'
      AND policyname = 'Users can manage own water logs'
  ) THEN
    CREATE POLICY "Users can manage own water logs"
      ON public.water_log FOR ALL
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END;
$$;

-- 4) Core table: daily_tracking
CREATE TABLE IF NOT EXISTS public.daily_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  water_ml INTEGER NOT NULL DEFAULT 0,
  meals_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_tracking
  ADD COLUMN IF NOT EXISTS date DATE,
  ADD COLUMN IF NOT EXISTS water_ml INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meals_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS daily_tracking_user_date_key
  ON public.daily_tracking(user_id, date);

ALTER TABLE public.daily_tracking ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'daily_tracking'
      AND policyname = 'Users can view own daily tracking'
  ) THEN
    CREATE POLICY "Users can view own daily tracking"
      ON public.daily_tracking FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'daily_tracking'
      AND policyname = 'Users can insert own daily tracking'
  ) THEN
    CREATE POLICY "Users can insert own daily tracking"
      ON public.daily_tracking FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'daily_tracking'
      AND policyname = 'Users can update own daily tracking'
  ) THEN
    CREATE POLICY "Users can update own daily tracking"
      ON public.daily_tracking FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'update_updated_at_column'
      AND pg_function_is_visible(oid)
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_daily_tracking_updated_at'
  ) THEN
    CREATE TRIGGER update_daily_tracking_updated_at
      BEFORE UPDATE ON public.daily_tracking
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END;
$$;

-- 5) Optional support table used in profile page: body_measurements
CREATE TABLE IF NOT EXISTS public.body_measurements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  measured_at DATE NOT NULL DEFAULT CURRENT_DATE,
  weight_kg NUMERIC,
  body_fat_percent NUMERIC,
  chest_cm NUMERIC,
  waist_cm NUMERIC,
  hip_cm NUMERIC,
  arm_cm NUMERIC,
  thigh_cm NUMERIC,
  calf_cm NUMERIC,
  photo_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.body_measurements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'body_measurements'
      AND policyname = 'Users can manage own body measurements'
  ) THEN
    CREATE POLICY "Users can manage own body measurements"
      ON public.body_measurements FOR ALL
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END;
$$;

-- 6) Keep mechanics logs seed resilient if table exists and rows are missing
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'system_update_logs'
  ) THEN
    INSERT INTO public.system_update_logs (version_tag, title, summary, details, is_highlighted)
    SELECT
      'v0.9.0',
      'Documentação Completa de Mecânicas',
      'Guia detalhado de todos os sistemas do jogo incluindo Short Rest, XP scaling, Gold rewards, Talents e mais.',
      'Acesse "Meu Perfil" -> "Informações do Sistema" -> "Logs de Atualização" para consultar a tabela completa de mecânicas do RPG Buddy.',
      true
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.system_update_logs
      WHERE version_tag = 'v0.9.0'
        AND title = 'Documentação Completa de Mecânicas'
    );
  END IF;
END;
$$;