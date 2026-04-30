-- 1. Profile inspiration columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS inspired_available boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS inspired_earned_at timestamptz;

-- 2. Boss signature item
ALTER TABLE public.bosses
  ADD COLUMN IF NOT EXISTS signature_item_name text;

-- 3. Game items extra columns used by combat
ALTER TABLE public.game_items
  ADD COLUMN IF NOT EXISTS matk_bonus integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS required_attribute text,
  ADD COLUMN IF NOT EXISTS required_attribute_level integer;

-- 4. Combat turn logs
CREATE TABLE IF NOT EXISTS public.combat_turn_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  combate_id uuid NOT NULL,
  user_id uuid NOT NULL,
  rodada integer NOT NULL,
  habilidade_player text,
  habilidade_boss text,
  dado_player integer,
  dado_boss integer,
  dano_player integer,
  dano_boss integer,
  efeitos_player jsonb DEFAULT '[]'::jsonb,
  efeitos_boss jsonb DEFAULT '[]'::jsonb,
  hp_boss_apos integer,
  hp_player_apos integer,
  status text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_combat_turn_logs_combate ON public.combat_turn_logs(combate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_combat_turn_logs_user ON public.combat_turn_logs(user_id, created_at DESC);

ALTER TABLE public.combat_turn_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own combat logs" ON public.combat_turn_logs;
CREATE POLICY "Users can view own combat logs"
  ON public.combat_turn_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own combat logs" ON public.combat_turn_logs;
CREATE POLICY "Users can insert own combat logs"
  ON public.combat_turn_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 5. Missing INSERT policy on attributes (guarded for drifted schemas)
DO $$
BEGIN
  IF to_regclass('public.attributes') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Users can insert own attributes" ON public.attributes;
    CREATE POLICY "Users can insert own attributes"
      ON public.attributes FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- 6. Clean stuck combats older than 24h
UPDATE public.combates_ativos
SET status = 'derrota', updated_at = now()
WHERE status = 'em_andamento'
  AND updated_at < (now() - interval '24 hours');