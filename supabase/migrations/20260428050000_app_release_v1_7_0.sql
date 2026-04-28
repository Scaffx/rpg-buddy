INSERT INTO public.app_releases (version, version_code, apk_url, changelog, is_mandatory)
VALUES (
  '1.7.0',
  9,
  'https://github.com/Scaffx/rpg-buddy/releases/download/v1.7.0/lifeonrpg-v1.7.0.apk',
  'Correção de mana: MP agora só é consumido em batalhas de boss/masmorra, removendo penalidade de MP/HP em missões fracassadas. Correção de Short Rest: estado pendente é limpo silenciosamente ao reabrir o app quando o descanso já foi aplicado no servidor.',
  false
)
ON CONFLICT (version) DO UPDATE SET
  version_code = EXCLUDED.version_code,
  apk_url = EXCLUDED.apk_url,
  changelog = EXCLUDED.changelog,
  is_mandatory = EXCLUDED.is_mandatory;
