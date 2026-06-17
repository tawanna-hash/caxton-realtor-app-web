# Realty News Now — App Store Submission Packet

Everything you need to fill out in App Store Connect when submitting v1.0
for review. Copy/paste from this file directly into the corresponding
fields. All character counts have been pre-validated.

This document is meant to be read top-to-bottom on submission day. Each
section maps to a section in App Store Connect.

> **Companion docs:** see `IOS_BUILD.md` for the step-by-step build,
> archive, and upload runbook.

---

## App Store Connect → My Apps → New App

| Field | Value |
|---|---|
| Platform | iOS |
| Name | **Realty News Now** |
| Primary Language | English (U.S.) |
| Bundle ID | `app.realtynewsnow` |
| SKU | `realtynewsnow-ios-v1` |
| User Access | Full Access |

---

## App Information

### Subtitle (30 characters max)

> **Texas real estate news daily**

(28 characters — under the limit. B2B-leaning, mentions geography + frequency.)

### Privacy Policy URL

```
https://realtynewsnow.app/privacy
```

### Support URL

```
https://realtynewsnow.app/support
```

### Marketing URL (optional)

```
https://realtynewsnow.app
```

### Category

- **Primary**: News
- **Secondary**: Business

### Content Rights

Check "No, it does not contain, show, or access third-party content."
(All content on Realty News Now is original editorial or contributed by
advertisers under signed agreements.)

### Age Rating

Walk through the Age Rating questionnaire. Answer "None" to every
category. Final rating: **4+**.

---

## Pricing and Availability

- **Price**: Free
- **Availability**: All countries/regions
- **App Distribution Methods**: Public on the App Store

---

## App Privacy

In App Store Connect → App Privacy → Get Started, declare the following
data types. (Apple requires the same info that's already in the privacy
policy at `/privacy`.)

### Data Linked to the User

| Data Type | Purpose | Linked to user? | Used for tracking? |
|---|---|---|---|
| **Email Address** | App Functionality, Account Management | Yes | No |
| **Name** (first/last) | App Functionality, Account Management | Yes | No |
| **Phone Number** (optional) | App Functionality | Yes | No |
| **Mailing Address** (optional) | App Functionality (print subscription delivery) | Yes | No |
| **User Content** (giveaway entries, RSVPs) | App Functionality | Yes | No |
| **Identifiers** (user ID) | App Functionality, Analytics | Yes | No |
| **Diagnostics** (crash data) | App Functionality | Yes | No |

### Data NOT Collected

- Health & Fitness data
- Financial Info (Stripe is the payment processor for ads — payment
  data does NOT pass through our servers)
- Location (we never request the device location permission)
- Sensitive Info
- Contacts
- Photos or Videos (Capacitor permission strings are reserved for
  optional advertiser logo uploads — declared but not currently used)
- Audio Data
- Search History
- Browsing History
- Other Usage Data

### Tracking

**No** — we do not track users across other companies' apps or websites.
The app uses only first-party cookies for session management and
preference storage.

---

## Promotional Text (170 characters, can change anytime without resubmission)

> **The Texas real estate market moves fast. Stay on top of every deal, builder, lender, and event with daily news built for industry pros.**

(135 characters.)

---

## Description (4000 characters max)

> **Realty News Now — built for Texas real estate professionals**
>
> The daily companion app for REALTORS®, brokers, lenders, title agents, builders, and everyone who works the Texas residential market. Pulled together by the team behind RealtyLine Austin and Newsline San Antonio, Realty News Now puts the industry's most important news, market data, and community in one place.
>
> **What's inside**
>
> • **Daily market news** — curated coverage of mortgage rates, inventory shifts, brokerage moves, and policy changes affecting Austin, San Antonio, and Texas real estate
>
> • **Builder & community directory** — searchable database of new construction communities, builder reps, and incentives across the metros
>
> • **Industry calendar** — closing celebrations, networking mixers, CE classes, and association events — never miss an opportunity to connect with peers
>
> • **Featured advertisers** — service providers your fellow REALTORS recommend, organized by category so you can find a lender, photographer, stager, or inspector in seconds
>
> • **Member giveaways** — exclusive drawings for industry-only swag, event tickets, and partner perks
>
> • **Print magazine archive** — every back issue of RealtyLine and Newsline at your fingertips
>
> **Why pros use it**
>
> Texas real estate isn't slowing down. Whether you're an Austin agent watching Hill Country growth, a San Antonio broker tracking 1604/1431 corridor inventory, or a Houston lender keeping tabs on incoming markets, the news, contacts, and community on Realty News Now save you time and surface deals before your competition spots them.
>
> Sign up free in under a minute. No license number required to browse — everything is open. Connect your TREC license to unlock member-only giveaways and the contact directory.
>
> **Published by Caxton Publications**
>
> Caxton has published RealtyLine in Austin since 2008 and Newsline in San Antonio since 2015. Realty News Now is our digital home for both communities — and the foundation for new markets coming to Houston, Dallas/Fort Worth, and beyond.
>
> Questions or feedback? Email tawanna@myrealtyline.com — we read everything.

(2,115 characters — well under the 4,000 cap, leaves room to expand later.)

---

## Keywords (100 characters max, comma-separated)

> **real estate,texas,houston,austin,san antonio,realtor,broker,lender,builder,market,news**

(86 characters. No spaces wasted, no duplicates with the app name or
subtitle (Apple deduplicates automatically).)

---

## What's New in This Version (4000 characters, required on every release)

For v1.0, use:

> **Welcome to Realty News Now. The Texas real estate industry's daily companion — now native on iPhone. Sign in or sign up free and start with today's market news.**

---

## Screenshots

Required: **6.9" iPhone display** — minimum 3, maximum 10.
Resolution: **1320 × 2868 px** (portrait, iPhone 17 Pro Max).

Apple deprecated the older 6.7" requirement in favor of 6.9" with the
Xcode 26 / iOS 26 release cycle. The iPhone 17 Pro Max simulator that
ships with Xcode 26.5 is the correct target.

### How to capture

1. Open Xcode → run on **iPhone 17 Pro Max Simulator**
2. Navigate to each screen below
3. **File → New Screen Shot** (`Cmd + S`) — saves to Desktop at the
   correct 1320 × 2868 resolution automatically

### Recommended screen list (capture in this order)

1. **Home feed** (logged out) showing today's news headlines + featured
   advertiser block
2. **News article detail** — pick a long article with a hero image
3. **Builder directory** — filtered by Austin or San Antonio
4. **Industry calendar** — month view with multiple events visible
5. **Advertiser detail page** — one of the active campaigns (Amplify
   Credit Union has a complete profile)
6. **Dashboard** (logged in as `appreview@realtynewsnow.app`) showing
   profile + saved content

### Optional: 6.5" iPhone (1284 × 2778)

Recommended for broader device coverage but not required. Use **iPhone
14 Plus Simulator** with the same screen list. Apple will scale your
6.9" screenshots automatically if you skip this.

---

## App Review Information

### Sign-In Information

| Field | Value |
|---|---|
| **Sign-in required?** | Yes (some features) |
| **Username** | `appreview@realtynewsnow.app` |
| **Password** | `AppleReview2026!` |

The account is a real subscriber account on production with email
verified and password set. It has no admin privileges — it can browse
all content, view its own profile, and update preferences. It cannot
modify other users' data, send emails, or access billing.

### Contact Information

| Field | Value |
|---|---|
| **First Name** | Tawanna |
| **Last Name** | Verock |
| **Phone** | _(fill in your direct line)_ |
| **Email** | tawanna@myrealtyline.com |

### Notes (paste this verbatim into the Notes field)

```
Realty News Now is a daily news + community app for Texas real estate
professionals (REALTORS, brokers, lenders, builders). It is published
by Caxton Publications, the publisher behind RealtyLine Austin (since
2008) and Newsline San Antonio (since 2015) — long-established print
publications now extended to a native iOS experience.

How to test:
1. Open the app — most content (news, builders, calendar, advertisers,
   giveaways, magazine archive) is fully browsable without signing in.
2. To test the signed-in experience, use the credentials above. The
   reviewer account has email verified, password set, and lives in the
   Austin market. After signing in you can browse the dashboard,
   profile, and member-only screens.
3. Notable native features to verify:
   - Native splash screen (navy + gold) with custom branding
   - Status bar overlay tuned to the navy palette
   - Native share sheet integration on articles
   - Capacitor-managed deep linking (publication permalinks)

What's NOT in v1.0 (planned for future updates):
- Push notifications
- In-app purchases (we do not sell digital goods inside the app; ad
  campaign payments happen through our website at /advertise and use
  Stripe, which the App Store guidelines explicitly permit for
  physical/non-digital services)

If anything looks unclear during review, please email
tawanna@myrealtyline.com — we respond within hours.
```

---

## Guideline 4.2 — Minimum Functionality (the #1 rejection risk for WebView apps)

Apple often rejects WebView-wrapped apps under guideline 4.2. Here's the
case to make in the Notes field if Apple pushes back. We pre-emptively
include the strongest points in the Notes above; this is the longer
defense to send if a rejection comes in.

### Native value-adds beyond a website

1. **Branded native splash** — `ios/App/App/Assets.xcassets/Splash.imageset/`
   ships a custom navy + gold launch experience that web Safari can't
   reproduce
2. **Custom status bar styling** — `StatusBar` plugin tunes the iOS
   status bar to the navy brand color (`#0a3d91`)
3. **Native share sheets** — Capacitor `@capacitor/share` integrates
   articles with the iOS share sheet (Messages, AirDrop, Notes, etc.)
4. **Full-screen immersive layout** — no browser chrome, persistent
   tab bar, native-feeling navigation gestures
5. **App icon on home screen** — discoverable as a daily-use app rather
   than buried as a Safari bookmark
6. **Curated industry content** — Realty News Now is not a generic
   website. It's a niche professional publication serving thousands of
   licensed Texas real estate professionals with daily editorial,
   industry-only giveaways, and a member directory. The native shell
   is the iOS-quality entry point to that community.
7. **TestFlight beta period** — we run a 2–3 day internal TestFlight
   round before public submission to catch device-specific bugs

### Why the live web architecture

The app deliberately loads the latest production build of
realtynewsnow.app inside a WKWebView so we can push editorial updates
instantly without resubmitting binaries. This is the same architecture
Apple has approved for many news publications. Our advertising
contracts and member giveaways change daily — bundling a frozen build
would degrade user experience.

---

## Pre-Submission Checklist

Run through this the day you submit:

- [ ] Apple Developer Program enrollment approved (Team ID in hand)
- [ ] App Store Connect listing created with bundle ID `app.realtynewsnow`
- [ ] Xcode signing configured with the Team
- [ ] Successful Archive (Product → Archive on a Mac, iOS device target)
- [ ] Upload to App Store Connect via Organizer → Distribute App
- [ ] TestFlight build processed (~10–30 min after upload)
- [ ] Internal TestFlight tester added, app installed on a real iPhone
- [ ] 2–3 days of self-testing on real device — every flow walked through
- [ ] Screenshots captured (minimum 3 × 6.7")
- [ ] App icon visible at all sizes (Apple auto-resizes from 1024×1024)
- [ ] Privacy URL loads: https://realtynewsnow.app/privacy
- [ ] Support URL loads: https://realtynewsnow.app/support
- [ ] Reviewer account logs in cleanly: `appreview@realtynewsnow.app` / `AppleReview2026!`
- [ ] All metadata fields filled (subtitle, promo text, description, keywords)
- [ ] Age Rating questionnaire submitted (answer: 4+)
- [ ] App Privacy section completed (paste from the table above)
- [ ] Reviewer Notes field filled with the script above
- [ ] "Add for Review" clicked

Typical review queue for a first-time app: **24–48 hours**. You'll get
an email when the status flips to "In Review", then again when it's
"Pending Developer Release" (approved!) or "Rejected" (rare, with
specific reasons attached).

---

## After Approval

1. Pick a release strategy:
   - **Manually release this version** — recommended for v1. Lets you
     pick the exact moment the app goes live, e.g. coordinate with a
     newsletter announcement.
   - **Automatically release this version** — flips to live as soon as
     Apple approves.
2. Click **Release This Version** when ready.
3. Within ~2 hours the app is live on the App Store worldwide.

---

## After Launch

For **content-only changes** (new articles, advertiser changes, layout
tweaks): push to `main`, Vercel deploys, the iOS app sees the new web
version on next launch. **No resubmission needed.**

For **native changes** (icon, splash, new permissions): bump build
number, archive, upload, TestFlight, submit. Follow `IOS_BUILD.md`
section 9.
