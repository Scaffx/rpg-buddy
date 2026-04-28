INSERT INTO public.app_releases (version, version_code, apk_url, changelog, is_mandatory)
VALUES (
  '1.6.1',
  8,
  'https://github.com/Scaffx/rpg-buddy/releases/download/v1.6.1/lifeonrpg-v1.6.1.apk',
  'Correções de Short Rest (bloqueio de múltiplos usos no mesmo dia e atualização de status HP/MP/Fadiga) e melhorias gerais de estabilidade.',
  false
)
ON CONFLICT (version) DO UPDATE SET
  version_code = EXCLUDED.version_code,
  apk_url = EXCLUDED.apk_url,
  changelog = EXCLUDED.changelog,
  is_mandatory = EXCLUDED.is_mandatory;
