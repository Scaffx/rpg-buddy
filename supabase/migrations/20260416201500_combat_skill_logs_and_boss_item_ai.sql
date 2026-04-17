-- Combat loadout, turn logs, and boss drop-item AI improvements

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS combat_skill_loadout jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.game_items
ADD COLUMN IF NOT EXISTS required_attribute text,
ADD COLUMN IF NOT EXISTS required_attribute_level integer NOT NULL DEFAULT 1;

ALTER TABLE public.bosses
ADD COLUMN IF NOT EXISTS signature_item_name text;

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
ON public.combat_turn_logs
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own combat turn logs" ON public.combat_turn_logs;
CREATE POLICY "Users can insert own combat turn logs"
ON public.combat_turn_logs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_combat_turn_logs_combate_created
ON public.combat_turn_logs (combate_id, created_at DESC);

-- Seed default structured skills for bosses that still have empty skills.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bosses'
      AND column_name = 'skills'
  ) THEN
    UPDATE public.bosses
    SET skills = jsonb_build_array(
      jsonb_build_object(
        'name', 'Golpe Brutal',
        'desc', 'Ataque pesado e direto.',
        'damage_multiplier', 1.15,
        'effects', jsonb_build_array()
      ),
      jsonb_build_object(
        'name', 'Açoite Lento',
        'desc', 'Ataque que reduz ritmo do inimigo.',
        'damage_multiplier', 0.95,
        'effects', jsonb_build_array('slow')
      ),
      jsonb_build_object(
        'name', 'Postura de Pedra',
        'desc', 'Mitiga parte do dano no turno.',
        'damage_multiplier', 0.9,
        'effects', jsonb_build_array('damage_reduction')
      )
    )
    WHERE skills IS NULL
       OR skills = '[]'::jsonb;
  END IF;
END
$$;

-- Signature item logic for themed bosses.
DO $$
DECLARE
  boss_name_col text := null;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bosses'
      AND column_name = 'name'
  ) THEN
    boss_name_col := 'name';
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bosses'
      AND column_name = 'nome'
  ) THEN
    boss_name_col := 'nome';
  END IF;

  IF boss_name_col IS NOT NULL THEN
    EXECUTE format(
      'UPDATE public.bosses
       SET signature_item_name = ''Espada de Pedra''
       WHERE lower(coalesce(%I, '''')) LIKE ''%%golem%%''
         AND (signature_item_name IS NULL OR signature_item_name = '''')',
      boss_name_col
    );
  END IF;
END
$$;

-- Ensure there is a themed drop for stone golems.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'game_items'
  ) THEN
    INSERT INTO public.game_items (
      name,
      description,
      icon,
      category,
      rarity,
      stat_label,
      atk_bonus,
      def_bonus,
      hp_bonus,
      level_required,
      boss_drop_level,
      required_attribute,
      required_attribute_level,
      requer_sintonizacao
    )
    SELECT
      'Espada de Pedra',
      'Lamina mineral pesada usada por guardioes de pedra.',
      '🪨',
      'weapon',
      'raro',
      '+18 ATK, +6 DEF',
      18,
      6,
      0,
      8,
      8,
      'forca',
      8,
      false
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.game_items gi
      WHERE gi.name = 'Espada de Pedra'
    );
  END IF;
END
$$;

-- Add requirement hints to key boss drops if still unset.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'game_items'
      AND column_name = 'required_attribute'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'game_items'
      AND column_name = 'required_attribute_level'
  ) THEN
    UPDATE public.game_items
    SET required_attribute = 'forca',
        required_attribute_level = GREATEST(1, level_required)
    WHERE category = 'weapon'
      AND boss_drop_level IS NOT NULL
      AND required_attribute IS NULL;

    UPDATE public.game_items
    SET required_attribute = 'resiliencia',
        required_attribute_level = GREATEST(1, level_required)
    WHERE category = 'armor'
      AND boss_drop_level IS NOT NULL
      AND required_attribute IS NULL;

    UPDATE public.game_items
    SET required_attribute = 'agilidade',
        required_attribute_level = GREATEST(1, level_required)
    WHERE category = 'accessory'
      AND boss_drop_level IS NOT NULL
      AND required_attribute IS NULL;
  END IF;
END
$$;
