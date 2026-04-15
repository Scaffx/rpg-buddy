
CREATE TABLE IF NOT EXISTS public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  target_value integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Safety fallback for environments where migration history exists but base tables are missing.
CREATE TABLE IF NOT EXISTS public.missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  attribute_id uuid,
  xp_reward integer NOT NULL DEFAULT 25,
  priority text,
  status text,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  days_of_week jsonb DEFAULT '[]'::jsonb,
  daily_status jsonb DEFAULT '{}'::jsonb,
  horario_provavel text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  failed_date date,
  due_date date,
  secondary_attribute_ids jsonb DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS public.plan_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  value_per_completion integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(plan_id, mission_id)
);

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_missions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'plans' AND policyname = 'Users can manage own plans'
  ) THEN
    CREATE POLICY "Users can manage own plans" ON public.plans
      FOR ALL TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'plan_missions' AND policyname = 'Users can manage own plan_missions'
  ) THEN
    CREATE POLICY "Users can manage own plan_missions" ON public.plan_missions
      FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.plans p
          WHERE p.id = plan_missions.plan_id
          AND p.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.plans p
          WHERE p.id = plan_missions.plan_id
          AND p.user_id = auth.uid()
        )
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_plans_updated_at ON public.plans;
CREATE TRIGGER update_plans_updated_at
BEFORE UPDATE ON public.plans
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
