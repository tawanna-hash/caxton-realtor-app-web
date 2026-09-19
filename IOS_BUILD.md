# Realty News Now — iOS App Build & Submission Runbook

This document walks through getting **Realty News Now** onto the iPhone App Store as a native iOS app. The app is a Capacitor wrapper around the live web app at <https://realtynewsnow.app>, so every web push instantly updates the app — no resubmission required for content/feature changes.

---

## 0. One-time prerequisites (you, Tawanna)

You need ALL of these before submitting. Most can run in parallel.

### 0.1 Apple Developer Program enrollment ($99/year)
1. Go to <https://developer.apple.com/programs/enroll/>
2. Sign in with the Apple ID you want to own the app (recommend a business Apple ID like `tawanna@realtynewsnow.app`, not personal).
3. **Choose enrollment type**:
   - **Individual** — faster (sometimes same-day), seller name = your name on the App Store. Recommended for v1.
   - **Organization** — requires a D-U-N-S number (free, ~24-48h to get), seller name = your business name. We can transfer later.
4. Pay $99 USD. Wait for Apple confirmation email (usually 24-48h).
5. Once approved, you'll get a **Team ID** — save this for step 3 below.

### 0.2 A Mac with Xcode
You need a Mac (or rented cloud Mac like MacInCloud / MacStadium) running:
- macOS 14 (Sonoma) or newer
- **Xcode 26.0 or newer** (we're building on Xcode 26.5) — install from the Mac App Store (it's ~10GB, plan accordingly)
- Command Line Tools: `xcode-select --install`
- **CocoaPods**: `sudo gem install cocoapods`

### 0.3 App Store Connect setup
1. After dev program approval, go to <https://appstoreconnect.apple.com>
2. **My Apps → +** → New App
3. Fill in:
   - Platform: iOS
   - Name: **Realty News Now**
   - Primary Language: English (U.S.)
   - Bundle ID: **app.realtynewsnow** (must match `capacitor.config.ts`)
   - SKU: `realtynewsnow-ios-v1` (any unique string)
   - User Access: Full Access
4. Save. Don't worry about screenshots/metadata yet — you'll add those before submission.

---

## 1. Local build (on your Mac)

```bash
# Clone the repo (one-time)
git clone https://github.com/tawanna-hash/caxton-realtor-app-web.git
cd caxton-realtor-app-web

# Install JS deps
npm install

# Pull native iOS deps
cd ios/App && pod install && cd ../..

# Sync any latest Capacitor config and assets
npx cap sync ios

# Open Xcode
npx cap open ios
```

This launches Xcode with the project at `ios/App/App.xcworkspace`.

---

## 2. Configure signing in Xcode

In Xcode, in the left sidebar, click the blue **App** project root → **Signing & Capabilities** tab:

1. **Team** dropdown → select your Apple Developer team (the one from step 0.1).
2. **Automatically manage signing** → check this on. Xcode will create provisioning profiles for you.
3. **Bundle Identifier** → confirm it shows `app.realtynewsnow`.
4. Capabilities to add (click `+ Capability`):
   - **Push Notifications** (only if/when you wire push — skip for v1).
   - **Sign in with Apple** (only if you offer Apple SSO — skip for v1).
5. Save (Cmd+S).

---

## 3. Test on a simulator (5 minutes)

In Xcode toolbar, pick a target device (e.g. **iPhone 17 Pro Max Simulator**) and hit **▶ Run** (Cmd+R).

Expected behavior:
- Splash screen shows the navy-and-gold app icon centered on navy background for ~1.5 seconds.
- WKWebView loads `https://realtynewsnow.app` and you see the live homepage.
- Tap around — it should feel exactly like Safari but full-screen with no browser chrome.

If the app launches but the page never loads:
- Check Mac is online.
- In Safari Dev menu → Develop → Simulator → inspect the WebView console for errors.

---

## 4. Test on a real iPhone (recommended before submitting)

1. Plug your iPhone into the Mac via USB.
2. On the iPhone: Settings → Privacy & Security → Developer Mode → ON. Restart the phone.
3. In Xcode, pick your iPhone from the device dropdown. Hit Run.
4. First time only: on the iPhone go to Settings → General → VPN & Device Management → Developer App → trust the certificate.

You should see the **Realty News Now** icon appear on your home screen and launch the live web app inside it.

---

## 5. Archive & upload to TestFlight

When you're happy with the local build:

1. In Xcode toolbar, pick **Any iOS Device (arm64)** (NOT a simulator).
2. **Product → Archive** (top menu). Takes a few minutes.
3. When done, the Organizer window opens. Click **Distribute App**.
4. Choose **App Store Connect** → Next → **Upload** → Next.
5. Walk through the signing wizard (defaults are fine if signing is automatic).
6. Click **Upload**. Wait for "Upload Successful".

Within ~10-30 minutes, App Store Connect will process the build. You'll get an email when it's ready.

---

## 6. TestFlight beta (always do this before public release)

In App Store Connect → your app → **TestFlight** tab:
1. Add yourself as an **Internal Tester** (uses the same Apple ID).
2. Once Apple finishes processing the build, you can install via the TestFlight app on your iPhone.
3. Use it for 2-3 days. Try every flow: login, dashboard, advertiser views, agreement signing, giveaways.
4. If you find bugs, fix them in the web app, then re-archive only when you bump the build number (`CURRENT_PROJECT_VERSION` in Xcode → General → Identity, increment by 1).

---

## 7. Submit to App Store review

In App Store Connect → your app → **App Store** tab → **iOS App → 1.0 Prepare for Submission**:

### Required metadata (have this ready):
- **Subtitle** (30 chars max): e.g. "Houston Real Estate News"
- **Promotional text** (170 chars, can change anytime): a 1-2 line hook
- **Description** (4000 chars max): full pitch. Mention what the app does, who it's for, what's unique.
- **Keywords** (100 chars, comma-separated): e.g. `real estate,Houston,Texas,news,realtor,realtyline,property,advertisers,market`
- **Support URL**: <https://realtynewsnow.app/contact> (or create a /support page)
- **Marketing URL** (optional): <https://realtynewsnow.app>
- **Privacy Policy URL**: REQUIRED. Use <https://realtynewsnow.app/privacy> — if that page doesn't exist yet, we must create one.

### Required screenshots (export from your iPhone using simulator or device):
- **6.9" iPhone** (iPhone 17 Pro Max, 1320×2868) — at least 3, up to 10. **Required.**
- **6.7" iPhone** (iPhone 15 Pro Max / 16 Pro Max, 1290×2796) — optional fallback.
- **6.5" iPhone** (legacy) — no longer required.

Use the iPhone 17 Pro Max simulator: run app → File → New Screen Shot (Cmd+S) → it saves to your Desktop at 1320×2868 (the current 6.9" required size). Take screenshots of: home feed, advertiser detail, news article, dashboard, profile.

### Required: App icon
Already baked in at 1024×1024 from concept A (navy + gold house + newspaper). Don't need to upload separately.

### Age rating
Walk through Apple's questionnaire. Real estate news app = **4+** (no objectionable content).

### App Review Information
- Sign-in credentials: provide a test admin account so Apple reviewers can log in. Create a fake "appreview@realtynewsnow.app" account with sample data.
- Notes: "This app is a wrapper around realtynewsnow.app providing native iOS experience for our Houston real estate news platform. Test login above gives access to the dashboard, advertiser views, and reading the latest market reports. Most app functionality is accessible without login (browsing news, articles, market data)."

### Submit
Click **Add for Review** → confirm. Apple's queue is typically **24-48 hours** for first-time apps.

---

## 8. Common rejection risks and how we address them

| Risk | Apple's concern | How we handle it |
|---|---|---|
| 4.2 Minimum functionality | "Wrapper of a website with no native value" | Native splash, status bar styling, status-bar-aware layout, camera/photo access for advertiser uploads, native share sheets, push notifications (planned v1.1). Submit notes emphasizing real estate news + agreements + native uploads. |
| 5.1 Privacy | Missing privacy policy or unclear data collection | Privacy URL pointing to a real /privacy page; permission strings in Info.plist clearly explain why we ask. |
| 3.1.1 In-app purchase | If we ever sell digital goods inside the app | v1 has no IAP. If we add paid features later, must use Apple's IAP (30% cut) for digital goods. Physical goods/services (advertising contracts) can stay on the web payment flow. |
| 2.5.6 WKWebView privacy | Apps using WebViews must respect ATS | `NSAllowsArbitraryLoads = false` (default). Site is full HTTPS. ✓ |

---

## 9. Updating the iOS app after launch

For **content-only changes** (new articles, advertiser changes, layout tweaks):
- Push to `main`. Vercel deploys. Done. The iOS app picks up the new web version on next launch. No resubmission needed.

For **native changes** (icon, splash, plugins, capabilities, new device permissions):
1. Edit `capacitor.config.ts` or `ios/App/App/Info.plist`.
2. Bump build number in Xcode → General → Identity → Build (e.g. 1 → 2). Optionally bump Version too.
3. `npx cap sync ios`
4. Archive + upload + TestFlight + submit, same as steps 5-7 above.

---

## 10. Files in this repo

| Path | Purpose |
|---|---|
| `capacitor.config.ts` | Capacitor app config (bundle id, server URL, splash settings) |
| `ios/` | Xcode project. Tracked in git. |
| `ios/App/App/Info.plist` | iOS app permissions, display name, ATS rules |
| `ios/App/App/Assets.xcassets/AppIcon.appiconset/` | App icon (1024×1024 master, Xcode auto-resizes) |
| `ios/App/App/Assets.xcassets/Splash.imageset/` | Launch splash screen images |
| `resources/icon.png` | 1024×1024 source icon (concept A — navy + gold house + newspaper) |
| `resources/ios/icons/` | Pre-generated icon sizes (kept as backup; Xcode usually uses the universal AppIcon) |
| `resources/ios/splash/` | Pre-generated splash images (2732×2732 universal) |
| `scripts/generate-ios-icons.mjs` | Regenerate all icon sizes if we change the source |
| `scripts/generate-ios-splash.mjs` | Regenerate splash images |

---

## Questions?

- Apple Developer support: <https://developer.apple.com/support/>
- Capacitor docs: <https://capacitorjs.com/docs/ios>
- App Store review guidelines: <https://developer.apple.com/app-store/review/guidelines/>
