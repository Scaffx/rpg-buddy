-- ==========================================================
-- Inspiration (Dia Perfeito) support on profile
-- ==========================================================
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS inspired_available boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS inspired_earned_at timestamptz;

-- ==========================================================
-- Weekly loot lock per boss level
-- ==========================================================
CREATE TABLE IF NOT EXISTS public.boss_weekly_loot_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  boss_level integer NOT NULL,
  week_start date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, boss_level, week_start)
);

ALTER TABLE public.boss_weekly_loot_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own weekly loot claims"
  ON public.boss_weekly_loot_claims
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own weekly loot claims"
  ON public.boss_weekly_loot_claims
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ==========================================================
-- Basic crafting materials wallet (fallback reward)
-- ==========================================================
CREATE TABLE IF NOT EXISTS public.user_crafting_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  quantity integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_crafting_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own crafting materials"
  ON public.user_crafting_materials
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own crafting materials"
  ON public.user_crafting_materials
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own crafting materials"
  ON public.user_crafting_materials
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
