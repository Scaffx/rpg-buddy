import type { CapacitorConfig } from '@capacitor/cli';

const isDev = process.env.NODE_ENV !== 'production';

const config: CapacitorConfig = {
  appId: 'app.lovable.6f14b44eedde41539aa41093c4284f49',
  appName: 'LifeOnRPG',
  webDir: 'dist',
  // Bloco "server" ativado apenas em desenvolvimento local (npm run dev).
  // Em produção (npm run build + npx cap sync), o app usa os arquivos da /dist.
  ...(isDev && {
    server: {
      url: 'https://6f14b44e-edde-4153-9aa4-1093c4284f49.lovableproject.com?forceHideBadge=true',
      cleartext: true,
    },
  }),
};

export default config;
