# iOS Distribution Checklist

Working checklist matching Apple's 11-step "Prepare for app distribution"
guide. Items handled in code live in this repo; items handled outside Xcode
are tracked here so we know exactly what to do in App Store Connect.

## Toolchain requirements (Apple-enforced at submission)

Apple requires apps to be built with the latest Apple SDKs and packaged via
Xcode. Current floor (as of June 2026):

| Tool | Minimum on build machine | Notes |
|------|--------------------------|-------|
| Xcode | **16.0+** | enforced for App Store and TestFlight uploads |
| iOS SDK | **18.0+** | bundled with Xcode 16 |
| macOS | macOS Sonoma 14.5 or newer | required to install Xcode 16 |
| CocoaPods | 1.15+ | `sudo gem install cocoapods` |

The project itself is aligned to this:
- Capacitor 7.6 (requires Xcode 16+, iOS 14 minimum — we target 15)
- All 9 Capacitor plugins on v7
- `objectVersion = 56` and `LastUpgradeCheck = 1600` in `project.pbxproj`
- Swift 5 (Xcode 16 ships Swift 6 toolchain, which compiles Swift 5 code unchanged)

## In code (this repo)

| Step | Item | Where | Value |
|------|------|-------|-------|
| 1 | Bundle ID | `App.xcodeproj/project.pbxproj` | `app.realtynewsnow` |
| 3 | Version (CFBundleShortVersionString) | `MARKETING_VERSION` | `1.0` |
| 3 | Build (CFBundleVersion) | `CURRENT_PROJECT_VERSION` | `1` (bump per upload) |
| 5 | Deployment target | `IPHONEOS_DEPLOYMENT_TARGET` | `15.0` |
| 5 | Device family | `TARGETED_DEVICE_FAMILY` | `1,2` (iPhone + iPad) |
| 5 | Orientations | `Info.plist UISupportedInterfaceOrientations` | Portrait + Landscape |
| 5 | Required device capabilities | `UIRequiredDeviceCapabilities` | `arm64` |
| 6 | App icon set (17 sizes + 1024 marketing) | `Assets.xcassets/AppIcon.appiconset/` | RGB, no alpha |
| 7 | Launch screen | `Base.lproj/LaunchScreen.storyboard` | storyboard-based |
| 8 | Camera usage | `NSCameraUsageDescription` | set |
| 8 | Photo library | `NSPhotoLibraryUsageDescription` | set |
| 8 | Photo library add | `NSPhotoLibraryAddUsageDescription` | set |
| 8 | Location | `NSLocationWhenInUseUsageDescription` | set |
| 8 | Face ID | `NSFaceIDUsageDescription` | set |
| 8 | App tracking transparency | `NSUserTrackingUsageDescription` | set |
| 11 | Export compliance | `ITSAppUsesNonExemptEncryption` | `false` |
| — | Privacy manifest | `PrivacyInfo.xcprivacy` | tracking=false, 3 RRA + 12 data types |
| — | Push capability | `App.entitlements` `aps-environment` | `production` |
| — | Background mode | `UIBackgroundModes` | `remote-notification` |

## Outside Xcode (you do these)

### Step 2 — Assign to a team

Open `App.xcworkspace` in Xcode → select the `App` target → Signing &
Capabilities → set **Team** to your Apple Developer Program team. The team
ID is intentionally NOT committed to the repo so different machines can
build with their own credentials. After you set it, Xcode will write
`DEVELOPMENT_TEAM = <yourTeamID>;` into your local `project.pbxproj` —
leave that uncommitted (or commit it once it stabilizes).

### Step 4 — App category (App Store Connect)

When you create the app record in App Store Connect → App Information:

- **Primary category**: News
- **Secondary category**: Business
  - (News is the right primary because the app's main job is delivering
    real-estate journalism; Business is the secondary because the user
    base is industry professionals.)

### Step 11 — Export compliance (already declared)

`ITSAppUsesNonExemptEncryption=false` in Info.plist tells App Store Connect
that the only crypto used is what Apple provides via standard APIs (HTTPS
through URLSession / WKWebView). You will NOT be prompted on each upload.

## Per-upload (every TestFlight / App Store build)

1. Bump `CURRENT_PROJECT_VERSION` in Xcode (Build phase or General tab).
   Strictly monotonic — App Store Connect rejects duplicates.
2. Run `npx cap sync ios` if any web code changed and we ever switch from
   the `server.url` hot-loading model to bundled assets.
3. Product → Archive → Distribute App → App Store Connect.

## App Store Connect record — content you'll need

- **App name**: Realty News Now
- **Subtitle** (30 chars max): Texas real-estate news, daily
- **Promotional text** (170 chars): updates each release
- **Description**: see `app_store_readiness_audit.md` for draft
- **Keywords** (100 chars): real estate, Austin, San Antonio, REALTOR, listings, MLS, agents, brokers, Texas, ABoR
- **Support URL**: https://realtynewsnow.app/support
- **Marketing URL** (optional): https://realtynewsnow.app
- **Privacy Policy URL**: https://realtynewsnow.app/privacy
- **Screenshots**: 6.7" (iPhone 15 Pro Max), 6.5" (iPhone 11 Pro Max), 5.5" (iPhone 8 Plus), 12.9" iPad Pro. Minimum 3 per size.
- **App Review notes**: see `app_store_readiness_audit.md` §"Reviewer notes"
- **Sign-in for review**: provide a demo realtor account (NOT a real
  advertiser's credentials). Mark the app as "Sign-in required: yes" and
  include the demo credentials.

## Push notifications — server-side prerequisites

The app registers an APNs device token via `/api/push/native` (PR B) and
the server fans out via `apns2` (PR E). To turn pushes on in production,
set four env vars in Vercel:

| Env var | Value | Where to find it |
|---------|-------|------------------|
| `APNS_BUNDLE_ID` | `app.realtynewsnow` | matches the iOS bundle id |
| `APNS_TEAM_ID` | 10-char alphanumeric | developer.apple.com → Membership → Team ID |
| `APNS_KEY_ID` | 10-char alphanumeric | developer.apple.com → Keys → (the APNs key you create) |
| `APNS_PRIVATE_KEY_P8` | full `.p8` PEM contents | downloaded once when you create the key — save it; Apple won't show it again |

Steps:

1. **Create the APNs Auth Key:** developer.apple.com → Certificates,
   Identifiers & Profiles → Keys → + → check "Apple Push Notifications
   service (APNs)" → Continue → Register. Download the .p8 file. Note
   the **Key ID** shown on the confirmation page.
2. **Note your Team ID** at the top right of the developer portal.
3. **In Vercel** (Project Settings → Environment Variables), add the four
   vars above for the **Production** environment. For `APNS_PRIVATE_KEY_P8`
   paste the entire .p8 contents including the `-----BEGIN PRIVATE KEY-----`
   and `-----END PRIVATE KEY-----` lines. Either real newlines or `\n` escapes work — the sender normalizes both.
4. **Redeploy** so the new env vars load. The next admin broadcast or
   /api/admin/push-test call will fan out to native_push_tokens.
5. **One key works for all environments.** The same .p8 signs both
   development and production pushes — the routing comes from
   `aps-environment` in `App.entitlements` (currently `production`).

**How to verify it's working:** POST to `/api/admin/push-test` with a
logged-in admin session. The response now has a `.ios` block alongside
`.web` showing per-token success/gone/failed counts.

If any env var is missing, the server logs `[native-push] APNS_* env
vars not fully set — native push disabled.` and the broadcast still
delivers to web subscribers without failing.

## Account deletion (Guideline 5.1.1(v))

Apple requires apps that support account creation to also offer in-app
account deletion. Implemented in PR F.

- UI: profile screen (`/profile`) → "Delete account" card with a confirm
  modal that requires the user to type their email before the destructive
  button enables.
- Endpoint: `DELETE /api/auth/account` — requires an authenticated
  session and `{ confirmEmail }` matching the current user's email.
- Backing call: `deleteRealtorAccount()` in `lib/server/realtors-store.ts`
  runs in a single transaction. CASCADE FKs clear push subscriptions,
  native push tokens, passkeys, notification preferences/deliveries,
  giveaway entries, password reset tokens, and WebAuthn challenges.
  `email_log.realtor_id` and `giveaways.winner_realtor_id` are NULLed
  (audit/history preserved without the personal link). `magic_links` rows
  keyed by the email are deleted so old links cannot resurrect the address.
- Session cookie is cleared on the response. Client clears local storage
  and redirects to `/?account_deleted=1`.

**Reviewer instructions to include in App Review notes:**
Sign in with the demo account, tap the profile icon (top right of the
dashboard) or open `/profile`, scroll to the "Delete account" card, tap
"Delete my account", type the demo email to confirm, then tap
"Permanently delete".

## Wrapper risk (Guideline 4.2)

The Capacitor config currently uses `server.url` to load
`https://realtynewsnow.app` directly into the WKWebView. Apple flags this
as a potential "wrapped website" rejection (Guideline 4.2 — Minimum
Functionality). Mitigations already in place that we cite in the App Review
notes:

- Native push notifications (PR B)
- Native share sheet (PR B)
- Face ID sign-in capability (PR B — UI wires up in a follow-up)
- Haptic feedback on key interactions (PR B)
- Camera + photo library integration for listing uploads
- Splash screen + native launch experience
- iOS-tuned status bar styling

If Apple still pushes back, the next step is to bundle the Next.js export
into the app and remove `server.url`. That's a significant change so we
defer it until we know whether the mitigations above are enough.
