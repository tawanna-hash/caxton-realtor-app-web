import type { CapacitorConfig } from '@capacitor/cli';

// Realty News Now - iOS native wrapper
//
// Strategy: this is a "shell" app that loads the live web app at
// realtynewsnow.app inside an iOS WKWebView. Push a web change -> users
// see it on next app open with no App Store resubmission required.
//
// Two trade-offs to know about:
//   1. Apple requires "substantial native value" beyond a bare web wrapper.
//      The Capacitor plugins below (status bar, splash, in-app browser for
//      external links, native app lifecycle) plus the iOS-specific UX we
//      add over time are what justify approval.
//   2. The `server.url` flag below makes this a "live" app rather than
//      bundling the Next.js output. Pros: instant updates. Cons: requires
//      network at launch. We accept this for v1.

const config: CapacitorConfig = {
  appId: 'app.realtynewsnow',
  appName: 'Realty News Now',
  webDir: 'public', // unused when server.url is set, but required by the CLI
  server: {
    url: 'https://realtynewsnow.app',
    cleartext: false,
    androidScheme: 'https',
    iosScheme: 'https',
    allowNavigation: [
      'realtynewsnow.app',
      '*.realtynewsnow.app',
      'myrealtyline.com',
      '*.myrealtyline.com',
    ],
  },
  ios: {
    contentInset: 'always',
    scrollEnabled: true,
    limitsNavigationsToAppBoundDomains: false,
    backgroundColor: '#301D5D',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#301D5D',
      showSpinner: false,
      iosSpinnerStyle: 'small',
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#301D5D',
      overlaysWebView: false,
    },
  },
};

export default config;
