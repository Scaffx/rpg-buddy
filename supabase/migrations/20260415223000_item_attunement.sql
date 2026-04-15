-- Attunement / Sintonizacao de itens magicos
ALTER TABLE public.game_items
ADD COLUMN IF NOT EXISTS requer_sintonizacao boolean NOT NULL DEFAULT false;

ALTER TABLE public.user_inventory
ADD COLUMN IF NOT EXISTS sintonizado boolean NOT NULL DEFAULT false;

-- Itens epicos e lendarios exigem sintonizacao por padrao.
UPDATE public.game_items
SET requer_sintonizacao = true
WHERE lower(coalesce(rarity, '')) IN ('epico', 'lendario');

CREATE INDEX IF NOT EXISTS idx_user_inventory_user_sintonizado
ON public.user_inventory (user_id, sintonizado)
WHERE sintonizado = true;

CREATE OR REPLACE FUNCTION public.enforce_attunement_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  current_count integer;
BEGIN
  IF NEW.sintonizado IS TRUE AND (TG_OP = 'INSERT' OR COALESCE(OLD.sintonizado, FALSE) = FALSE) THEN
    SELECT COUNT(*)
      INTO current_count
    FROM public.user_inventory
    WHERE user_id = NEW.user_id
      AND sintonizado = true
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

    IF current_count >= 3 THEN
      RAISE EXCEPTION 'Limite de sintonizacao atingido (3/3).';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_attunement_limit_trigger ON public.user_inventory;
CREATE TRIGGER enforce_attunement_limit_trigger
BEFORE INSERT OR UPDATE OF sintonizado ON public.user_inventory
FOR EACH ROW
EXECUTE FUNCTION public.enforce_attunement_limit();
