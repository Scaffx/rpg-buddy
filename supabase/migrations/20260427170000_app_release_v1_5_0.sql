INSERT INTO public.app_releases (version, version_code, apk_url, changelog, is_mandatory)
VALUES ('1.5.0', 6, 'https://github.com/Scaffx/rpg-buddy/releases/download/v1.5.0/lifeonrpg-v1.5.0.apk', 'Corrigido: removida URL de desenvolvimento do Lovable. O app agora carrega corretamente do /dist em produção.', false)
ON CONFLICT (version) DO UPDATE SET apk_url = EXCLUDED.apk_url, changelog = EXCLUDED.changelog;
