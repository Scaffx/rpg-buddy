
ALTER TABLE public.bosses
  ADD COLUMN IF NOT EXISTS element text DEFAULT 'Neutro',
  ADD COLUMN IF NOT EXISTS damage_base numeric DEFAULT 10,
  ADD COLUMN IF NOT EXISTS defense numeric DEFAULT 5,
  ADD COLUMN IF NOT EXISTS difficulty text DEFAULT '+P',
  ADD COLUMN IF NOT EXISTS skills jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS mechanic text,
  ADD COLUMN IF NOT EXISTS arena text;
