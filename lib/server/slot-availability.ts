// lib/server/slot-availability.ts
//
// Reads live ad_campaigns rows to determine which publication scopes are
// currently SOLD on a given slot and therefore must be blocked in the
// public checkout UI + API.
//
// Phase 3 (2026-06-17): multi-market checkout. Each campaign row stores
// its booked markets in the `pubs` TEXT[] column (canonical) plus a
// back-compat `publication` string. A booking blocks every market listed
// in `pubs` independently. The legacy publication='both' value continues
// to be honored on historical rows by mapping it to ['realtyline','newsline'].
//
// Rules
// -----
//   1. Each entry in a campaign's `pubs` array blocks exactly that single
//      market for the campaign's date window. No more cross-market blocking
//      via the legacy 'both' enum -- a 2-market booking writes
//      pubs=['realtyline','newsline'] which independently blocks each.
//   2. For back-compat with rows that pre-date the pubs column, we derive
//      pubs from the legacy publication string (see legacyPubsFor()).
//   3. Date overlap is computed against the requested window. If none is
//      supplied, "today through 5 years out" is used so the public form
//      shows the slot as blocked while any future campaign is live.
//   4. House ads (advertiser_name = HOUSE_AD_ADVERTISER) are excluded so
//      unsold inventory rendered by house creatives never blocks a real
//      booking inquiry.

import { getSql } from '@/lib/db';
import {
  APP_AD_SLOTS,
  getSlotAvailablePubs,
  ROTATION_CAPACITY,
  type AppAdSlot,
} from '@/lib/media-kit';

/**
 * A single bookable market. The legacy 'both' value is intentionally NOT
 * part of this type -- multi-market bookings are now represented as a
 * collection of single-market entries.
 */
export type CheckoutPub =
  | 'realtyline'
  | 'newsline'
  | 'realtyline-houston'
  | 'realtyline-dallas';

// House ads (advertiser_name = HOUSE_AD_ADVERTISER) exist to fill unsold
// inventory -- they should never block a real booking inquiry. We exclude
// them from every blocking-availability query so the public checkout, the
// inquire route's sold-out probe, and pickAlternativeSlots all treat
// house-ad-only slots as available. When a real advertiser books, the
// admin deactivates the house campaign from /admin/ads.
const HOUSE_AD_ADVERTISER = 'RealtyLine House';

interface ActiveCampaignRow {
  ad_space_slug: string;
  publication: string;
  pubs: string[] | null;
  start_date: string;
  end_date: string;
}

/**
 * Normalize a single market identifier into the canonical CheckoutPub
 * enum. Returns null for unrecognized values (defensive).
 */
function normalizeSinglePub(raw: string): CheckoutPub | null {
  const v = (raw || '').toLowerCase().trim();
  if (v === 'realtyline' || v === 'austin') return 'realtyline';
  if (v === 'newsline' || v === 'san_antonio' || v === 'sa') return 'newsline';
  if (v === 'realtyline-houston' || v === 'houston') return 'realtyline-houston';
  if (v === 'realtyline-dallas' || v === 'dallas') return 'realtyline-dallas';
  return null;
}

/**
 * Map the legacy publication enum to the canonical pubs[] representation.
 * Used as a fallback for historical rows whose `pubs` column is empty.
 *   'both'        -> ['realtyline', 'newsline']
 *   'austin'      -> ['realtyline']
 *   'san_antonio' -> ['newsline']
 *   etc.
 */
function legacyPubsFor(publication: string): CheckoutPub[] {
  const v = (publication || '').toLowerCase().trim();
  if (v === 'both') return ['realtyline', 'newsline'];
  const single = normalizeSinglePub(v);
  return single ? [single] : [];
}

/**
 * Extract the canonical CheckoutPub[] from an ad_campaigns row. Prefers
 * the `pubs` array if populated; falls back to deriving from the legacy
 * `publication` string.
 */
function pubsFromRow(row: ActiveCampaignRow): CheckoutPub[] {
  if (row.pubs && row.pubs.length > 0) {
    const out: CheckoutPub[] = [];
    for (const p of row.pubs) {
      const normalized = normalizeSinglePub(p);
      if (normalized && !out.includes(normalized)) out.push(normalized);
    }
    if (out.length > 0) return out;
  }
  return legacyPubsFor(row.publication);
}

/**
 * Compute the default availability window: today -> +5y. Intentionally wide
 * so the checkout form treats any live or upcoming campaign as taken on
 * first paint. Once the buyer narrows dates, the API recomputes.
 */
function defaultWindow(startDate?: string, endDate?: string): { start: string; end: string } {
  const today = new Date().toISOString().slice(0, 10);
  const farFuture = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 5);
    return d.toISOString().slice(0, 10);
  })();
  return { start: startDate || today, end: endDate || farFuture };
}

// Per-slug booking capacity per publication. Rotating slots run several
// concurrent advertisers, so they only sell out once ROTATION_CAPACITY
// bookings overlap a pub; every other slot has capacity 1.
const SLOT_CAPACITY = new Map<string, number>(
  APP_AD_SLOTS.map((s) => [s.slug, s.rotates ? ROTATION_CAPACITY : 1]),
);

function capacityForSlug(slug: string): number {
  return SLOT_CAPACITY.get(slug) ?? 1;
}

/**
 * Count overlapping bookings per checkout scope for a set of rows already
 * filtered to a single slot. Pure / no I/O.
 */
function rowsToCounts(rows: ActiveCampaignRow[]): Map<CheckoutPub, number> {
  const counts = new Map<CheckoutPub, number>();
  for (const r of rows) {
    for (const p of pubsFromRow(r)) {
      counts.set(p, (counts.get(p) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Reduce campaign rows (already filtered to a single slot) into the set of
 * checkout scopes that are blocked. A scope is blocked only once the number
 * of overlapping bookings on that pub reaches the slot's `capacity`, so
 * rotating slots aren't marked sold out by a single booking. Pure / no I/O.
 */
function rowsToBlockedSet(
  rows: ActiveCampaignRow[],
  capacity: number,
): Set<CheckoutPub> {
  const blocked = new Set<CheckoutPub>();
  for (const [p, n] of rowsToCounts(rows)) {
    if (n >= capacity) blocked.add(p);
  }
  return blocked;
}

// Single-pub scopes that count toward public sell-through. Only LAUNCHED
// markets — Houston and Dallas/FTW are pre-launch and can't be booked, so a
// slot's placement-level availability is judged solely on RealtyLine +
// Newsline. Mirrors the BOOKABLE_PUBS list the public /advertise/digital page
// used before this logic was centralized here.
const BOOKABLE_PUBS: readonly CheckoutPub[] = ['realtyline', 'newsline'];

/**
 * Placement-level inventory for a rotating/standard slot, judged across the
 * slot's bookable publications. `capacity` is the per-publication capacity
 * (ROTATION_CAPACITY for rotating slots, 1 otherwise). `available` is the
 * best-case open count across bookable pubs, so a placement is sold out only
 * when every bookable pub is full — identical to the existing sold-out rule.
 */
export interface SlotInventory {
  capacity: number;
  sold: number;
  available: number;
  soldOut: boolean;
}

/**
 * Collapse per-pub counts for one slot into placement-level inventory using
 * the slot's bookable pubs and per-pub capacity. Pure / no I/O.
 */
function countsToInventory(
  bookablePubs: readonly CheckoutPub[],
  counts: Map<CheckoutPub, number>,
  capacity: number,
): SlotInventory {
  if (bookablePubs.length === 0) {
    return { capacity, sold: capacity, available: 0, soldOut: true };
  }
  let bestOpen = 0;
  for (const p of bookablePubs) {
    const open = Math.max(0, capacity - (counts.get(p) ?? 0));
    if (open > bestOpen) bestOpen = open;
  }
  return {
    capacity,
    available: bestOpen,
    sold: capacity - bestOpen,
    soldOut: bestOpen === 0,
  };
}

/**
 * Batch helper -- returns the blocked-pub Set for EVERY known slot in
 * `APP_AD_SLOTS` using a single SQL query. This is the preferred entry
 * point for pages that need to render availability for many slots at
 * once (e.g. /advertise/digital, pickAlternativeSlots).
 *
 * Slots with no overlapping campaign are still present in the returned
 * Map with an empty Set, so callers can `.get(slug)` without null-checks.
 *
 * Fails open: on DB error, returns a Map of empty Sets for every slot so
 * the UI does not brick.
 */
async function getBookedPubsForAllSlots(
  startDate?: string,
  endDate?: string,
): Promise<Map<string, Set<CheckoutPub>>> {
  // Pre-seed every known slot with an empty Set so callers always get a
  // value back even when no campaign touches that slug.
  const result = new Map<string, Set<CheckoutPub>>();
  for (const s of APP_AD_SLOTS) {
    result.set(s.slug, new Set<CheckoutPub>());
  }

  const bySlug = await fetchReservingRowsBySlug(startDate, endDate);
  if (!bySlug) return result; // fail-open: all empty Sets

  for (const [slug, slugRows] of bySlug) {
    // If a campaign references an unknown slug, surface it anyway so
    // future callers can still query for it.
    result.set(slug, rowsToBlockedSet(slugRows, capacityForSlug(slug)));
  }

  return result;
}

/**
 * Batch helper -- placement-level inventory (capacity / sold / available /
 * soldOut) for EVERY known slot, using the SAME reserving query, capacity map,
 * bookable-pub set, and date window as the sold-out logic. This is what the
 * public /advertise/digital rate card renders as "N available · M sold".
 *
 * Fails open: on DB error, returns full-availability inventory for every slot.
 */
export async function getSlotInventoryForAllSlots(
  startDate?: string,
  endDate?: string,
): Promise<Map<string, SlotInventory>> {
  const bySlug = await fetchReservingRowsBySlug(startDate, endDate);

  const result = new Map<string, SlotInventory>();
  for (const s of APP_AD_SLOTS) {
    const capacity = capacityForSlug(s.slug);
    const bookable = (getSlotAvailablePubs(s) as readonly string[]).filter(
      (p): p is CheckoutPub =>
        (BOOKABLE_PUBS as readonly string[]).includes(p),
    );
    const counts = bySlug
      ? rowsToCounts(bySlug.get(s.slug) ?? [])
      : new Map<CheckoutPub, number>();
    result.set(s.slug, countsToInventory(bookable, counts, capacity));
  }
  return result;
}

/**
 * Shared fetch for the availability + inventory batch helpers. Runs a single
 * query for every campaign that RESERVES inventory (live `active=TRUE` OR paid
 * `approval_status='pending'`), excluding house ads, overlapping the window,
 * and groups the rows by slot slug. Returns null on DB error so callers can
 * fail open.
 */
async function fetchReservingRowsBySlug(
  startDate?: string,
  endDate?: string,
): Promise<Map<string, ActiveCampaignRow[]> | null> {
  const { start, end } = defaultWindow(startDate, endDate);

  let rows: ActiveCampaignRow[] = [];
  try {
    const sql = getSql();
    const r = (await sql`
      SELECT ad_space_slug,
             publication,
             pubs,
             start_date::text AS start_date,
             end_date::text   AS end_date
        FROM ad_campaigns
       WHERE (active = TRUE OR approval_status = 'pending')
         AND advertiser_name <> ${HOUSE_AD_ADVERTISER}
         AND start_date <= ${end}::date
         AND end_date   >= ${start}::date
    `) as unknown as ActiveCampaignRow[];
    rows = Array.isArray(r) ? r : [];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[slot-availability] batch fail-open: ${msg}`);
    return null;
  }

  const bySlug = new Map<string, ActiveCampaignRow[]>();
  for (const r of rows) {
    const slug = r.ad_space_slug;
    if (!slug) continue;
    const list = bySlug.get(slug);
    if (list) list.push(r);
    else bySlug.set(slug, [r]);
  }
  return bySlug;
}

/**
 * For a given slot, return the set of checkout scopes that are CURRENTLY
 * blocked because at least one active campaign overlaps the window.
 *
 * Fails open: if the DB is unreachable (e.g. sandbox build with no
 * DATABASE_URL) the function logs and returns an empty Set so the UI
 * stays usable rather than blocking everything.
 *
 * @param slotSlug   Canonical slot slug (matches APP_AD_SLOTS[].slug).
 * @param startDate  ISO date (YYYY-MM-DD). Defaults to today.
 * @param endDate    ISO date (YYYY-MM-DD). Defaults to today + 5 years
 *                   so the public form treats any pending campaign as
 *                   taken until the buyer narrows the window.
 */
export async function getBookedPubsForSlot(
  slotSlug: string,
  startDate?: string,
  endDate?: string,
): Promise<Set<CheckoutPub>> {
  const { start, end } = defaultWindow(startDate, endDate);

  let rows: ActiveCampaignRow[] = [];
  try {
    const sql = getSql();
    const result = (await sql`
      SELECT ad_space_slug,
             publication,
             pubs,
             start_date::text AS start_date,
             end_date::text   AS end_date
        FROM ad_campaigns
       WHERE ad_space_slug = ${slotSlug}
         AND (active = TRUE OR approval_status = 'pending')
         AND advertiser_name <> ${HOUSE_AD_ADVERTISER}
         AND start_date <= ${end}::date
         AND end_date   >= ${start}::date
    `) as unknown as ActiveCampaignRow[];
    rows = Array.isArray(result) ? result : [];
  } catch (err) {
    // Sandbox / no DB / table missing -- fail open so the UI is not bricked.
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[slot-availability] fail-open for slot=${slotSlug}: ${msg}`);
    return new Set<CheckoutPub>();
  }

  return rowsToBlockedSet(rows, capacityForSlug(slotSlug));
}

/**
 * Determine whether a slot is fully sold out for the requested publication.
 */
export async function isSlotSoldOut(
  slotSlug: string,
  pub: CheckoutPub,
): Promise<boolean> {
  const blocked = await getBookedPubsForSlot(slotSlug);
  return blocked.has(pub);
}

/**
 * Pick up to `limit` alternative digital slots the buyer could consider
 * when the slot they inquired about is sold out. Preference order:
 *   1. Same tier and zone as the original (closest substitute)
 *   2. Same tier, any zone
 *   3. Any tier, any zone
 * Sold-out slots are filtered out using the same date window as the public
 * checkout. Slots whose availablePubs don't include the requested pub are
 * also filtered out.
 *
 * Uses the batch helper so this is a single SQL query regardless of how
 * many candidate slots APP_AD_SLOTS contains.
 */
export async function pickAlternativeSlots(
  originalSlug: string,
  pub: CheckoutPub,
  limit = 3,
): Promise<AppAdSlot[]> {
  const original = APP_AD_SLOTS.find((s) => s.slug === originalSlug);
  const all = APP_AD_SLOTS.filter((s) => s.slug !== originalSlug);

  // Only consider slots that can actually be booked on the requested pub.
  const pubCompatible = all.filter((s) =>
    (getSlotAvailablePubs(s) as readonly string[]).includes(pub),
  );

  // Single SQL query for all slot availability.
  const blockedBySlug = await getBookedPubsForAllSlots();

  const available = pubCompatible.filter((s) => {
    const blocked = blockedBySlug.get(s.slug) ?? new Set<CheckoutPub>();
    return !blocked.has(pub);
  });

  // Rank: same tier+zone first, then same tier, then everything else.
  const rank = (s: AppAdSlot): number => {
    if (!original) return 2;
    if (s.tier === original.tier && s.zone === original.zone) return 0;
    if (s.tier === original.tier) return 1;
    return 2;
  };
  available.sort((a, b) => rank(a) - rank(b));

  return available.slice(0, limit);
}
