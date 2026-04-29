INSERT INTO public.app_releases (version, version_code, apk_url, changelog, is_mandatory)
VALUES (
  '1.8.8',
  15,
  'https://github.com/Scaffx/rpg-buddy/releases/download/v1.8.8/lifeonrpg-v1.8.8.apk',
  'Release 1.8.8 preparada com alinhamento de versionamento entre frontend, Android e Supabase, mantendo consistencia do fluxo de atualizacao no app.',
  false
)
ON CONFLICT (version) DO UPDATE SET
  version_code = EXCLUDED.version_code,
  apk_url = EXCLUDED.apk_url,
  changelog = EXCLUDED.changelog,
  is_mandatory = EXCLUDED.is_mandatory;
