-- Reparo: adiciona colunas ausentes no banco remoto
-- 1. combat_skill_loadout em profiles (loadout de habilidades de combate)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS combat_skill_loadout jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2. sintonizado em user_inventory (sintonizacao de itens magicos)
ALTER TABLE public.user_inventory
ADD COLUMN IF NOT EXISTS sintonizado boolean NOT NULL DEFAULT false;

-- 3. requer_sintonizacao em game_items (caso tambem nao exista)
ALTER TABLE public.game_items
ADD COLUMN IF NOT EXISTS requer_sintonizacao boolean NOT NULL DEFAULT false;

-- Marca itens epicos e lendarios como exigindo sintonizacao
UPDATE public.game_items
SET requer_sintonizacao = true
WHERE lower(coalesce(rarity, '')) IN ('epico', 'lendario')
  AND requer_sintonizacao = false;

-- Indice para consultas de sintonizacao por usuario
CREATE INDEX IF NOT EXISTS idx_user_inventory_user_sintonizado
ON public.user_inventory (user_id, sintonizado)
WHERE sintonizado = true;
