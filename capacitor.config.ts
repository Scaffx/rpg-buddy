import type { CapacitorConfig } from '@capacitor/cli';

// IMPORTANTE: Para o APK, sempre use webDir (nunca ative o servidor Lovable em produção)
// Se precisa testar em desenvolvimento, rode: npm run dev (não use o APK)
const isDev = process.env.NODE_ENV === 'development' && process.env.CAPACITOR_DEV !== 'false';

const config: CapacitorConfig = {
  // Alinhado com android/app/build.gradle (applicationId) e strings.xml
  // (custom_url_scheme) — o projeto nativo já usa este id; só a config
  // fonte do Capacitor estava com o id de scaffolding do Lovable.
  appId: 'app.lovable.rpgbuddy',
  appName: 'LifeOnRPG',
  webDir: 'dist',
  // Bloco "server" DESATIVADO para APK — sempre usa /dist
  // Apenas use este bloco se testar localmente com: CAPACITOR_DEV=true npm run dev
  // ...(isDev && {
  //   server: {
  //     url: 'https://6f14b44e-edde-4153-9aa4-1093c4284f49.lovableproject.com?forceHideBadge=true',
  //     cleartext: true,
  //   },
  // }),
};

export default config;
