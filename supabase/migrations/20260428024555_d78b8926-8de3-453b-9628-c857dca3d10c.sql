-- Allow admins to insert/update/delete app_releases (SELECT já é público)
CREATE POLICY "Admins can insert releases"
ON public.app_releases
FOR INSERT
TO authenticated
WITH CHECK (public.is_system_admin());

CREATE POLICY "Admins can update releases"
ON public.app_releases
FOR UPDATE
TO authenticated
USING (public.is_system_admin())
WITH CHECK (public.is_system_admin());

CREATE POLICY "Admins can delete releases"
ON public.app_releases
FOR DELETE
TO authenticated
USING (public.is_system_admin());

-- Index for fetching latest release fast
CREATE INDEX IF NOT EXISTS idx_app_releases_version_code_desc
  ON public.app_releases (version_code DESC);