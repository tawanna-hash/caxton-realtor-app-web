# Monetization Map — RealtyLine / Newsline App
_Last audited: 2026-05-29_

This is a scoped inventory of every page and where ad/sponsor/affiliate inventory can live. The taxonomy aligns with the existing `AdZone` enum in [`app/admin/ads/_components/types.ts`](app/admin/ads/_components/types.ts) (article · feed · calendar · newsletter · app · account · misc) so new slots plug into the existing campaign system.

> **Current state:** Ad campaigns + creatives exist in admin (`/admin/ads`) and the DB, but **no public page actually renders an ad slot yet.** Every "Status" below is therefore _Net-new_ unless noted.

---

## App-level (every page)

| Slot | Zone | Format | Status |
|---|---|---|---|
| **Sticky footer banner** above bottom nav | `app` | 320×50 / responsive | Net-new |
| **NavDrawer sponsor card** at bottom of drawer (above Legal) | `app` | Native card 300×250 or text+logo | Net-new |
| **Interstitial on app open** (1×/session, dismissible) | `app` | 320×480 | Net-new — high CPM, low frequency |
| **Pub-switch sponsor** ("This issue brought to you by…") | `app` | Logo + tagline strip | Net-new |

---

## Magazine — `/magazine` and `/magazine/[id]`

| Slot | Zone | Format | Status |
|---|---|---|---|
| **Carousel cover sponsor** ("Issue sponsored by") on `MagazineCarousel` | `feed` | Logo strip below title | Net-new |
| **Between-issue native card** every 4th carousel card | `feed` | 400×500 native | Net-new |
| **Full-page interstitial spread** inside flipbook | `article` | 8.5×11 PDF page already supported via hotspots | **Live infra** (HotspotLayer) — needs sales |
| **Hotspot CTAs** on existing pages (tap to call/visit) | `article` | Click-through hotspot | **Live** |
| **Flipbook download sponsor** ("PDF brought to you by…") on download CTA | `article` | Wordmark next to Download pill | Net-new |
| **Flipbook share-modal sponsor** | `article` | Footer wordmark | Net-new |

---

## Calendar of Events — `/calendar` and `/calendar/[publication]/[id]`

| Slot | Zone | Format | Status |
|---|---|---|---|
| **Featured Event** card pinned to top of list | `calendar` | Native event card with "Featured" pill | Net-new — sell per week |
| **Sponsored Day** strip (e.g., "Today's events sponsored by…") | `calendar` | 728×90 above day header | Net-new |
| **Inline banner** every 6 events | `calendar` | 300×100 | Net-new |
| **Event detail page sidebar** | `calendar` | 300×250 + logo | Net-new |
| **Add-to-calendar confirmation modal** | `calendar` | Logo at modal footer | Net-new |
| **Map/Directions tile sponsor** ("Directions powered by…") | `calendar` | Logo strip | Net-new |

---

## Inventory & Promotions — `/inventory` and `/inventory/[id]`

| Slot | Zone | Format | Status |
|---|---|---|---|
| **Featured Builder** strip above filter chips | `feed` | Logo + tagline + CTA | Net-new — premium tier |
| **Promoted Home** card pinned at top per filter view | `feed` | Native card with "Sponsored" pill | Net-new |
| **Inline mortgage/title/insurance card** every 8 listings | `feed` | Native partner card | Net-new — affiliate revenue |
| **Detail page lender CTA** ("Get pre-approved with…") | `article` | 320×100 between price and gallery | Net-new |
| **Detail page builder upsell** to other promos | `article` | Already exists as floater pill | **Live** (Promos pill) — could add tracking-attributed deals |
| **Floater download sponsor** on PDF export | `article` | PDF footer line (already supported) | Net-new |

---

## Communities — `/communities`

| Slot | Zone | Format | Status |
|---|---|---|---|
| **Master-planned spotlight** rotating hero | `feed` | 1200×400 hero with CTA | Net-new |
| **Community card sponsorship** (top-of-list pin) | `feed` | Native card "Featured" | Net-new |
| **Filter-result interstitial** ("Searching X area? Talk to…") | `feed` | 320×100 | Net-new |
| **Communities PDF sponsor footer** | `feed` | Wordmark on every PDF page | Net-new |

---

## Builders — `/builders` and `/builders/[slug]`

| Slot | Zone | Format | Status |
|---|---|---|---|
| **Featured Builder of the Week** hero on `/builders` | `feed` | 1200×400 | Net-new |
| **Premium builder upgrade** (own/edit own profile page) | `feed` | Subscription-style revenue | Net-new — recurring |
| **Cross-builder "You may also like"** sponsored chips | `feed` | Chip with "AD" badge | Net-new |
| **Builder detail sponsor module** (lender / title / inspector partners) | `article` | 3-up partner row at bottom | Net-new |
| **Builder PDF cover sponsor** | `article` | Logo on PDF cover footer | Net-new |

---

## Giveaways — `/giveaways`

| Slot | Zone | Format | Status |
|---|---|---|---|
| **Prize sponsor** ("Prize provided by…") | `feed` | Logo + tagline on card | Net-new — sponsor pays for prize + visibility |
| **Entry-confirmation page sponsor** | `feed` | Full-width banner | Net-new |
| **Co-sponsored giveaway** (lead-gen — opt-in shares lead with sponsor) | `feed` | Checkbox + logo on entry form | Net-new — highest value |

---

## Builder Promotions — `/builder-promotions`

| Slot | Zone | Format | Status |
|---|---|---|---|
| **Promoted promotion** pinned top | `feed` | Native card | Net-new |
| **Mortgage rate ticker** strip | `feed` | Live partner data + CTA | Net-new — affiliate |

---

## Subscribe — `/subscribe`

| Slot | Zone | Format | Status |
|---|---|---|---|
| **Print issue sponsor mention** ("Your first issue features…") | `account` | Inline copy | Net-new |
| **Welcome-kit partner offers** (coupons in welcome email) | `newsletter` | Logo grid | Net-new |
| **Confirmation page partner row** | `account` | 3-up logos | Net-new |

---

## FAQ, About, Advertise — informational

| Slot | Zone | Format | Status |
|---|---|---|---|
| **Advertise page rate card** | `misc` | Conversion-focused — see existing page | **Live** |
| **About page partner mention** | `misc` | Footer logo grid | Net-new |
| **FAQ sidebar partner CTA** | `misc` | 300×250 | Net-new |

---

## Dashboard (logged-in) — `/dashboard`

| Slot | Zone | Format | Status |
|---|---|---|---|
| **Welcome banner sponsor** ("Welcome back, sponsored by…") | `account` | Logo strip top of dashboard | Net-new |
| **Saved search alerts sponsored by lender** | `account` | Inline card | Net-new |
| **Profile completeness prompt + partner CTA** | `account` | "Complete your profile to get matched with [partner]" | Net-new |

---

## Profile — `/profile`

| Slot | Zone | Format | Status |
|---|---|---|---|
| **Preferences-matched partner offers** | `account` | 2-up cards on settings page | Net-new |

---

## Auth pages — `/auth/*`, `/admin/login`

| Slot | Zone | Format | Status |
|---|---|---|---|
| **Side-panel sponsor** on signup/login | `app` | 50/50 split with rotating sponsor visual | Net-new — captive attention |
| **Post-signup welcome sponsor** | `newsletter` | Email-only | Net-new |

---

## Email / Newsletter (no page, but inventory)

| Slot | Zone | Format | Status |
|---|---|---|---|
| **Newsletter header sponsor** | `newsletter` | 600×100 | Net-new |
| **Mid-newsletter native ad** | `newsletter` | Native card | Net-new |
| **Transactional email footer** (giveaway confirmation, subscription receipts) | `newsletter` | Logo line | Net-new |

---

## Tracking — already wired

Every floater Back/Share/Download click flows into PostHog and lands in [`/admin/metrics`](/admin/metrics). Adding `ad_impression` and `ad_click` events with `ad_space_slug` + `campaign_id` properties keeps everything in the same pipeline — no new analytics stack needed.

---

## Recommended next steps

1. **Pick 3-5 highest-value slots** to ship first. Recommended starter pack:
   - Featured Builder strip (`/inventory`, `/builders`)
   - Featured Event (`/calendar`)
   - Sticky footer banner (app-level, every page)
   - Giveaway prize sponsor
   - Newsletter header sponsor
2. **Build a single `<AdSlot slug="…" />` component** that fetches the active campaign for a slug, renders the creative, and fires impression/click events. Plugs into the existing `lib/server/ads-store.ts`.
3. **Seed the `ad_space` table** with the slugs from this map so admin/ads UI lets sales attach campaigns.
4. **Add a rate card sheet** keyed off these slots so the Advertise page has real prices to publish.
