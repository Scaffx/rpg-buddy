-- ============================================================
-- App Releases - Registrar versões v1.3.0, v1.4.0, v1.5.0 e v1.6.0
-- Execute tudo de uma vez no SQL Editor do Supabase
-- ============================================================

-- v1.3.0: Ícone atualizado para logo LifeOnRPG
INSERT INTO public.app_releases (version, version_code, apk_url, changelog, is_mandatory)
VALUES ('1.3.0', 4, 'https://github.com/Scaffx/rpg-buddy/releases/download/v1.3.0/lifeonrpg-v1.3.0.apk', 'Ícone do app atualizado para o logo do LifeOnRPG.', false)
ON CONFLICT (version) DO UPDATE SET apk_url = EXCLUDED.apk_url, changelog = EXCLUDED.changelog;

-- v1.4.0: Corrigido downloads do APK usando Browser.open()
INSERT INTO public.app_releases (version, version_code, apk_url, changelog, is_mandatory)
VALUES ('1.4.0', 5, 'https://github.com/Scaffx/rpg-buddy/releases/download/v1.4.0/lifeonrpg-v1.4.0.apk', 'Corrigido: agora usa Browser.open() do Capacitor para downloads do APK em vez de window.open(), resolvendo problemas de carregamento de página web no Android.', false)
ON CONFLICT (version) DO UPDATE SET apk_url = EXCLUDED.apk_url, changelog = EXCLUDED.changelog;

-- v1.5.0: Removida URL de desenvolvimento do Lovable
INSERT INTO public.app_releases (version, version_code, apk_url, changelog, is_mandatory)
VALUES ('1.5.0', 6, 'https://github.com/Scaffx/rpg-buddy/releases/download/v1.5.0/lifeonrpg-v1.5.0.apk', 'Corrigido: removida URL de desenvolvimento do Lovable. O app agora carrega corretamente do /dist em produção.', false)
ON CONFLICT (version) DO UPDATE SET apk_url = EXCLUDED.apk_url, changelog = EXCLUDED.changelog;

-- v1.6.0: Sincronização de HP/MP/Fadiga no combate de boss + correções de recuperação de MP
INSERT INTO public.app_releases (version, version_code, apk_url, changelog, is_mandatory)
VALUES ('1.6.0', 7, 'https://github.com/Scaffx/rpg-buddy/releases/download/v1.6.0/lifeonrpg-v1.6.0.apk', 'Correções de combate e sincronização completa de HP/MP/Fadiga entre Perfil e Boss. Ajustes de recuperação de MP por poções e short rest.', false)
ON CONFLICT (version) DO UPDATE SET apk_url = EXCLUDED.apk_url, changelog = EXCLUDED.changelog, version_code = EXCLUDED.version_code;
