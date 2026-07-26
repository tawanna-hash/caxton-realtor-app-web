# Builder / Developer Community Scraper — Template & Guide

Companion to `docs/scraper-template.md` (move-in homes). This guide covers the
**community** scraper: one row per master-planned community / neighborhood a
builder sells in, carrying a rich structured `communityData` object (home plans,
amenities, schools, tax info, sales office + directions, gallery, lifecycle
status). Public surface: `realtynewsnow.app/communities/[id]`.

The reference implementation is `lib/scrapers/mi-homes-communities.ts`
(Sitecore community-card API + per-community detail enrichment) and
`lib/scrapers/david-weekley.ts` (extracts `window.pageData` from
davidweekley.com community pages). `lib/scrapers/kb-home-communities.ts`
is a third reference: sitemap discovery → `dataLayer.page` for community
ID/name + `FloorPlanList` JSON for home plans + `LocalQMIs` for sales
office/highlights. Use this doc as the field standard when
adding a new builder's **community** scraper.

The worked example below is the real `realtynewsnow.app/communities/6` —
Barksdale, an M/I Homes community in Leander, TX.

## 1. What a community scraper produces

- **One row per community** (not per home). `homeType = 'community'`,
  `kind = 'listing'`.
- The base row carries the headline fields (name, builder, city, price range,
  sqft range, thumbnail, source URL, description).
- The structured detail — home plans, amenities, schools, tax rates, sales
  office + driving directions — lives in the **`communityData`** JSONB column,
  typed as `CommunityData` (see §8).
- Only rows with `status = 'active'` AND `homeType = 'community'` render on the
  public `/communities/[id]` page.

## 2. Required output row shape

```ts
type ScrapedCommunityRow = {
  externalId: string;            // stable builder-side community id
  builderName: string;           // exact, case-sensitive (must match everywhere)
  title: string;                 // community name (fallback ladder §5)
  city: string;
  state: string;                 // 2-letter abbrev
  description: string | null;    // community marketing copy, else synthesize
  bedsMin: number | null;        // optional range across plans
  bedsMax: number | null;
  bathsMin: number | null;
  bathsMax: number | null;
  sqftMin: number | null;
  sqftMax: number | null;
  priceMin: number | null;       // from price / basePrice
  priceMax: number | null;
  flyerPdfUrl: string | null;
  thumbnailUrl: string | null;   // hero image
  sourceUrl: string | null;      // builder community page → public button
  galleryUrls: string[];          // community photos (fallback for communityData.imageUrls)
  communityName: string | null;   // friendly name (NOT the slug)
  homeType: 'community';          // always 'community'
  communityData: CommunityData;   // structured detail — §8
};
```

### Worked example — `communities/6` (Barksdale, M/I Homes — real row)

```jsonc
{
  "externalId": "mi-barksdale",
  "builderName": "M/I Homes",
  "title": "Barksdale",
  "city": "Leander",
  "state": "TX",
  "communityName": "Barksdale",
  "priceMin": 475000,
  "priceMax": 750000,
  "sqftMin": 2022,
  "sqftMax": 3150,
  "bedsMin": 3, "bedsMax": 5,
  "bathsMin": 2, "bathsMax": 4,
  "thumbnailUrl": "https://cdn.mihomes.com/mihomesmedia/83fa975b628c440b9c9bb9768c17d1a1/4994805-50035",
  "sourceUrl": "https://www.mihomes.com/new-homes/texas/greater-austin/leander/barksdale",
  "galleryUrls": ["https://cdn.mihomes.com/mihomesmedia/83fa975b628c440b9c9bb9768c17d1a1/4994805-50060", "https://cdn.mihomes.com/mihomesmedia/83fa975b628c440b9c9bb9768c17d1a1/4975809-50060"],
  "description": "Find the new home of your dreams at Barksdale, a new home community in Leander, TX offering convenience and charm in every corner.",
  "homeType": "community",
  "communityData": {
    "status": null,
    "adultOnly": false,
    "priceFrom": "$475,000 - $750,000+",
    "sqftRange": "2,022 - 3,150",
    "amenities": ["Clubhouse", "Fitness Center", "Swimming Pool", "Parks & Trails", "Playground"],
    "homePlans": [
      { "name": "San Gabriel - C", "beds": "4", "baths": "5", "sqftDisplay": "3,714",
        "priceDisplay": "From $769,990", "imageUrl": "https://cdn.mihomes.com/mihomesmedia/83fa975b628c440b9c9bb9768c17d1a1/4994805-50060",
        "url": "https://www.mihomes.com/new-homes/texas/greater-austin/leander/barksdale/san-gabriel-plan", "isModel": true }
    ],
    "schools": { "district": "Leander ISD",
      "list": [{ "name": "Williamson County Regional Park", "grades": "K-12",
        "address": "Leander, TX 78641" }] },
    "taxInfo": { "entities": [{ "name": "Leander ISD", "rate": "1.28%" },
        { "name": "Williamson County", "rate": "0.49%" }], "total": "2.07%" },
    "salesOffice": { "address": "8000 Thompson Ln, Leander, TX 78641",
      "hours": "Mon-Sat 10am-7pm, Sun 12-7pm",
      "phone": "512-555-0199",
      "specialistName": "Jane Smith",
      "lat": 30.566917, "lng": -97.783389,
      "directions": ["From US-183 N, exit Whitestone Blvd", "Turn right on Thompson Ln; model home on the left"] }
  }
}
```

## 3. Field reference (source → output)

| Field | Example | Source / notes |
|---|---|---|
| `externalId` | `mi-barksdale` | Stable builder-side id; drives upsert + prune. Never an array index. |
| `builderName` | `M/I Homes` | Exact, case-sensitive — must match on every row + cron prune call. |
| `title` | `Barksdale` | Community name; fallback ladder §5. |
| `city / state` | `Leander / TX` | State always 2-letter (`stateToAbbrev`). |
| `description` | "Find the new home of your dreams at Barksdale…" | Prefer the community's marketing copy; else synthesize. |
| `priceMin / priceMax` | `475000 / 750000` | Numeric range across plans; also mirror `communityData.priceFrom` as a display string. |
| `sqftMin / sqftMax` | `2022 / 3150` | Numeric range across plans; also mirror `communityData.sqftRange`. |
| `beds/baths` | `3-5 / 2-4` | Optional aggregate range across plans. |
| `thumbnailUrl` | `cdn.mihomes.com/…/50035` | Hero image; absolutize path-only URLs. |
| `sourceUrl` | `mihomes.com/…/leander/barksdale` | Builder community page → public button + share. |
| `galleryUrls` | `[url, url, …]` | Community photos; cap ~30. Falls back into the gallery if `communityData.imageUrls` is empty. |
| `communityName` | `Barksdale` | Friendly name for UI grouping (not the slug). |
| `homeType` | `community` | Always `'community'` for community rows. |
| `communityData` | (object) | Structured detail — §8. Drives Home Plans, Amenities, Schools, Tax Info, Sales Office sections. |

## 4. `externalId` — stability rules

Same rules as move-in homes: a stable, builder-side identifier that survives
renames. Good: a builder community id, a slug derived from the canonical
community URL, or `<builder>-<community-slug>`. Bad: array index, or anything
that changes when the source reorders its list. The prune pass
(`deactivateStaleBuilderInventory`) deactivates any `community` row whose
`externalId` left the feed — so an unstable id silently drops communities.

## 5. Title fallback ladder

Communities usually have a single canonical name, so the ladder is short:

1. `communityData.communityName`
2. the source list-card name
3. a friendly title-case of the community slug
4. `externalId` (last resort)

Never use the raw URL slug as the title without title-casing it.

## 6. Description — prefer detail page, else synthesize

Prefer the builder's community marketing copy (the "About this community"
paragraph on the community detail page). If only structured fields are
available, synthesize:

> Caliterra is a David Weekley community in Dripping Springs, TX. Homes from
> the $480s, 1,700–3,400 sq. ft., 3–5 bedrooms. Amenities include a pool,
> clubhouse, trails, and parks. Coming soon.

Decode HTML entities + strip residual tags (the public page also decodes, but
clean it in the scraper so stored copy is plain text).

## 7. `sourceUrl` + `galleryUrls` + `imageUrls`

- `sourceUrl` → the builder's community page (not a specific home). Becomes the
  public "Builder Site" button and the share link. Absolutize path-only URLs.
- `galleryUrls` (top-level) populate the community gallery. `communityData.imageUrls`
  is the same concept inside the structured object — set **both** from the same
  photo set (the page prefers `galleryUrls`, then falls back to
  `communityData.imageUrls`, then `thumbnailUrl`).
- Pick the largest image variant from srcsets; cap ~30.

## 8. `communityData` — the structured detail object

Type lives in `lib/scrapers/david-weekley.ts` and is imported across the
codebase. Populate every sub-object the source exposes; omit what it does not.

```ts
type CommunityData = {
  communityName?: string | null;
  availability?: string | null;        // raw availability string
  status?: 'coming-soon' | 'close-out' | null;  // derived badge
  adultOnly?: boolean;                  // 55+ badge
  priceFrom?: string | null;           // "From the $480s" display string
  basePrice?: number | null;
  sqftRange?: string | null;           // "1,700–3,400" display string
  city?: string | null;
  imageUrls?: string[];
  amenities?: string[];
  salesOffice?: {
    address?: string | null;
    hours?: string | null;
    phone?: string | null;           // sales office phone — renders as tel: link
    specialistName?: string | null;  // on-site sales specialist name
    directions?: string[];           // ordered driving-direction steps
    lat?: number | null;
    lng?: number | null;
  } | null;
  homePlans?: CommunityHomePlan[];
  schools?: { district?: string | null; list: CommunitySchool[] } | null;
  taxInfo?: { entities: { name: string; rate: string }[]; total?: string | null } | null;
};

type CommunityHomePlan = {
  name: string;                        // plan name (required)
  url?: string | null;                 // floor-plan detail page
  priceDisplay?: string | null;       // "From $485,000"
  basePrice?: number | null;
  sqftDisplay?: string | null;        // "1,820"
  beds?: string | null;
  baths?: string | null;
  garages?: string | null;
  stories?: string | null;
  imageUrl?: string | null;            // elevation image
  status?: string | null;
  isModel?: boolean;                   // shows "Model Home" badge
};

type CommunitySchool = {
  name: string;                        // (required)
  grades?: string | null;             // "PK-5"
  address?: string | null;
  phone?: string | null;
  website?: string | null;
};
```

### What each sub-object renders publicly

| `communityData` field | Public section on `/communities/[id]` |
|---|---|
| `homePlans[]` | **Home Plans** grid (image, name, price, bed/bath/sqft/stories/garage, "View floor plan" link, optional "Model Home" badge) |
| `amenities[]` | **Amenities** bulleted grid |
| `schools` (district + list) | **Schools** list (name, grades, address, phone, website) |
| `taxInfo` (entities + total) | **Tax Info** table + total |
| `salesOffice` (address/hours/phone/specialistName/directions/lat,lng) | **Visit the Community** + sidebar Address + phone (tel: link) + specialist name + "Get Directions" (Google Maps `dir` link) |
| `status` | Sidebar badge — `coming-soon` (orange) or `close-out` (red) |
| `adultOnly` | Sidebar "Adult Only" badge (plum) |
| `priceFrom` / `sqftRange` | Sidebar Price / Sq. Ft. fallback when numeric range is absent |

### Deriving `status`

If the source exposes an availability/lifecycle string, derive the badge:

- contains "coming soon" → `'coming-soon'`
- contains "final opportunit" / "close out" / "close-out" / "closing soon" → `'close-out'`
- otherwise `null` (no badge)

## 9. Cron route — `app/api/cron/scrape-<builder>-communities/route.ts`

Mirror the move-in cron route (`app/api/cron/scrape-mi-homes/route.ts` Pass 2
is the reference). Same shape: auth → fetch rows → upsert each → prune stale
→ return summary JSON. Differences for communities:

- `homeType: 'community'` on every upsert (not `'showcase'`).
- Pass `communityData: row.communityData` into `upsertBuilderInventoryByExternalId`.
- The prune call filters by `homeType: 'community'` and the community
  `externalId` set.
- Community detail enrichment (home plans, schools, tax, sales office) often
  requires one extra fetch **per community** to the builder's community detail
  page. Budget `maxDuration` accordingly (e.g. M/I uses 150s for ~11
  communities + inventory).

```ts
const result = await upsertBuilderInventoryByExternalId({
  externalId: row.externalId,
  kind: 'listing',
  publication: 'realtyline',            // or 'newsline' (San Antonio)
  submittedByName: SCRAPER_SUBMITTER_NAME,
  submittedByEmail: SCRAPER_SUBMITTER_EMAIL,
  builderName: row.builderName,
  title: row.title,
  city: row.city,
  state: row.state,
  description: row.description,
  bedsMin: row.bedsMin, bedsMax: row.bedsMax,
  bathsMin: row.bathsMin, bathsMax: row.bathsMax,
  sqftMin: row.sqftMin, sqftMax: row.sqftMax,
  priceMin: row.priceMin, priceMax: row.priceMax,
  thumbnailUrl: row.thumbnailUrl,
  flyerPdfUrl: row.flyerPdfUrl,
  sourceUrl: row.sourceUrl,
  galleryUrls: row.galleryUrls,
  communityName: row.communityName,
  homeType: 'community',
  communityData: row.communityData,     // ← structured detail
});
```

### `UpsertScrapedInput` (the full field set the upsert accepts)

`externalId, kind, publication, submittedByName, submittedByEmail, builderName,
title, city, state, description, bedsMin/Max, bathsMin/Max, sqftMin/Max,
priceMin/Max, flyerPdfUrl, thumbnailUrl, address?, readyDate?, planName?,
communityName?, promoType?, startsAt?, expiresAt?, sourceUrl?, homeType?,
galleryUrls?, communityData?, extraDetails?`.

Note: for community rows you usually leave `address`, `readyDate`, `planName`
null (those are per-home fields). The community's address lives in
`communityData.salesOffice.address`.

## 10. Build / test / deploy / verify checklist

1. **Type check** (cache-busted — incremental cache gives false passes): delete
   `*.tsbuildinfo`, then
   `NODE_OPTIONS="--max-old-space-size=4096" npx tsc --noEmit --incremental false`.
   Only acceptable error: the lone `node_modules/@types/node/tls.d.ts` TS1010
   artifact.
2. **Lint:** `npx eslint --max-warnings=0 lib/scrapers/<builder>-communities.ts
   app/api/cron/scrape-<builder>-communities/route.ts` (Husky pre-commit
   enforces 0 warnings).
3. **Commit + push to main.**
4. **Deploy explicitly** — the Vercel auto-deploy webhook does NOT fire on push:
   `npx vercel --prod --token "$VERCEL_TOKEN" --yes`.
5. **Run the scrape** (production needs the bearer):
   `curl -H "Authorization: Bearer $CRON_SECRET"
   https://realtynewsnow.app/api/cron/scrape-<builder>-communities`.
6. **Verify** the structured data landed. The public `/api/inventory` endpoint
   filters OUT `homeType='community'` rows, so verify via the cron summary JSON
   (`inserted`/`updated`/`communityData` populated) and by spot-checking
   `realtynewsnow.app/communities/<id>` (signed in) — confirm Home Plans,
   Amenities, Schools, Tax Info, and the Sales Office / directions render.
7. Add the cron schedule to `vercel.json` `crons[]` (stagger off existing
   builder slots).

## 11. Pitfalls (lessons learned this codebase)

- **`communityData` must round-trip as JSON.** Store it as the typed object;
  `upsertBuilderInventoryByExternalId` serializes it. If you pass a string, the
  public page's `parseCommunityData` will still accept it, but prefer the
  object so types hold.
- **`status` is a constrained union** — `'coming-soon' | 'close-out' | null`.
  Don't freehand other strings; derive via the helper (§8).
- **School grades often live inside the school name** (e.g.
  `"Rooster Springs Elementary (PK-5)"`). Split them: name →
  `Rooster Springs Elementary`, grades → `PK-5`.
- **Tax rates are display strings**, not numbers ("1.04%", "1.85%"). Keep them
  as strings; the UI prints them verbatim.
- **Never remove the `rows.length > 0` prune guard.** A transient empty scrape
  must not deactivate every community.
- **Don't hide a community via `status='expired'`** — use the Advertiser Pages
  visibility toggle (`builder_page_visibility`) instead.
- **`homeType='community'` is required** for the public communities route and for
  the prune filter. A community row with the wrong `homeType` will never render
  and never prune correctly.
- **Plan API rate limiting.** Some builders (e.g. Drees) rate-limit the plan
  endpoint after ~20 rapid requests, causing 429/403 on later batches. Add
  retry-once-with-3s-backoff to the plan fetch, and a 500ms delay between
  batches. Watch for this if the last batch of communities has 0 plans while
  earlier batches populated correctly.
- **Plan images may require per-plan detail page fetches.** The plan API
  endpoint often returns `images: null` (Drees, M/I). To populate
  `homePlans[].imageUrl`, fetch each plan's own detail page and extract the
  first exterior photo from the embedded JSON gallery. Batch at
  CONCURRENCY=5; budget ~2s per plan. Exterior photos always appear first in
  the gallery JSON and always resolve — prefer them over elevation render
  URLs, which can 404 on the CDN.
- **Watch for 0-as-sentinel on low/high ranges.** Some builders use 0 as a
  "not applicable" value on the high side (e.g. `bedLow=5, bedHigh=0` means a
  fixed 5 beds, not a 5-0 range). Treat a zero bound as absent when the other
  bound is positive to avoid rendering broken ranges like "5 - 0 bed".
- **Sitemap-based community discovery.** KB Home uses `sitemap.xml` with a
  regex like `/new-homes-austin/[a-z0-9-]+` to find all community URLs.
  Community pages contain `dataLayer.page` vars (community ID, name, city,
  state, status) + embedded `FloorPlanList` JSON array (plans with price,
  beds, baths, sqft, stories, garages, thumbnails) + `LocalQMIs` JSON array
  (sales office info, community highlights). Use `dataLayer.page['community ID']`
  as the `externalId` (stable across URL changes).
- **`og:image` URL sanitization.** Some builders prepend the community path
  segment before `/globalassets/` in `og:image` URLs, causing 404s. Strip
  the community path segment to fix: `kbhome.com/new-homes-austin/{slug}/globalassets/`
  → `kbhome.com/globalassets/`.
