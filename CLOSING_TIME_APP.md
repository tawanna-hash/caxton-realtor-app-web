# Closing Time native app (itsalmostclosingtime.com)

Realty News Now keeps `realtynewsnow.app` and its existing iOS and Android builds. Closing Time ships as its own app.

## What is ready in the repo
- `capacitor.closing-time.config.ts`: separate shell that loads `https://itsalmostclosingtime.com`. Proposed appId `com.itsalmostclosingtime.app` (confirm; it is permanent once submitted).
- The Realty News Now shell now also allows navigation to itsalmostclosingtime.com, so Closing Time links opened inside it stay in the app.
- Store listing URLs for Closing Time (all load on the new domain, same codebase):
  - Marketing: https://itsalmostclosingtime.com
  - Support: https://itsalmostclosingtime.com/support
  - Privacy: https://itsalmostclosingtime.com/privacy
- Closing Time is limited to two accounts, so the reviewer needs a test account added to the gate before submission.

## What still has to be done by hand (needs Xcode, Android Studio and store accounts)
1. Create separate native projects for Closing Time (a copy of `ios/` and `android/` with the new appId and name). Not generated here; no build tooling is available in this workspace.
2. iOS: register the new bundle id and Associated Domains `applinks:itsalmostclosingtime.com`; host an apple-app-site-association file on the new domain (needs the Apple Team ID, `3JU7K7AMUY` is used by the current app, confirm it is the same).
3. Android: new package name, signing key, and an assetlinks.json on the new domain with that key's SHA-256.
4. Create the App Store Connect and Play Console records, icons and screenshots, then submit.
5. Sign in with Apple, if used, needs the new domain added as a return URL in the Apple Services ID.
