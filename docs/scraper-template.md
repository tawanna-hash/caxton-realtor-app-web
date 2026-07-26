# Builder / Developer Move-In Scraper — Template & Guide

Reference spec for building a new **move-in-ready inventory scraper**.
Use **M/I Homes** as the gold-standard field reference — its scraper
(`lib/scrapers/mi-homes.ts`) captures every field the public
`/inventory/[id]` page renders. Live example: listing
[199](https://realtynewsnow.app/inventory/199) — "San Gabriel - C at Barksdale".

---

## 1. What a move-in scraper produces

**One row per buyable home** (not per community), with `homeType: 'showcase'`,
`kind: 'listing'`. Each row has a specific address, ready date, plan name, and
exact price. Communities are a **separate** scraper pass
(`homeType: 'community'`) — do not mix them into the inventory rows.

Two files to create for every new builder:

| File | Purpose |
|------|---------|
| `lib/scrapers/<builder>.ts` | Fetch + normalize the source → `Scraped<Builder>Row[]`. Pure data layer, no DB writes. |
| `app/api/cron/scrape-<builder>/route.ts` | Cron endpoint: call the scraper, upsert each row, prune stale rows. |

---

## 2. Required output row shape

Model the scraper's exported row type on this. Every field below appears on the
public `/inventory/[id]` page; populate as many as the source offers.

```ts
export type ScrapedBuilderRow = {
  externalId: string;            // STABLE unique id from the source (see §4)
  builderName: string;           // EXACT, case-sensitive — must match builderName on every row
  title: string;                 // "PlanName at CommunityName" (see §5)
  city: string;                  // "Leander"
  state: string;                 // "TX" (2-letter; see stateToAbbrev)
  description: string | null;    // marketing copy, ideally from detail page (see §6)
  bedsMin: number | null;        // store min=max for a single home
  bedsMax: number | null;
  bathsMin: number | null;       // can be 2.5; NUMERIC(3,1)
  bathsMax: number | null;
  sqftMin: number | null;        // parse "1,640" → 1640 (strip commas)
  sqftMax: number | null;
  priceMin: number | null;       // list price in whole dollars
  priceMax: number | null;
  thumbnailUrl: string | null;   // single hero image
  flyerPdfUrl: string | null;    // per-listing PDF if the source has one
  sourceUrl: string | null;      // canonical detail-page URL (see §7)
  galleryUrls: string[] | null;  // photo gallery (see §7)
  extraDetails: Record<string, string> | null; // structured key/value (see §8)
  address: string | null;        // "3721 Plentywood Lane, Leander, TX 78641"
  readyDate: string | null;       // "YYYY-MM-DD" only (see dateOnly)
  planName: string | null;       // "San Gabriel - C"
  communityName: string | null;  // "Barksdale"
  homeType: 'showcase';          // always 'showcase' for move-in inventory
};
```

### Worked example — M/I Homes listing 199 (rendered on the public site)

| Field | Value |
|-------|-------|
| `externalId` | Sitecore item id |
| `builderName` | `M/I Homes` |
| `title` | `San Gabriel - C at Barksdale` |
| `city` / `state` | `Leander` / `TX` |
| `description` | "Step inside this expansive…" (full marketing paragraph, scraped from the detail page) |
| `bedsMin`/`bedsMax` | `4` / `4` |
| `bathsMin`/`bathsMax` | `5` / `5` |
| `sqftMin`/`sqftMax` | `3714` / `3714` |
| `priceMin`/`priceMax` | `769990` / `769990` |
| `thumbnailUrl` | `https://cdn.mihomes.com/…/4994805-50035` |
| `sourceUrl` | `https://www.mihomes.com/new-homes/texas/greater-austin/leander/barksdale/san-gabriel-plan/3721-plentywood-lane` |
| `galleryUrls` | 24 `cdn.mihomes.com` photo URLs |
| `address` | `3721 Plentywood Lane, Leander, TX 78641` |
| `readyDate` | `2026-09-11` |
| `planName` | `San Gabriel - C` |
| `communityName` | `Barksdale` |
| `homeType` | `showcase` |
| `extraDetails` | see §8 |

---

## 3. Field reference (source → output)

| Output field | Where it usually comes from | Notes / gotchas |
|--------------|------------------------------|-----------------|
| `externalId` | Source's stable item/lot id | Must be unique + stable across runs (drives upsert + prune). Avoid array index. |
| `builderName` | Hardcoded constant | **Exact, case-sensitive.** Public `/api/inventory?builder=` matches `builder_name` exactly. |
| `title` | `${planName} at ${communityName}` | See §5 for fallback ladder. |
| `city` / `state` | Listing API / detail page | `state` always 2-letter; use a `stateToAbbrev` helper. |
| `description` | Detail-page marketing copy | Best source; if absent, **synthesize** (§6). Never `null` if avoidable. |
| `beds/baths/sqft/price` | Listing API (scalars) | `null` if unknown. Strip comma-strings. Store min=max for one home. Price = whole dollars. |
| `thumbnailUrl` | Listing API `image` | Absolute URL; `normalizeUrl` if path-only. |
| `sourceUrl` | Detail-page URL | The public "Builder Site" button links here. §7. |
| `galleryUrls` | Detail-page `data-image` srcsets | Pick the largest variant. Limit ~30. §7. |
| `flyerPdfUrl` | Detail page link | Often `null` for move-in; keep the field. |
| `address` | `street + city, state zip` | Assemble with a `fullAddress` helper; needs at least a street. Frontend renders `address` if set, else falls back to `city, state`. |
| `readyDate` | ISO from source → `YYYY-MM-DD` | Use `dateOnly`; reject malformed. Renders as "Move-in" in the stats grid. |
| `planName` | `displayname` / `plan` | May include elevation letter ("San Gabriel - C"). Renders as "Plan" in the stats grid. |
| `communityName` | Friendly community name | For UI grouping; not the slug. |
| `extraDetails` | Detail-page `<dl>` "Additional Details" | JSONB; free-form keys per builder. §8. |
| `homeType` | Constant | `'showcase'` for move-in inventory. |

### Garage parsing from description

The frontend parses "X-car garage" from the `description` field at render
time and surfaces it in the stats grid as "Garage". If your source data
includes garage count, include the phrase "2-car garage" (or similar) in
the description text so it appears in the stats. There is no dedicated
`garage` field — it is extracted via regex: `/((\d+)-car garage/i`.

---

## 4. `externalId` — stability rules

- Pick the source's **durable** id (DB/Sitecore item id, MLS#, lot id).
- Never use an array index or a display string that can change.
- If the primary id is missing, build a deterministic fallback
  (M/I uses `jde/${JdeLotId}`).
- Same home across runs **must** produce the same `externalId`, or you'll
  create duplicates and the prune pass will deactivate the wrong rows.

---

## 5. Title fallback ladder

```ts
let title: string;
if (planName && communityName) title = `${planName} at ${communityName}`;
else if (planName) title = planName;
else if (communityName) title = `Inventory home at ${communityName}`;
else if (street) title = street;
else title = '<Builder> inventory home';
```

---

## 6. Description — prefer detail page, else synthesize

**Best:** scrape the marketing paragraph from each home's detail page (M/I does
this — the copy starting "Step inside…" through the `<!-- and done -->` marker).

**Fallback (when the source has no marketing text):** synthesize a clean,
single-paragraph description from the structured fields. Pattern fixed this
session — keep it consistent across builders:

```
<planName> at <communityName>. <beds> bedrooms, <baths> bathrooms, <sqft> sq ft,
from $<price>. Ready <readyDate>. Located at <address>.
```

Rules learned the hard way:
- Define `const readyDate = dateOnly(...)` and `const address = fullAddress(...)`
  **before** the description block that references them (hoisting matters —
  a stray inline reference broke the Vercel build with "Cannot find name").
- Do **not** double city/state (e.g. "Austin, TX, Austin, TX").
- Add a period between the lead sentence and the specs run.
- `description: null` in the row is acceptable only if synthesis is impossible.

---

## 7. `sourceUrl` + `galleryUrls` enrichment

Both usually require a **per-home detail-page fetch** because listing APIs rarely
include the gallery or the canonical URL.

### Two-phase scraping pattern

Some builders (KB Home, David Weekley) embed a JSON array on community pages
containing all move-in-ready homes. Use this as Phase 1 for base data, then
fetch each home's detail page in Phase 2 for enrichment:

- **Phase 1** — Community page: extract embedded JSON (e.g. `LocalQMIs`,
  `window.pageData`) for base data: price, beds, baths, sqft, gallery photos,
  MLS#, description fragments, community info.
- **Phase 2** — Per-home detail page: fetch each `?homesite={id}` or equivalent
  URL for enrichment: interactive floor plan URL (e.g. kb-vu.com iframe),
  amenities pictograms with labels, Zillow virtual tour links, additional
  photos not in Phase 1.

Non-fatal enrichment: a Phase 2 fetch failure should not kill the row —
fall back to Phase 1 data only and still upsert.

### URL normalization

```ts
function normalizeUrl(path: string | null): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  if (path.startsWith('/')) return BASE_URL + path;
  return null;
}
```

- **`sourceUrl`** — the detail page URL (absolutized). Powers the public
  "Builder Site" button on `/inventory/[id]`.
- **`galleryUrls`** — photos from the detail HTML. M/I reads `data-image`
  srcsets (`URL 300w,URL 600w,…,URL 1800w`) and picks the `1800w` variant.
  Cap at ~30 (`MI_DETAIL_GALLERY_LIMIT`).
- Fetch with a realistic `User-Agent` + headers and a 30s `AbortSignal.timeout`.
- Detail enrichment is **best-effort**: a fetch failure should not kill the row —
  fall back to `null` gallery / synthesized description and still upsert.

---

## 8. `extraDetails` — structured key/value

JSONB column. Surface whatever structured specs the builder publishes that don't
fit the core columns (county, school district, MLS#, foundation, owner's suite,
homesite, lot dimensions, floorplan URL, lat/lng). Keys are free-form per
builder; the UI renders whatever is present.

M/I Homes listing 199 example:

```json
{
  "City": "Leander, TX",
  "County": "Williamson",
  "Homesite": "1106",
  "Home Plan": "San Gabriel",
  "Home Type": "Single Family Home",
  "MLS Number": "2244257",
  "Owner's Suite": "First Floor",
  "Foundation Type": "Slab",
  "School District": "Leander ISD",
  "Base Plan Width & Depth": "49.11 x 61.55",
  "_latitude": "30.566917",
  "_longitude": "-97.783389",
  "_floorplanUrl": "https://rifp.ml3ds-icon.com/#/floorplan/206628?floorId=279841"
}
```

Convention: prefix internal/derived keys with `_` (e.g. `_latitude`,
`_floorplanUrl`) so the UI can style or hide them.

### Special `_-prefixed` keys that render public sections

Three `_-prefixed` `extraDetails` keys drive dedicated sections on the public
`/inventory/[id]` page (below the main gallery + sidebar). Populate them from
the builder's detail page / listing API when available — they're what make a
listing feel "complete" (e.g. listing [909](https://realtynewsnow.app/inventory/909)).

| Key | Renders | Notes |
|-----|---------|-------|
| `_latitude` + `_longitude` | **Location** — Google Maps embed + "Get directions" link | Renders only when BOTH are set. Store as strings. |
| `_floorplanUrl` | **Floorplan** section | Image URL → zoomable `FloorplanViewer`; `ml3ds-icon.com` and `kb-vu.com` URLs → interactive `<iframe>`. **Must** be stored as `_floorplanUrl`, not a plain key like `'Floor Plan'` — the frontend only reads the `_-prefixed` key. The cron route is responsible for this mapping. |
| `_virtualTourUrl` | **3D Tour** iframe | Optional; renders only when set. |

Also: non-`_` `extraDetails` keys render in the **Property details** grid
(county, school district, MLS#, foundation, owner's suite, …).

---

## 9. Cron route — `app/api/cron/scrape-<builder>/route.ts`

Boilerplate (copy from `scrape-mi-homes`). It does: auth → fetch rows →
upsert each → prune stale → return a summary JSON.

### Cron route responsibility: map `_-prefixed` meta keys

The scraper's row type may carry `floorPlanUrl` or virtual tour URLs as
regular fields. The **cron route** must map these into `_-prefixed`
`extraDetails` keys that the frontend reads:

```ts
// In the cron route's upsert loop:
const { 'Virtual Tour': vtUrl, ...restDetails } = row.extraDetails ?? {};
const enrichedDetails: Record<string, string> = {
  ...restDetails,
  ...(row.floorPlanUrl ? { _floorplanUrl: row.floorPlanUrl } : {}),
  ...(vtUrl ? { _virtualTourUrl: vtUrl } : {}),
};
// Pass enrichedDetails (not row.extraDetails) to upsertBuilderInventoryByExternalId
```

If you store the floor plan URL as a plain key like `'Floor Plan'`, it will
only appear as text in the "Property details" grid — the interactive
Floorplan / 3D Tour sections will not render. This was the KB Home bug.

```ts
import { NextRequest, NextResponse } from 'next/server';
import { fetchBuilderRows } from '@/lib/scrapers/<builder>';
import { upsertBuilderInventoryByExternalId } from '@/lib/builder-inventory';
import { deactivateStaleBuilderInventory } from '@/lib/builder-inventory-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Scale to your volume: inventory + detail enrichment + prune.
export const maxDuration = 150;

const SUBMITTER_NAME = '<Builder> Auto-Importer';
const SUBMITTER_EMAIL = 'scraper-<builder>@harmonyone.system';

function verifyCronAuth(req: NextRequest) {
  if (process.env.VERCEL_ENV !== 'production') return { ok: true };
  const expected = process.env.CRON_SECRET;
  const got = req.headers.get('authorization');
  if (!expected) return { ok: false, reason: 'CRON_SECRET not configured' };
  if (got !== `Bearer ${expected}`) return { ok: false, reason: 'Bad Authorization header' };
  return { ok: true };
}

async function runScrape() {
  const { rows } = await fetchBuilderRows();
  let inserted = 0, updated = 0, errors = 0;

  for (const row of rows) {
    try {
      const result = await upsertBuilderInventoryByExternalId({
        externalId: row.externalId,
        kind: 'listing',
        publication: 'realtyline',          // 'realtyline' | 'newsline' | 'both'
        submittedByName: SUBMITTER_NAME,
        submittedByEmail: SUBMITTER_EMAIL,
        builderName: row.builderName,
        title: row.title,
        city: row.city,
        state: row.state,
        description: row.description,
        bedsMin: row.bedsMin, bedsMax: row.bedsMax,
        bathsMin: row.bathsMin, bathsMax: row.bathsMax,
        sqftMin: row.sqftMin, sqftMax: row.sqftMax,
        priceMin: row.priceMin, priceMax: row.priceMax,
        flyerPdfUrl: row.flyerPdfUrl,
        sourceUrl: row.sourceUrl,
        galleryUrls: row.galleryUrls,
        extraDetails: row.extraDetails,
        thumbnailUrl: row.thumbnailUrl,
        address: row.address,
        readyDate: row.readyDate,
        planName: row.planName,
        communityName: row.communityName,
        homeType: row.homeType,
      });
      result.created ? inserted++ : updated++;
    } catch (err) {
      errors++;
      console.error(`[scrape-<builder>] upsert failed "${row.title}":`, err);
    }
  }

  // Prune: deactivate homes no longer in the source feed (sold/off-market).
  // GUARDED — never run on an empty scrape so a transient empty response
  // can't wipe the whole set.
  let deactivated = 0;
  if (rows.length > 0) {
    deactivated = await deactivateStaleBuilderInventory({
      builderName: '<Builder>',
      homeType: 'showcase',
      activeExternalIds: rows.map((r) => r.externalId),
    });
  }

  return { ok: true, summary: { rawCount: rows.length, inserted, updated, deactivated, errors } };
}

export async function GET(req: NextRequest) {
  const auth = verifyCronAuth(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.reason }, { status: 401 });
  try { return NextResponse.json(await runScrape()); }
  catch (err) { return NextResponse.json({ ok: false, error: String(err) }, { status: 500 }); }
}
export async function POST(req: NextRequest) { return GET(req); }
```

### `UpsertScrapedInput` (the full field set the upsert accepts)

Defined in `lib/builder-inventory.ts`. Pass every field you have — `null` for
absent ones. The upsert **updates** `title/city/desc/ranges/sourceUrl/gallery/
extraDetails/address/readyDate/plan/community` on existing rows (so re-runs
backfill missing fields), and **never** touches `status/featured/reviewedBy/
reviewedAt` (admin-only fields) or `hidden`/visibility.

```ts
type UpsertScrapedInput = {
  externalId, kind, publication, submittedByName, submittedByEmail, builderName,
  title, city, state, description,
  bedsMin, bedsMax, bathsMin, bathsMax, sqftMin, sqftMax, priceMin, priceMax,
  flyerPdfUrl, thumbnailUrl,
  address?, readyDate?, planName?, communityName?,
  promoType?, startsAt?, expiresAt?,         // promotions only
  sourceUrl?, homeType?, galleryUrls?,
  communityData?,                            // community rows only
  extraDetails?,
};
```

---

## 10. Build / test / deploy / verify checklist

1. **Type check (cache-busted — incremental cache gives false passes):**
   ```bash
   find . -path ./node_modules -prune -o -name '*.tsbuildinfo' -print | xargs rm -f
   NODE_OPTIONS="--max-old-space-size=4096" npx tsc --noEmit --incremental false
   ```
   Only acceptable error: the lone `node_modules/@types/node/tls.d.ts` TS1010 artifact.
2. **Lint (Husky pre-commit runs `--max-warnings=0`):**
   ```bash
   npx eslint --max-warnings=0 lib/scrapers/<builder>.ts app/api/cron/scrape-<builder>/route.ts
   ```
3. **Commit + push to `main`.**
4. **Deploy explicitly** (the Vercel auto-deploy webhook does **not** fire on push):
   ```bash
   npx vercel --prod --token "$VERCEL_TOKEN" --yes
   # poll alias (CLI may drop "invalid or expired session token" — that's noise):
   npx vercel inspect realtynewsnow.app --token "$VERCEL_TOKEN" | grep -i status
   ```
5. **Run the scrape** (production needs the cron bearer):
   ```bash
   curl -s -H "Authorization: Bearer $CRON_SECRET" \
     "https://realtynewsnow.app/api/cron/scrape-<builder>" | head -c 500
   ```
6. **Verify the data landed** (builder name must be URL-encoded + exact match):
   ```bash
   curl -s "https://realtynewsnow.app/api/inventory?pub=all&builder=<URL+ENCODED>&limit=5"
   ```
   Confirm `description`, `sourceUrl`, `galleryUrls`, `extraDetails`, `address`,
   `readyDate`, `planName`, `communityName` are populated — not `null`/empty.
7. Spot-check one listing on the public site: `https://realtynewsnow.app/inventory/<id>`.

---

## 11. Pitfalls (lessons learned this codebase)

- **`builderName` must match exactly, case-sensitively** across every row and
  the cron `deactivateStaleBuilderInventory({ builderName })` call, or pruning +
  public filtering silently miss.
- **Cloudflare-protected sites** (MI Homes, KB Home, Newmark, Santa Rita Ranch)
  often block the scraper. If the source 403s, that's a fetch problem, not a
  data problem — document it and don't chase content gaps that don't exist.
- **`maxDuration`** must cover inventory upserts + per-home detail enrichment
  (M/I: ~93 homes × 1 detail fetch). Vercel default is too low.
- **Prune is guarded** by `rows.length > 0`. Never remove that guard — a
  transient empty feed would otherwise deactivate every row.
- **Visibility is separate.** A builder whose public pages are disabled
  (`builder_page_visibility.public_enabled=false`) is hidden from public queries
  automatically — the scraper keeps writing rows normally; visibility is
  display-only. Don't try to hide a builder by setting `status='expired'`.
- **`next build` OOMs in the sandbox** (`Bus error`, exit 135). Don't use a local
  build to verify types — use the cache-busted `tsc` above, then deploy.
