-- Insere versão 1.3.0 com novo ícone
INSERT INTO public.app_releases (version, version_code, apk_url, changelog, is_mandatory)
VALUES (
  '1.3.0',
  4,
  'https://github.com/Scaffx/rpg-buddy/releases/download/v1.3.0/lifeonrpg-v1.3.0.apk',
  'Ícone do app atualizado para o logo do LifeOnRPG.',
  false
)
ON CONFLICT (version) DO UPDATE SET
  apk_url   = EXCLUDED.apk_url,
  changelog = EXCLUDED.changelog;
