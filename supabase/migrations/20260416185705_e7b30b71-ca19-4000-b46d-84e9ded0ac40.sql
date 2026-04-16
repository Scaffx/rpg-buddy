
CREATE TABLE IF NOT EXISTS public.personagens (
  id UUID NOT NULL PRIMARY KEY,
  hp_max INTEGER NOT NULL DEFAULT 120,
  ataque_base INTEGER NOT NULL DEFAULT 14,
  defesa_base INTEGER NOT NULL DEFAULT 8,
  nivel INTEGER NOT NULL DEFAULT 1,
  xp_atual INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.personagens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own personagem" ON public.personagens;
CREATE POLICY "Users can view own personagem" ON public.personagens FOR SELECT TO authenticated USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can insert own personagem" ON public.personagens;
CREATE POLICY "Users can insert own personagem" ON public.personagens FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "Users can update own personagem" ON public.personagens;
CREATE POLICY "Users can update own personagem" ON public.personagens FOR UPDATE TO authenticated USING (auth.uid() = id);

ALTER TABLE public.bosses
  ADD COLUMN IF NOT EXISTS hp_max INTEGER,
  ADD COLUMN IF NOT EXISTS ataque_base INTEGER,
  ADD COLUMN IF NOT EXISTS defesa_base INTEGER;

UPDATE public.bosses
SET hp_max = COALESCE(hp_max, hp),
    ataque_base = COALESCE(ataque_base, COALESCE(damage_base, 10)::INTEGER),
    defesa_base = COALESCE(defesa_base, COALESCE(defense, 5)::INTEGER);

CREATE TABLE IF NOT EXISTS public.combates_ativos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  personagem_id UUID NOT NULL REFERENCES public.personagens(id) ON DELETE CASCADE,
  boss_id UUID NOT NULL REFERENCES public.bosses(id) ON DELETE CASCADE,
  hp_atual_boss INTEGER NOT NULL,
  hp_atual_personagem INTEGER NOT NULL,
  turno_atual TEXT NOT NULL DEFAULT 'player',
  status TEXT NOT NULL DEFAULT 'em_andamento',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.combates_ativos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own combats" ON public.combates_ativos;
CREATE POLICY "Users can view own combats" ON public.combates_ativos FOR SELECT TO authenticated USING (auth.uid() = personagem_id);
DROP POLICY IF EXISTS "Users can insert own combats" ON public.combates_ativos;
CREATE POLICY "Users can insert own combats" ON public.combates_ativos FOR INSERT TO authenticated WITH CHECK (auth.uid() = personagem_id);
DROP POLICY IF EXISTS "Users can update own combats" ON public.combates_ativos;
CREATE POLICY "Users can update own combats" ON public.combates_ativos FOR UPDATE TO authenticated USING (auth.uid() = personagem_id);
DROP POLICY IF EXISTS "Users can delete own combats" ON public.combates_ativos;
CREATE POLICY "Users can delete own combats" ON public.combates_ativos FOR DELETE TO authenticated USING (auth.uid() = personagem_id);

CREATE INDEX IF NOT EXISTS idx_combates_ativos_personagem ON public.combates_ativos(personagem_id, status);

DROP TRIGGER IF EXISTS update_personagens_updated_at ON public.personagens;
CREATE TRIGGER update_personagens_updated_at BEFORE UPDATE ON public.personagens FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_combates_ativos_updated_at ON public.combates_ativos;
CREATE TRIGGER update_combates_ativos_updated_at BEFORE UPDATE ON public.combates_ativos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.boss_weekly_loot_claims (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  boss_level INTEGER NOT NULL,
  week_start DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, boss_level, week_start)
);

ALTER TABLE public.boss_weekly_loot_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own loot claims" ON public.boss_weekly_loot_claims;
CREATE POLICY "Users manage own loot claims" ON public.boss_weekly_loot_claims FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.user_crafting_materials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  quantity INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_crafting_materials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own materials" ON public.user_crafting_materials;
CREATE POLICY "Users manage own materials" ON public.user_crafting_materials FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
