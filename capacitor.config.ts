/**
 * Sprint M7 â Capacitor native shell config
 *
 * Wraps the Sentinel PWA in iOS + Android shells so we can ship to the App
 * Store and Play Store with real native push, biometric auth, and
 * background photo upload retry that Safari PWAs can't do reliably.
 *
 * Setup (run once locally â these generate native code that needs to be
 * committed and only work outside the Replit sandbox):
 *
 *   npm install @capacitor/core @capacitor/cli \
 *     @capacitor/ios @capacitor/android \
 *     @capacitor/push-notifications @capacitor/preferences \
 *     @capacitor/camera @capacitor/filesystem @capacitor/haptics \
 *     @capacitor/network @capacitor/share @capacitor/splash-screen \
 *     @capacitor/status-bar
 *   npm install --save-dev @capacitor-community/biometric-auth
 *
 *   npx cap init "Sentinel" com.sentinel.command --web-dir=dist/public
 *   npm run build       # generates dist/public
 *   npx cap add ios
 *   npx cap add android
 *   npx cap sync
 *
 * Open Xcode / Android Studio to handle signing + provisioning:
 *   npx cap open ios
 *   npx cap open android
 *
 * App Store / Play Store account work is required (Apple Developer +
 * Google Play Console) â that's Chad's, not something automation can do.
 */

import type { CapacitorConfig } from "@capacitor/cli";

const isDev = process.env.NODE_ENV !== "production";

const config: CapacitorConfig = {
  appId: "com.sentinel.command",
  appName: "Sentinel",
  webDir: "dist/public",
  bundledWebRuntime: false,

  // In dev, point the native shell at the deployed Replit URL so we don't
  // need to rebuild dist/public on every JS change. In production builds
  // for App Store / Play Store submission, OMIT this â the app must serve
  // its own bundled assets so it works offline.
  server: isDev
    ? {
        url: "https://sentinel-command-center-tntcybersolutio.replit.app",
        cleartext: false,
      }
    : {
        androidScheme: "https",
        iosScheme: "https",
      },

  ios: {
    contentInset: "always",
    backgroundColor: "#0B0F14",
    limitsNavigationsToAppBoundDomains: false,
    // Allow microphone access for VoiceMicButton + voice-daily-log.
    // The actual Info.plist NSMicrophoneUsageDescription string is set
    // in ios/App/App/Info.plist after `cap add ios`.
    scheme: "Sentinel",
  },

  android: {
    backgroundColor: "#0B0F14",
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: isDev,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: "#0B0F14",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0B0F14",
      overlaysWebView: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    Camera: {
      // Mirrors the field-team Quick-Add â Photo flow. Permission strings
      // go in Info.plist (NSCameraUsageDescription, NSPhotoLibraryUsage).
    },
    Keyboard: {
      resize: "body",
      style: "DARK",
      resizeOnFullScreen: true,
    },
  },
};

export default config;
