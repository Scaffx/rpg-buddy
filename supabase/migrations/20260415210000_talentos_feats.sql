-- Feats / Talentos base
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS pontos_talento integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.talentos_disponiveis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  descricao text NOT NULL,
  efeito text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.talentos_jogador (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  personagem_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  talento_id uuid NOT NULL REFERENCES public.talentos_disponiveis(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (personagem_id, talento_id)
);

ALTER TABLE public.talentos_disponiveis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talentos_jogador ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'talentos_disponiveis' AND policyname = 'Anyone can view talentos disponiveis'
  ) THEN
    CREATE POLICY "Anyone can view talentos disponiveis"
      ON public.talentos_disponiveis
      FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'talentos_jogador' AND policyname = 'Users can view own talentos'
  ) THEN
    CREATE POLICY "Users can view own talentos"
      ON public.talentos_jogador
      FOR SELECT TO authenticated
      USING (auth.uid() = personagem_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'talentos_jogador' AND policyname = 'Users can insert own talentos'
  ) THEN
    CREATE POLICY "Users can insert own talentos"
      ON public.talentos_jogador
      FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = personagem_id);
  END IF;
END $$;

INSERT INTO public.talentos_disponiveis (nome, descricao, efeito)
VALUES
  ('Madrugador', '+15% XP antes das 8h.', 'madrugador'),
  ('Foco Inabalavel', 'Combo dura ate 48h entre conclusoes.', 'foco_inabalavel'),
  ('Mestre Mercador', '10% de desconto na loja.', 'mestre_mercador')
ON CONFLICT (efeito) DO UPDATE
SET nome = EXCLUDED.nome,
    descricao = EXCLUDED.descricao;

CREATE OR REPLACE FUNCTION public.sync_talent_points_on_level_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_chunks integer;
  new_chunks integer;
  gain integer;
BEGIN
  old_chunks := floor(COALESCE(OLD.level, 1) / 5.0);
  new_chunks := floor(COALESCE(NEW.level, 1) / 5.0);
  gain := GREATEST(0, new_chunks - old_chunks);

  IF gain > 0 THEN
    NEW.pontos_talento := COALESCE(NEW.pontos_talento, 0) + gain;
  ELSE
    NEW.pontos_talento := COALESCE(NEW.pontos_talento, 0);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_talent_points_on_level_change_trigger ON public.profiles;
CREATE TRIGGER sync_talent_points_on_level_change_trigger
BEFORE UPDATE OF level ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_talent_points_on_level_change();

-- Backfill inicial para usuarios existentes (feature nova).
UPDATE public.profiles
SET pontos_talento = GREATEST(COALESCE(pontos_talento, 0), floor(COALESCE(level, 1) / 5.0));
