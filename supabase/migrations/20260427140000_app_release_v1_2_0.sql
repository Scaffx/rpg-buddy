-- Atualiza URL do APK existente e insere versão 1.2.0
UPDATE public.app_releases
SET apk_url = 'https://github.com/Scaffx/rpg-buddy/releases/download/v1.1.0/lifeonrpg-v1.1.0.apk'
WHERE version = '1.1.0';

INSERT INTO public.app_releases (version, version_code, apk_url, changelog, is_mandatory)
VALUES (
  '1.2.0',
  3,
  'https://github.com/Scaffx/rpg-buddy/releases/download/v1.2.0/lifeonrpg-v1.2.0.apk',
  'Correções de segurança: RLS completo em subscription_access_keys, proteção de funções SECURITY DEFINER, erros internos não expostos ao cliente.',
  false
)
ON CONFLICT (version) DO UPDATE SET
  apk_url   = EXCLUDED.apk_url,
  changelog = EXCLUDED.changelog;
