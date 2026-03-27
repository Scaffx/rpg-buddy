
ALTER TABLE public.missions 
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'media',
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pendente';
