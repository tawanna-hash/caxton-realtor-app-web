import type { CapacitorConfig } from '@capacitor/cli';

// Closing Time - separate native shell. Loads https://itsalmostclosingtime.com.
// The Realty News Now app (capacitor.config.ts) is unchanged and keeps loading realtynewsnow.app.
// appId confirmed by the owner on 2026-10-06. It cannot be changed after the first submission.
const config: CapacitorConfig = {
  appId: 'com.itsalmostclosingtime.app',
  appName: 'Closing Time',
  webDir: 'public',
  server: {
    url: 'https://itsalmostclosingtime.com',
    cleartext: false,
    androidScheme: 'https',
    iosScheme: 'https',
    allowNavigation: ['itsalmostclosingtime.com', '*.itsalmostclosingtime.com'],
  },
  ios: { contentInset: 'always', scrollEnabled: true, limitsNavigationsToAppBoundDomains: false, backgroundColor: '#301D5D' },
  plugins: {
    SplashScreen: { launchShowDuration: 1500, launchAutoHide: true, backgroundColor: '#301D5D', showSpinner: false, splashFullScreen: true, splashImmersive: true },
    StatusBar: { style: 'LIGHT', backgroundColor: '#301D5D', overlaysWebView: false },
  },
};

export default config;
