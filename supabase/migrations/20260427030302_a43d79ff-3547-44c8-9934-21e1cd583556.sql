CREATE TABLE public.app_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL UNIQUE,
  version_code integer NOT NULL,
  apk_url text NOT NULL,
  changelog text,
  is_mandatory boolean NOT NULL DEFAULT false,
  released_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_app_releases_version_code ON public.app_releases (version_code DESC);

ALTER TABLE public.app_releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view releases"
  ON public.app_releases
  FOR SELECT
  USING (true);

INSERT INTO public.app_releases (version, version_code, apk_url, changelog, is_mandatory)
VALUES ('1.0.0', 1, '#', 'Versão inicial do LifeonRPG.', false);