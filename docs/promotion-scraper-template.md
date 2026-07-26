# Builder / Developer Promotions Scraper — Template & Guide

Companion to `docs/scraper-template.md` (move-in homes) and
`docs/community-scraper-template.md` (communities). This guide covers the
**promotions** scraper: one row per time-limited offer a builder runs — a
realtor rewards / broker-bonus program, a rate buydown, a closing-cost
incentive, a sales event, etc. Promotions carry offer copy, a lifecycle
window (`startsAt` / `expiresAt`), a `promoType` classification, and a
flyer PDF that renders as a thumbnail carousel. Public surface:
`realtynewsnow.app/inventory/[id]` (the same detail page as move-in homes —
it branches on `kind === 'promotion'`).

The reference implementation is `lib/scrapers/mi-homes-incentives.ts`
(scrapes mihomes.com incentive pages verbatim) and its cron
`app/api/cron/scrape-mi-homes-incentives/route.ts`.
`lib/scrapers/kb-home-promotions.ts` is a second reference: scrapes a
single `/special-low-rates` static marketing page for rate-buydown
offers (KBHS Home Loans rates, closing-cost credits, seller contributions).
Use this doc as the field standard when adding a new builder's
**promotions** scraper.

The worked example below is the real `realtynewsnow.app/inventory/653` —
Drees Homes' **2026 Realtor Rewards Program** (4% commission on all sales,
Jun 1 – Sep 30, 2026).

## 1. What a promotions scraper produces

- **One row per active offer** (not per home, not per community).
  `kind = 'promotion'`, `homeType = null`.
- The row carries the offer's headline fields: title, builder, market
  (city/state), marketing copy, the lifecycle window, a `promoType`, a
  hero image, and a **flyer PDF** (the offer's one-pager).
- Promotions have **no `communityData`** — the structured-detail object is
  for communities. A promotion's richness lives in its description + flyer.
- Only rows with `status = 'active'` AND `kind = 'promotion'` render on the
  public `/inventory/[id]` page and in the `/builders/[slug]` Promotions
  section.

### Promotions vs. move-in homes vs. communities — at a glance

| | Move-in homes | Communities | **Promotions** |
|---|---|---|---|
| `kind` | `listing` | `listing` | **`promotion`** |
| `homeType` | `plan`/`showcase`/`listing` | `community` | **`null`** |
| One row per | available home | neighborhood | **time-limited offer** |
| `communityData` | no | yes | **no** |
| Auto-published by upsert? | yes (`listing`) | yes (`listing`) | **no — stays `pending`** (§9) |
| Prune function | `deactivateStaleBuilderInventory` | same | **`deleteStaleBuilderPromotions`** (DELETE) |
| Returned by `/api/inventory`? | yes (default) | no (filtered out) | **yes, with `?kind=promotion`** |

## 2. Required output row shape

```ts
type ScrapedPromotionRow = {
  externalId: string;            // stable builder-side offer id
  kind: 'promotion';             // always 'promotion'
  publication: 'realtyline' | 'newsline';  // Austin vs. San Antonio
  builderName: string;           // exact, case-sensitive
  title: string;                 // offer headline (fallback ladder §5)
  city: string;                  // market city, or "Greater Austin"
  state: string;                 // 2-letter abbrev
  description: string | null;    // offer marketing copy (the terms)
  promoType: PromoType | null;    // §7 — rate_buydown|incentive|event|broker_bonus|other
  startsAt: string | null;       // ISO date the offer begins ('2026-06-01')
  expiresAt: string | null;     // ISO date the offer ends ('2026-09-30')
  flyerPdfUrl: string | null;    // offer one-pager PDF → thumbnail carousel
  thumbnailUrl: string | null;   // hero image (offer graphic / elevation)
  sourceUrl: string | null;      // builder's offer page → "Visit builder site"
  galleryUrls: string[] | null;  // rarely populated; the flyer is the visual
  communityName: string | null;  // if the offer is scoped to one community
  submittedByName: string;       // scraper submitter identity
  submittedByEmail: string;
  // Per-home fields stay null for promotions:
  bedsMin/Max, bathsMin/Max, sqftMin/Max, priceMin/Max, address, readyDate, planName,
};
```

`PromoType` (defined in `lib/builder-inventory.ts`):
```ts
type PromoType = 'rate_buydown' | 'incentive' | 'event' | 'broker_bonus' | 'other';
```

### Worked example — `inventory/653` (Drees Homes Realtor Rewards — real row)

```jsonc
{
  "externalId": "drees-realtor-rewards-2026",
  "kind": "promotion",
  "publication": "realtyline",
  "builderName": "Drees Homes",
  "title": "2026 REALTOR REWARDS PROGRAM EARN MORE WITH DREES CUSTOM HOMES",
  "city": "Greater Austin",
  "state": "TX",
  "description": "Don’t leave money on the table! Drees truly values the relationships we have developed with our Realtor partners. That’s why we want you to make the most of your selling. With Drees Custom Homes, you’ll earn 4% commission on ALL sales from June 1 to September 30, 2026*.",
  "promoType": "broker_bonus",          // 4% commission to realtors
  "startsAt": "2026-06-01",
  "expiresAt": "2026-09-30",
  "thumbnailUrl": "https://b2lqsyyhvbkewrwf.public.blob.vercel-storage.com/inventory-thumbs/653/Screenshot%202026-06-11%20at%2012.12.37%E2%80%AFPM-2sxhiu6QyGukVuVcFLFi4TSO8HvxSa.png",
  "flyerPdfUrl": "https://b2lqsyyhvbkewrwf.public.blob.vercel-storage.com/inventory-flyers/1781197900454-zw70fexr-drees-custom-homes.pdf",
  "sourceUrl": null,                    // Drees has no public offer page — the flyer IS the source
  "galleryUrls": null,
  "communityName": null,                // market-wide, not scoped to one community
  "homeType": null,
  "submittedByName": "Drees Auto-Importer",
  "submittedByEmail": "scraper-drees@harmonyone.system"
}
```

## 3. Field reference (source → output)

| Field | Example | Source / notes |
|---|---|---|
| `externalId` | `drees-realtor-rewards-2026` | Stable builder-side offer id; drives upsert + prune. Derive from offer name + year. |
| `kind` | `promotion` | Always `'promotion'`. |
| `publication` | `realtyline` | Austin = `realtyline`, San Antonio = `newsline`. |
| `builderName` | `Drees Homes` | Exact, case-sensitive — must match everywhere + the prune call. |
| `title` | "2026 REALTOR REWARDS PROGRAM…" | Offer headline; fallback ladder §5. |
| `city / state` | `Greater Austin / TX` | Market city. Market-wide offers use "Greater Austin". State always 2-letter. |
| `description` | "Don't leave money on the table!…" | The offer's terms/marketing copy. Scrape verbatim when it's the builder's own copy. |
| `promoType` | `broker_bonus` | Classify the offer — §7. |
| `startsAt` | `2026-06-01` | ISO date the offer begins. Parse from copy ("June 1 to …"). |
| `expiresAt` | `2026-09-30` | ISO date the offer ends. Drives the "Available through" line. |
| `flyerPdfUrl` | `…/drees-custom-homes.pdf` | Offer one-pager → public **thumbnail carousel** + lightbox + Download button. |
| `thumbnailUrl` | `…/Screenshot….png` | Hero image; absolutize path-only URLs. |
| `sourceUrl` | `null` | Builder's offer page → "Visit builder site" pill. Null when the flyer is the only source (common). |
| `communityName` | `null` | Set only when the offer is scoped to one community. |
| `homeType` | `null` | Promotions have no homeType. |

## 4. `externalId` — stability rules

Same rules as move-in homes / communities: a stable, builder-side identifier
that survives re-runs. Good: `<builder>-<offer-slug>-<year>`
(`drees-realtor-rewards-2026`), a builder offer id, or a slug derived from
the canonical offer URL. Bad: array index, or anything that changes when the
source reorders its list. The prune pass
(`deleteStaleBuilderPromotions`) **deletes** any promotion whose
`externalId` left the feed — so an unstable id silently drops promotions
(and their flyer/subordinate rows via cascade).

## 5. Title fallback ladder

1. the offer's own headline (og:title / `<h1>` on the offer page)
2. the flyer's title metadata
3. a friendly title-case of the offer slug
4. `externalId` (last resort)

Strip trailing builder/site suffixes the source appends (e.g.
"… — Greater Austin - Drees Custom Homes").

## 6. Description — the offer terms

The description is the offer's marketing copy AND its terms (commission %,
rate, credit amount, qualifying period). Scrape it verbatim when it comes
from the builder's own marketing (M/I Homes does this — verbatim copy is
safe to auto-publish, §9). Decode HTML entities + strip residual tags so
stored copy is plain text. The public page renders it under
"About this promotion" with `whitespace-pre-line`, so preserve line breaks.

If no copy is available, synthesize a one-liner from the structured fields:
> Drees Homes 2026 Realtor Rewards Program — earn 4% commission on all
> sales, June 1 – September 30, 2026. Greater Austin, TX.

## 7. `promoType` — classifying the offer

Map the offer to exactly one value (the union is closed — don't freehand):

| `promoType` | Use for | Example |
|---|---|---|
| `broker_bonus` | Commission / realtor reward programs | Drees 4% realtor rewards |
| `rate_buydown` | Mortgage rate buydowns (e.g. 5.99% for 2 years) | M/I 5.99% rate lock |
| `incentive` | Closing-cost credits, free options/upgrades, price cuts | $15K closing credit |
| `event` | Time-bound sales events (grand opening, model unveiling) | Grand Opening weekend |
| `other` | Anything that doesn't fit the above | Sweepstakes |

If you can't tell, use `'other'` — don't guess `broker_bonus` for a
consumer incentive.

## 8. `startsAt` / `expiresAt` — lifecycle window

- Store as **ISO date strings** (`YYYY-MM-DD`), not display strings. The
  UI formats them ("Ends Sep 29, 2026") via `formatDate`.
- Parse the window from the copy ("June 1 to September 30, 2026"). If only
  an end date is available, set `startsAt: null`.
- `expiresAt` drives the public "Available through" line AND the natural
  prune signal — an expired offer is a candidate for the next scrape's
  `deleteStaleBuilderPromotions` pass (it's gone from the source).

## 9. `flyerPdfUrl` + `thumbnailUrl` + `sourceUrl`

- **`flyerPdfUrl`** is the promotion's signature asset. The public detail
  page rasterizes it client-side (pdfjs-dist) into a **thumbnail carousel**
  (compact filmstrip of pages; click a thumbnail → full-size lightbox) plus
  a "Download flyer" button. When a builder has >1 promotion, an
  **"Other promotions"** carousel of sibling flyers renders below, each
  labeled and linking to its own `/inventory/[id]`. So: always capture the
  PDF when one exists.
- **`thumbnailUrl`** is the hero image shown in the builder-page Promotions
  row and the detail gallery. Absolutize path-only URLs.
- **`sourceUrl`** becomes the "Visit builder site" pill in the floater.
  Prefer a non-PDF page; if only a PDF exists, leave `sourceUrl: null` and
  let the flyer carousel carry the content (this is the Drees case).

## 10. Cron route — `app/api/cron/scrape-<builder>-promotions/route.ts`

Mirror the canonical promo cron (`app/api/cron/scrape-mi-homes-incentives/route.ts`).
Same shape: auth → fetch rows → upsert each → prune → return summary JSON.
**Three promotion-specific differences** from the move-in/community cron:

### a) Promotions are NOT auto-published by the upsert

`upsertBuilderInventoryByExternalId` auto-activates `kind === 'listing'`
rows only. Promotion rows land as `status = 'pending'` (S14: a human reviews
legal text / dates / participating-community claims before publishing). You
have two choices in the cron:

- **Leave pending (default).** For offers whose copy you synthesize or that
  need legal review. An admin approves them on `/admin/inventory`.
- **Auto-publish verbatim builder copy (M/I pattern).** When the copy is
  scraped word-for-word from the builder's own marketing, publish live so it
  surfaces in the active feed. **Always respect a human `'rejected'` stamp**
  — never re-activate a row an admin rejected:

```ts
const result = await upsertBuilderInventoryByExternalId(row);
if (result.created) created++; else updated++;
if (result.row.status !== 'active' && result.row.status !== 'rejected') {
  await updateBuilderInventory(result.row.id, { status: 'active' });
  published++;
}
```

### b) Prune with `deleteStaleBuilderPromotions`, not `deactivateStaleBuilderInventory`

The listing prune filters `kind = 'listing'`, so it's a no-op for promotions.
Promotions use a dedicated **DELETE** (not deactivate) — offers that rotate
off the builder's site are removed entirely (cascading to flyer/subordinate
rows). Guarded: returns 0 on an empty scrape; never deletes human-submitted
(NULL `external_id`) rows.

```ts
let deleted = 0;
if (rows.length > 0) {
  deleted = await deleteStaleBuilderPromotions({
    builderName: row.builderName,
    activeExternalIds: rows.map((r) => r.externalId),
  });
}
```

### c) The upsert call

```ts
const result = await upsertBuilderInventoryByExternalId({
  externalId: row.externalId,
  kind: 'promotion',
  publication: row.publication,            // 'realtyline' | 'newsline'
  submittedByName: SCRAPER_SUBMITTER_NAME,
  submittedByEmail: SCRAPER_SUBMITTER_EMAIL,
  builderName: row.builderName,
  title: row.title,
  city: row.city,
  state: row.state,
  description: row.description,
  promoType: row.promoType,               // ← PromoType
  startsAt: row.startsAt,                 // ← ISO date
  expiresAt: row.expiresAt,               // ← ISO date
  flyerPdfUrl: row.flyerPdfUrl,           // required field — pass null if none
  thumbnailUrl: row.thumbnailUrl,
  sourceUrl: row.sourceUrl,
  galleryUrls: row.galleryUrls,
  communityName: row.communityName,
  // bedsMin/Max, bathsMin/Max, sqftMin/Max, priceMin/Max, address, readyDate,
  // planName, homeType, communityData → leave null/omitted for promotions.
});
```

Note: `flyerPdfUrl` and `thumbnailUrl` are **required (non-optional)** fields
on `UpsertScrapedInput` — always pass them (use `null`, never omit).

### `maxDuration`

Promotion scrapers are usually light (one list page + a few offer pages).
60s is typical; bump to 150s if you fetch a flyer/offer page per promotion.

## 11. Build / test / deploy / verify checklist

1. **Type check** (cache-busted): delete `*.tsbuildinfo`, then
   `NODE_OPTIONS="--max-old-space-size=4096" npx tsc --noEmit --incremental false`.
   Only acceptable error: the lone `node_modules/@types/node/tls.d.ts` TS1010
   artifact. **Vercel's `next build` type-check is stricter than local tsc** —
   it has caught missing required fields (`flyerPdfUrl`) and bad `as` casts
   that local tsc false-passed. Treat the Vercel build as the source of truth.
2. **Lint:** `npx eslint --max-warnings=0 lib/scrapers/<builder>-promotions.ts
   app/api/cron/scrape-<builder>-promotions/route.ts` (Husky pre-commit
   enforces 0 warnings).
3. **Commit + push to main.**
4. **Deploy explicitly** — the Vercel auto-deploy webhook does NOT fire on
   push: `npx vercel --prod --token "$VERCEL_TOKEN" --yes`.
5. **Run the scrape** (production needs the bearer):
   `curl -H "Authorization: Bearer $CRON_SECRET"
   https://realtynewsnow.app/api/cron/scrape-<builder>-promotions`.
6. **Verify.** Unlike communities, promotions ARE returned by
   `/api/inventory`:
   `curl 'https://realtynewsnow.app/api/inventory?pub=all&kind=promotion&limit=100'`
   (response key is `items`, not `rows`). Confirm `promoType`, `expiresAt`,
   `flyerPdfUrl`, and `status` (`active` if you auto-published, else approve
   on `/admin/inventory` first). Then spot-check
   `realtynewsnow.app/inventory/<id>` — confirm the flyer thumbnail carousel,
   "Available through" date, and (for multi-offer builders) the "Other
   promotions" strip.
7. Add the cron schedule to `vercel.json` `crons[]` (stagger off existing
   builder slots).

## 12. Pitfalls (lessons learned this codebase)

- **Promotions do NOT auto-publish.** The upsert only auto-activates
  `kind='listing'`. A scraped promotion lands `pending` unless the cron
  explicitly publishes it (§10a). If your promos don't show on the builder
  page, this is the first thing to check.
- **Never re-activate a `'rejected'` promotion.** If you auto-publish,
  guard with `status !== 'active' && status !== 'rejected'`. An admin's
  rejection must stick across re-scrapes.
- **Use `deleteStaleBuilderPromotions`, not `deactivateStaleBuilderInventory`.**
  The listing prune filters `kind='listing'` → no-op for promotions. And
  promotions are **deleted**, not deactivated (status='expired').
- **`flyerPdfUrl` + `thumbnailUrl` are required fields.** Omitting
  `flyerPdfUrl` fails the Vercel build's type-check (local tsc may false-pass).
  Pass `null` when there's no flyer.
- **`promoType` is a closed union.** Don't store freehand strings; map to
  `rate_buydown | incentive | event | broker_bonus | other`.
- **Store dates as ISO, not display strings.** `expiresAt: '2026-09-30'`, not
  "Ends Sep 29, 2026" — the UI formats for display.
- **`homeType` is null for promotions.** Setting it (e.g. `'community'`)
  will make the row vanish from the promotions bucket and show up in the
  wrong place.
- **Never remove the `rows.length > 0` prune guard.** A transient empty
  scrape must not delete every promotion.
- **The flyer renders as a thumbnail carousel, not a PDF viewer.** Capture
  the PDF; the detail page rasterizes it client-side (works on iOS Safari,
  which can't embed PDFs). If rasterization fails, it falls back to a
  Download-flyer link.
- **`builderName` matching is exact and case-sensitive** in the prune call
  and the inventory list. "Drees Homes" ≠ "Drees Custom Homes".
- **Static marketing pages as promotion sources.** Some builders (KB Home)
  have a single `/special-low-rates` page rather than a structured promotions
  API. Scrape the static HTML for rate-buydown offers, closing-cost credits,
  and seller contributions. Store as a single promotion row with
  `promoType='rate_buydown'` and a stable `externalId` like
  `'<builder>-special-low-rates'`.
