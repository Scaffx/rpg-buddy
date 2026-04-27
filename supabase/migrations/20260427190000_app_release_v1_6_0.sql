INSERT INTO public.app_releases (version, version_code, apk_url, changelog, is_mandatory)
VALUES (
  '1.6.0',
  7,
  'https://github.com/Scaffx/rpg-buddy/releases/download/v1.6.0/lifeonrpg-v1.6.0.apk',
  'Correções de combate e sincronização completa de HP/MP/Fadiga entre Perfil e Boss. Ajustes de recuperação de MP por poções e short rest.',
  false
)
ON CONFLICT (version) DO UPDATE SET
  version_code = EXCLUDED.version_code,
  apk_url = EXCLUDED.apk_url,
  changelog = EXCLUDED.changelog,
  is_mandatory = EXCLUDED.is_mandatory;