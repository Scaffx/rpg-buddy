-- Estado de divulgação dos eventos mundiais (teaser controlável sem código).
--   'soon'      → "Em breve" (sem data)
--   'announced' → mostra data + contagem regressiva (event_starts_at)
--   'live'      → jogável (futuro: lobby + combate)
ALTER TABLE public.bosses
  ADD COLUMN IF NOT EXISTS event_status text NOT NULL DEFAULT 'soon',
  ADD COLUMN IF NOT EXISTS event_starts_at timestamptz;

ALTER TABLE public.bosses
  DROP CONSTRAINT IF EXISTS bosses_event_status_check;
ALTER TABLE public.bosses
  ADD CONSTRAINT bosses_event_status_check
  CHECK (event_status IN ('soon', 'announced', 'live'));
