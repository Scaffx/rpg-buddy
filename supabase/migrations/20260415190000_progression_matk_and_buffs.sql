-- Add magic attack support for equipment balance
ALTER TABLE public.game_items
ADD COLUMN IF NOT EXISTS matk_bonus integer NOT NULL DEFAULT 0;

-- Safety fallback for environments where base economy tables are missing.
CREATE TABLE IF NOT EXISTS public.shop_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  cost_percent integer NOT NULL DEFAULT 10,
  duration text DEFAULT 'Instantaneo',
  icon text NOT NULL DEFAULT 'Gift',
  icon_color text DEFAULT 'cyan',
  effect text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_buffs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.shop_items(id) ON DELETE CASCADE,
  purchased_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  active boolean NOT NULL DEFAULT true
);

ALTER TABLE public.shop_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_buffs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'shop_items' AND policyname = 'Anyone can view shop items'
  ) THEN
    CREATE POLICY "Anyone can view shop items" ON public.shop_items FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_buffs' AND policyname = 'Users can view own buffs'
  ) THEN
    CREATE POLICY "Users can view own buffs" ON public.user_buffs FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_buffs' AND policyname = 'Users can insert own buffs'
  ) THEN
    CREATE POLICY "Users can insert own buffs" ON public.user_buffs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_buffs' AND policyname = 'Users can update own buffs'
  ) THEN
    CREATE POLICY "Users can update own buffs" ON public.user_buffs FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_buffs' AND policyname = 'Users can delete own buffs'
  ) THEN
    CREATE POLICY "Users can delete own buffs" ON public.user_buffs FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

-- Rebalance starter magic items with MATK so mages/clerics are not punished
UPDATE public.game_items
SET matk_bonus = 8
WHERE name = 'Grimorio Basico';

UPDATE public.game_items
SET matk_bonus = 6
WHERE name = 'Amuleto de Mana';

UPDATE public.game_items
SET matk_bonus = 7
WHERE name = 'Cajado de Luz';

UPDATE public.game_items
SET matk_bonus = 5
WHERE name = 'Rosario Divino';

-- Add MATK to some higher-tier magical drops
UPDATE public.game_items
SET matk_bonus = GREATEST(matk_bonus, 8)
WHERE name IN ('Orbe de Trevas', 'Cajado Amaldicoado', 'Gema Demoniaca');

UPDATE public.game_items
SET matk_bonus = GREATEST(matk_bonus, 12)
WHERE name IN ('Amuleto da Eternidade', 'Coroa do Deus Caido');

-- New time-shop buffs tied to formulas
INSERT INTO public.shop_items (name, description, cost_percent, duration, icon, icon_color, effect)
SELECT 'Foco Profundo', 'Aumenta o multiplicador de XP da rotina em +0.5 por 24h.', 40, '24h', 'Sparkles', 'purple', 'foco_profundo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.shop_items WHERE effect = 'foco_profundo'
);

INSERT INTO public.shop_items (name, description, cost_percent, duration, icon, icon_color, effect)
SELECT 'Adrenalina', 'Na proxima luta de boss, o ataque usa vantagem e +2 no multiplicador do d20.', 35, 'Proximo boss', 'Zap', 'orange', 'adrenalina'
WHERE NOT EXISTS (
  SELECT 1 FROM public.shop_items WHERE effect = 'adrenalina'
);
