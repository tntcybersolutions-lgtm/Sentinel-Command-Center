# Sentinel Native Shell (Capacitor) â M7

Native iOS + Android shells wrapping the existing Sentinel PWA. Adds real
native push, biometric auth, background photo upload, App Store / Play
Store distribution. The PWA itself keeps working unchanged â this is
purely additive.

## Why native, not just PWA

The existing PWA covers ~80% of what foremen need: install banner, offline
queue, web push, drawings viewer, voice daily log. But for a sales motion
against Procore, the remaining 20% matters and is browser-blocked:

- **Native push reliability.** iOS Safari PWA push has only worked since
  16.4 and is still flaky. Native APNs is rock-solid.
- **Background photo upload with retry.** Service Worker Background Sync
  is Chrome-only and Safari ignores it. Native code can upload from a
  killed app.
- **Biometric auth.** Face ID / Touch ID via the OS â no PWA equivalent.
- **App Store discoverability.** GCs search "Sentinel" in the App Store.
- **File system access** (e.g. archiving drawing PDFs to Files / Drive).

## Setup (one-time, run locally â NOT on Replit)

The `cap add ios` / `cap add android` steps generate platform folders
(`ios/`, `android/`) with native Xcode / Gradle projects. These need to be
committed to the repo and built with macOS (for iOS) / Android Studio.

### 1. Install the Capacitor dependencies

From repo root:

```bash
npm install \
  @capacitor/core@^6 @capacitor/cli@^6 \
  @capacitor/ios@^6 @capacitor/android@^6 \
  @capacitor/push-notifications@^6 \
  @capacitor/camera@^6 \
  @capacitor/filesystem@^6 \
  @capacitor/haptics@^6 \
  @capacitor/keyboard@^6 \
  @capacitor/network@^6 \
  @capacitor/preferences@^6 \
  @capacitor/share@^6 \
  @capacitor/splash-screen@^6 \
  @capacitor/status-bar@^6
npm install --save-dev @capacitor-community/biometric-auth@^7
```

### 2. Initialize Capacitor

The `capacitor.config.ts` at the repo root is already configured (appId
`com.sentinel.command`, webDir `dist/public`). No need to run
`npx cap init` â just confirm config is present:

```bash
cat capacitor.config.ts
```

### 3. Build the web bundle

Capacitor copies `dist/public` into the native shell. Always run a build
first:

```bash
npm run build
```

### 4. Add platforms (generates `ios/` and `android/` directories)

```bash
npx cap add ios       # requires macOS + Xcode
npx cap add android   # requires Android Studio (any OS)
```

Commit the generated `ios/` and `android/` folders to the repo so other
developers and CI can `cap sync` without regenerating.

### 5. Sync future JS changes into the native shells

After each `npm run build`:

```bash
npx cap sync
```

### 6. Open in IDEs

```bash
npx cap open ios       # opens Xcode
npx cap open android   # opens Android Studio
```

## App Store / Play Store account work (Chad's tasks)

These cannot be automated â they require account credentials and a real
human to fill the listings:

| Store              | One-time cost | Annual cost | Notes                                      |
|--------------------|---------------|-------------|--------------------------------------------|
| Apple Developer    | â             | $99 / year  | Required to publish iOS. apple.com/programs/developer |
| Google Play        | $25 one-time  | â           | Required to publish Android. play.google.com/console  |

After enrollment:

- **iOS**: in Xcode, set the bundle identifier to `com.sentinel.command`,
  sign with your Apple Developer team, then Product â Archive â
  Distribute App â App Store Connect.
- **Android**: in Android Studio, Build â Generate Signed Bundle / APK,
  upload the `.aab` to Play Console.

Listing assets needed (icon, screenshots, description) live in
`mobile/store-assets/` once that folder exists.

## Native plugins wired in `capacitor.config.ts`

- **SplashScreen**: 1.5s splash with `#0B0F14` background.
- **StatusBar**: dark mode, `#0B0F14`.
- **PushNotifications**: badge + sound + alert. Will need a separate
  service-worker bridge so backend push (web-push) and APNs / FCM stay in
  sync â separate sprint, not part of M7 scaffold.
- **Camera**: for Quick-Add â Photo flow. Permission strings auto-added
  via `cap sync`; double-check `NSCameraUsageDescription` reads sensibly
  ("Sentinel uses the camera to attach jobsite photos to punch items and
  daily logs").
- **Keyboard**: dark mode, body resize.

## What's NOT in M7 (parked for follow-ups)

- **Native push pipeline** â server already has `web-push` for browsers;
  separate work to register APNs and FCM tokens through Capacitor's
  PushNotifications plugin and bridge to the same backend dispatcher.
- **Biometric login flow** â `@capacitor-community/biometric-auth` is in
  the dep list but not wired into the auth context yet. Add when ready.
- **Background photo upload** â needs a small native module to keep the
  upload queue running when the app is suspended. PWA's offline-queue
  handles online uploads; this is the offline â reconnect case on iOS.
- **CI build** â Xcode Cloud or Codemagic for automated builds. Set up
  once you have an Apple Developer account.
- **Live updates** â Capgo or Capacitor Live Updates lets you push JS
  changes without re-submitting to the stores. Worth doing after first
  store approval.

## Sanity check after `cap add ios`

```bash
ls -la ios/App/App/Info.plist
grep -A1 NSCameraUsageDescription ios/App/App/Info.plist
grep -A1 NSMicrophoneUsageDescription ios/App/App/Info.plist
```

If usage description strings are missing, add them manually before
shipping â Apple rejects the build otherwise.

## Sanity check after `cap add android`

```bash
ls -la android/app/src/main/AndroidManifest.xml
grep -E "RECORD_AUDIO|CAMERA|INTERNET" android/app/src/main/AndroidManifest.xml
```

Required permissions for parity with the iOS shell: `CAMERA`,
`RECORD_AUDIO`, `INTERNET`, `ACCESS_NETWORK_STATE`, `READ_EXTERNAL_STORAGE`
(or scoped storage on Android 13+).
