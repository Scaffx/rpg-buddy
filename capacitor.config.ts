import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.rpgbuddy',
  appName: 'rpg-buddy',
  webDir: 'dist',
  server: {
    url: 'https://6f14b44e-edde-4153-9aa4-1093c4284f49.lovableproject.com?forceHideBadge=true',
    cleartext: true
  }
};

export default config;
