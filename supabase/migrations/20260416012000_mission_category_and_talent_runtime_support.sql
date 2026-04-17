-- Runtime support for category-talent business rules

ALTER TABLE public.missions
ADD COLUMN IF NOT EXISTS mission_category text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'missions_mission_category_check'
  ) THEN
    ALTER TABLE public.missions
    ADD CONSTRAINT missions_mission_category_check
    CHECK (mission_category IN ('fisico', 'casa', 'criativo', 'social', 'ar_livre', 'estudo', 'geral'));
  END IF;
END $$;

-- Backfill mission_category using primary attribute and mission text heuristics.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'attributes'
  ) THEN
    UPDATE public.missions m
    SET mission_category = CASE
      WHEN m.mission_category IS NOT NULL THEN m.mission_category
      WHEN lower(coalesce(a.name, '')) IN ('forca', 'agilidade', 'vitalidade', 'resiliencia') THEN 'fisico'
      WHEN lower(coalesce(a.name, '')) IN ('inteligencia', 'sabedoria', 'disciplina') THEN 'estudo'
      WHEN lower(coalesce(a.name, '')) = 'criatividade' THEN 'criativo'
      WHEN lower(coalesce(a.name, '')) IN ('carisma', 'relacionamento') THEN 'social'
      WHEN lower(coalesce(m.title, '') || ' ' || coalesce(m.description, '')) ~ '(casa|limpeza|cozinha|arrumar|faxina)' THEN 'casa'
      WHEN lower(coalesce(m.title, '') || ' ' || coalesce(m.description, '')) ~ '(parque|trilha|praia|ar livre|natureza|externo)' THEN 'ar_livre'
      ELSE 'geral'
    END
    FROM public.attributes a
    WHERE m.attribute_id = a.id
      AND m.mission_category IS NULL;
  END IF;
END
$$;

UPDATE public.missions
SET mission_category = 'geral'
WHERE mission_category IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'user_health_stats'
  ) THEN
    ALTER TABLE public.user_health_stats
    ADD COLUMN IF NOT EXISTS talent_bonus_hp integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS talent_bonus_mp integer NOT NULL DEFAULT 0;
  END IF;
END
$$;

-- One-shot buff for Estado de Fluxo (+20% XP next mission).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'shop_items'
  ) THEN
    INSERT INTO public.shop_items (name, description, cost_percent, duration, icon, icon_color, effect)
    SELECT
      'Estado de Fluxo',
      'Bonus de +20% XP para a proxima missao concluida.',
      0,
      'Proxima missao',
      'Sparkles',
      'blue',
      'estado_fluxo_xp'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.shop_items WHERE effect = 'estado_fluxo_xp'
    );
  END IF;
END
$$;
