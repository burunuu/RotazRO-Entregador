import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rotazro.entregador',
  appName: 'RotazRO Entregador',
  webDir: 'dist',

  android: {
    useLegacyBridge: true,
  },
};

export default config;