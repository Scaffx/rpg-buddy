// ============================================================
// Versão atual do app. Use semver semântico (MAJOR.MINOR.PATCH).
// O `versionCode` é um inteiro monotônico usado para comparar
// se há atualização disponível na tabela `app_releases`.
// Sempre que publicar um novo APK, incremente AMBOS.
// ============================================================
export const APP_VERSION = "1.6.1";
export const APP_VERSION_CODE = 8;

// Marca o app como Beta. Quando true, exibimos badges "BETA"
// em locais visíveis (landing, página mobile, modais de update).
export const IS_BETA = true;

// Rótulo formatado pronto pra UI: "v1.0.0 BETA" ou "v1.0.0".
export const APP_VERSION_LABEL = IS_BETA
  ? `v${APP_VERSION} BETA`
  : `v${APP_VERSION}`;
