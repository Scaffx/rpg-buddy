-- Combat Arena schema for turn-based battles with Supabase Edge Functions

-- 1) Extend existing bosses table with fields expected by combat engine.
ALTER TABLE public.bosses
  ADD COLUMN IF NOT EXISTS nome TEXT,
  ADD COLUMN IF NOT EXISTS hp_max INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS ataque_base INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS defesa_base INTEGER NOT NULL DEFAULT 8;

UPDATE public.bosses
SET
  nome = COALESCE(nome, name),
  hp_max = COALESCE(hp_max, hp),
  ataque_base = COALESCE(ataque_base, damage_base, 15),
  defesa_base = COALESCE(defesa_base, defense, 8)
WHERE nome IS NULL
   OR hp_max IS NULL
   OR ataque_base IS NULL
   OR defesa_base IS NULL;

-- 2) Characters table (1:1 with authenticated user).
CREATE TABLE IF NOT EXISTS public.personagens (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  hp_max INTEGER NOT NULL DEFAULT 120,
  ataque_base INTEGER NOT NULL DEFAULT 18,
  defesa_base INTEGER NOT NULL DEFAULT 10,
  xp_atual INTEGER NOT NULL DEFAULT 0,
  nivel INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT personagens_hp_positive CHECK (hp_max > 0),
  CONSTRAINT personagens_attack_non_negative CHECK (ataque_base >= 0),
  CONSTRAINT personagens_defense_non_negative CHECK (defesa_base >= 0),
  CONSTRAINT personagens_level_positive CHECK (nivel > 0),
  CONSTRAINT personagens_xp_non_negative CHECK (xp_atual >= 0)
);

ALTER TABLE public.personagens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own personagem"
ON public.personagens
FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "Users can insert own personagem"
ON public.personagens
FOR INSERT
WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own personagem"
ON public.personagens
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can delete own personagem"
ON public.personagens
FOR DELETE
USING (auth.uid() = id);

DROP TRIGGER IF EXISTS update_personagens_updated_at ON public.personagens;
CREATE TRIGGER update_personagens_updated_at
BEFORE UPDATE ON public.personagens
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Active combat table.
CREATE TABLE IF NOT EXISTS public.combates_ativos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  personagem_id UUID NOT NULL REFERENCES public.personagens(id) ON DELETE CASCADE,
  boss_id UUID NOT NULL REFERENCES public.bosses(id) ON DELETE RESTRICT,
  hp_atual_boss INTEGER NOT NULL,
  hp_atual_personagem INTEGER NOT NULL,
  turno_atual TEXT NOT NULL DEFAULT 'player',
  status TEXT NOT NULL DEFAULT 'em_andamento',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT combates_hp_boss_non_negative CHECK (hp_atual_boss >= 0),
  CONSTRAINT combates_hp_personagem_non_negative CHECK (hp_atual_personagem >= 0),
  CONSTRAINT combates_turno_valid CHECK (turno_atual IN ('player', 'boss')),
  CONSTRAINT combates_status_valid CHECK (status IN ('em_andamento', 'vitoria', 'derrota'))
);

CREATE INDEX IF NOT EXISTS idx_combates_ativos_personagem_status
  ON public.combates_ativos(personagem_id, status);

CREATE INDEX IF NOT EXISTS idx_combates_ativos_boss
  ON public.combates_ativos(boss_id);

ALTER TABLE public.combates_ativos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own active combats"
ON public.combates_ativos
FOR SELECT
USING (auth.uid() = personagem_id);

CREATE POLICY "Users can insert own active combats"
ON public.combates_ativos
FOR INSERT
WITH CHECK (auth.uid() = personagem_id);

CREATE POLICY "Users can update own active combats"
ON public.combates_ativos
FOR UPDATE
USING (auth.uid() = personagem_id)
WITH CHECK (auth.uid() = personagem_id);

CREATE POLICY "Users can delete own active combats"
ON public.combates_ativos
FOR DELETE
USING (auth.uid() = personagem_id);

DROP TRIGGER IF EXISTS update_combates_ativos_updated_at ON public.combates_ativos;
CREATE TRIGGER update_combates_ativos_updated_at
BEFORE UPDATE ON public.combates_ativos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
