# App Store Listing — Realty News Now

Drafts for the App Store Connect submission form. Edit anything in here
before submitting; nothing here is wired up to ship automatically.

## App information

- **App name** (max 30 chars): `Realty News Now`
- **Subtitle** (max 30 chars): `Texas real estate news & MLS`
- **Bundle ID**: `app.realtynewsnow` (must be registered under Identifiers → App IDs on developer.apple.com before first archive upload)
- **SKU**: `RNN-IOS-001`
- **Primary category**: News
- **Secondary category**: Business
- **Content rights**: I have all rights / contains no third-party content (verify)
- **Age rating**: 4+ (no objectionable content)

## App Privacy

- Data linked to user: Contact Info (email, name), Identifiers (user ID), Usage Data (product interaction)
- Data not linked: Diagnostics (crash data, performance)
- Tracking: Yes — PostHog product analytics. ATT prompt is wired via Info.plist NSUserTrackingUsageDescription.

## Promotional text (max 170 chars, can update anytime without review)

Houston, Austin, and San Antonio real estate news, MLS-backed listings, magazine issues, and weekly market reports — all in one app for Texas agents and brokers.

## Description (max 4000 chars)

Realty News Now is the daily companion app for Texas real estate professionals. Get the latest market news, magazine issues, advertiser spotlights, and event alerts from RealtyLine Austin, Newsline San Antonio, and Realty News Houston — the three flagship publications from Caxton Publications.

WHAT YOU GET

• News feed — fresh Texas real estate news, market reports, and editorial features updated daily.
• Magazine issues — the full monthly RealtyLine and Newsline magazines in a fast, mobile-optimized reader.
• Advertiser directory — find local title companies, home warranties, builders, lenders, and education partners in one searchable list. Tap to call, message, or get directions.
• Events calendar — REALTOR® association events, builder open houses, CE classes, and industry mixers across the I-35 corridor.
• Builder spotlights — model home tours, community launches, and inventory updates from Texas's top builders.
• Issue alerts — get a push notification the moment a new magazine drops.
• Switch publications — toggle between RealtyLine Austin, Newsline San Antonio, and Realty News Houston with one tap.

BUILT FOR PROS

Realty News Now is the same publication network real estate agents have trusted for over 20 years — now in a faster, mobile-first format. No paywall. No filler.

SUPPORT

Email tawanna@realtynewsnow.app or visit realtynewsnow.app/support.

Published by Caxton Publications, Inc.

## Keywords (max 100 chars, comma-separated, no spaces after commas)

texas real estate,realtor,mls,houston,austin,san antonio,realty,news,magazine,builder,broker

## Support URL

https://realtynewsnow.app/support

## Marketing URL (optional)

https://realtynewsnow.app

## Privacy Policy URL (required)

https://realtynewsnow.app/legal/privacy

## What's New in This Version (release notes, max 4000 chars)

Welcome to Realty News Now for iPhone and iPad. This is the first native release. Includes the full news feed, magazine reader, advertiser directory, builder spotlights, and event calendar, plus push notifications when new issues drop.

## Copyright

© 2026 Caxton Publications, Inc.

## Trade representative contact

Same as account holder unless distributing in South Korea — leave blank for US-only launch.

## Pricing

Free. No in-app purchases.

## Availability

All territories. (Or restrict to US if you prefer at launch.)

## Sign-in info for App Review (required when app has login)

Apple's reviewer will need a working test account.

- **Username**: `apple-review@realtynewsnow.app` (create in the admin panel before submitting)
- **Password**: generate and paste here before submitting; do NOT commit a real password to git
- **Notes**: "This is a Realtor account with sample listings. The reviewer can browse news, view advertisers, open the magazine reader, and view the events calendar without any further setup."

## Screenshots

Generated under `app-store/screenshots/`:
- `iphone-6.9/` — 1320×2868 (iPhone 16 Pro Max, REQUIRED for new submissions as of Apr 2024)
- `iphone-6.5/` — 1284×2778 (iPhone 14 Plus, still accepted)
- `ipad-13/` — 2064×2752 (iPad Pro 13" M4, REQUIRED if iPad is supported)

5 screens per device size:
1. Home / news feed
2. Dashboard
3. Advertiser directory
4. News article view
5. Events calendar

To regenerate (e.g. after a UI change), re-run the Playwright script in
the PR description — takes about 90 seconds end-to-end.

## Submission checklist (post-merge)

- [ ] Register bundle ID `app.realtynewsnow` under developer.apple.com → Certificates, Identifiers & Profiles → Identifiers → App IDs
- [ ] Enable APNs capability on that App ID (use existing key `WUZYQ4TURX` — "realtyline apple news", already team-scoped for All topics)
- [ ] Create App Store Connect listing with the info above
- [ ] Open `ios/App/App.xcworkspace` in Xcode on a Mac
- [ ] Set Signing & Capabilities → Team to `Tawanna Verock - 3JU7K7AMUY`
- [ ] Product → Archive → Distribute App → App Store Connect → Upload
- [ ] In App Store Connect: attach the uploaded build to the listing, fill in all metadata above, upload all 15 screenshots
- [ ] Submit for review
- [ ] Apple review typically 1–3 days
