INSERT INTO public.app_releases (version, version_code, apk_url, changelog, is_mandatory)
VALUES ('1.4.0', 5, 'https://github.com/Scaffx/rpg-buddy/releases/download/v1.4.0/lifeonrpg-v1.4.0.apk', 'Corrigido: agora usa Browser.open() do Capacitor para downloads do APK em vez de window.open(), resolvendo problemas de carregamento de página web no Android.', false)
ON CONFLICT (version) DO UPDATE SET apk_url = EXCLUDED.apk_url, changelog = EXCLUDED.changelog;
