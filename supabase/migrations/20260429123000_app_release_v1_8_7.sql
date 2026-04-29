INSERT INTO public.app_releases (version, version_code, apk_url, changelog, is_mandatory)
VALUES (
  '1.8.7',
  14,
  'https://github.com/Scaffx/rpg-buddy/releases/download/v1.8.7/lifeonrpg-v1.8.7.apk',
  'Atualizacao de versao para 1.8.7 com alinhamento de versionamento entre app Android e frontend.',
  false
)
ON CONFLICT (version) DO UPDATE SET
  version_code = EXCLUDED.version_code,
  apk_url = EXCLUDED.apk_url,
  changelog = EXCLUDED.changelog,
  is_mandatory = EXCLUDED.is_mandatory;
