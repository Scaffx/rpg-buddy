import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.6f14b44eedde41539aa41093c4284f49',
  appName: 'LifeOnRPG',
  webDir: 'dist',
  // Hot-reload do sandbox Lovable durante o desenvolvimento.
  // REMOVA o bloco "server" antes de gerar o APK final de produção
  // para que o app use os arquivos da pasta /dist embutidos.
  server: {
    url: 'https://6f14b44e-edde-4153-9aa4-1093c4284f49.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
};

export default config;
