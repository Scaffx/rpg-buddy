-- Corrige portal_events sem portal_color (NULL) atribuindo cor aleatória.
-- Também cria trigger para garantir que novos eventos sempre tenham cor.

-- ── 1. Atribuir cor aleatória a eventos ativos sem cor ─────
UPDATE public.portal_events
SET portal_color = (
  ARRAY['blue', 'yellow', 'red', 'legendary']
)[floor(random() * 4 + 1)]
WHERE portal_color IS NULL;

-- ── 2. Trigger: auto-atribuir cor ao criar portal_event ────
CREATE OR REPLACE FUNCTION assign_portal_color_if_null()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.portal_color IS NULL THEN
    NEW.portal_color := (ARRAY['blue','yellow','red','legendary'])[floor(random()*4+1)];
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_portal_color_default ON public.portal_events;
CREATE TRIGGER trg_portal_color_default
  BEFORE INSERT ON public.portal_events
  FOR EACH ROW EXECUTE FUNCTION assign_portal_color_if_null();
