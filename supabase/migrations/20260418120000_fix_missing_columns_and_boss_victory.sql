-- ============================================================
-- Fix: missing columns and boss victory registration
-- Run this in the Supabase Dashboard SQL editor
-- ============================================================

-- 1. Add requer_sintonizacao to game_items (if migration wasn't applied)
ALTER TABLE public.game_items
ADD COLUMN IF NOT EXISTS requer_sintonizacao boolean NOT NULL DEFAULT false;

-- 2. Mark epic/legendary items as requiring attunement
UPDATE public.game_items
SET requer_sintonizacao = true
WHERE rarity IN ('epico', 'lendario')
  AND requer_sintonizacao = false;

-- 3. Fix is_consumable for all consumable items that have an effect
UPDATE public.game_items
SET is_consumable = true
WHERE (category = 'consumable' OR effect IS NOT NULL)
  AND (is_consumable IS NULL OR is_consumable = false);

-- 4. Add combat_skill_loadout column to profiles (if migration wasn't applied)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS combat_skill_loadout jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 5. Add required_attribute columns to game_items (if missing)
ALTER TABLE public.game_items
ADD COLUMN IF NOT EXISTS required_attribute text,
ADD COLUMN IF NOT EXISTS required_attribute_level integer NOT NULL DEFAULT 1;

-- 6. Add signature_item_name to bosses (if missing)
ALTER TABLE public.bosses
ADD COLUMN IF NOT EXISTS signature_item_name text;

-- 7. Create combat_turn_logs table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.combat_turn_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  combate_id uuid NOT NULL REFERENCES public.combates_ativos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rodada integer NOT NULL DEFAULT 1,
  habilidade_player text,
  habilidade_boss text,
  dado_player integer NOT NULL DEFAULT 0,
  dado_boss integer NOT NULL DEFAULT 0,
  dano_player integer NOT NULL DEFAULT 0,
  dano_boss integer NOT NULL DEFAULT 0,
  efeitos_player jsonb NOT NULL DEFAULT '[]'::jsonb,
  efeitos_boss jsonb NOT NULL DEFAULT '[]'::jsonb,
  hp_boss_apos integer NOT NULL DEFAULT 0,
  hp_player_apos integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'em_andamento',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT combat_turn_logs_status_chk CHECK (status IN ('em_andamento', 'vitoria', 'derrota'))
);

ALTER TABLE public.combat_turn_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own combat turn logs" ON public.combat_turn_logs;
CREATE POLICY "Users can view own combat turn logs"
ON public.combat_turn_logs FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own combat turn logs" ON public.combat_turn_logs;
CREATE POLICY "Users can insert own combat turn logs"
ON public.combat_turn_logs FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_combat_turn_logs_combate_created
ON public.combat_turn_logs (combate_id, created_at DESC);

-- 8. Seed boss skills for bosses that still have empty skills
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bosses' AND column_name = 'skills'
  ) THEN
    UPDATE public.bosses
    SET skills = jsonb_build_array(
      jsonb_build_object('name', 'Golpe Brutal', 'desc', 'Ataque pesado e direto.', 'damage_multiplier', 1.15, 'effects', '[]'::jsonb),
      jsonb_build_object('name', 'Açoite Lento',  'desc', 'Reduz o ritmo do inimigo.', 'damage_multiplier', 0.95, 'effects', '["slow"]'::jsonb),
      jsonb_build_object('name', 'Postura de Pedra', 'desc', 'Mitiga parte do dano recebido.', 'damage_multiplier', 0.9, 'effects', '["damage_reduction"]'::jsonb)
    )
    WHERE skills IS NULL OR skills = '[]'::jsonb;
  END IF;
END
$$;
