-- ═══════════════════════════════════════════════════════════════════════════════
-- REPAIR COMPLETO: Garante todas as colunas e dados críticos no banco correto
-- Execute no Supabase Dashboard: https://app.supabase.com/project/jshauyvknqgxhzmslnoc/sql
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. profiles: colunas de classe e combat
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS combat_skill_loadout jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS current_class_id uuid,
  ADD COLUMN IF NOT EXISTS starter_class text,
  ADD COLUMN IF NOT EXISTS starter_item text,
  ADD COLUMN IF NOT EXISTS starter_kit_claimed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS class_kit_claimed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS inspired_available boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS inspired_earned_at timestamptz,
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS name_changed_at timestamptz;

-- 2. user_inventory: sintonizado
ALTER TABLE public.user_inventory
  ADD COLUMN IF NOT EXISTS sintonizado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS obtained_at timestamptz NOT NULL DEFAULT now();

-- 3. game_items: requer_sintonizacao e colunas de stats
ALTER TABLE public.game_items
  ADD COLUMN IF NOT EXISTS requer_sintonizacao boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS atk_bonus integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS matk_bonus integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS def_bonus integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hp_bonus integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mp_bonus integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS agi_bonus integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS crit_bonus integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_consumable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS level_required integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS boss_drop_level integer;

-- 4. Marca épicos/lendários como exigindo sintonização
UPDATE public.game_items
SET requer_sintonizacao = true
WHERE lower(coalesce(rarity, '')) IN ('epico', 'lendario')
  AND requer_sintonizacao = false;

-- 5. Índices úteis
CREATE INDEX IF NOT EXISTS idx_user_inventory_user_sintonizado
  ON public.user_inventory (user_id, sintonizado)
  WHERE sintonizado = true;

-- 6. Garantir permissões nas tabelas para anon e authenticated
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_inventory TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_items TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO anon, authenticated;

-- 7. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
