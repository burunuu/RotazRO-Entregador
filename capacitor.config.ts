import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rotazro.entregador',
  appName: 'RotazRO',
  webDir: 'dist',

  android: {
    useLegacyBridge: true,
  },
};

export default config;