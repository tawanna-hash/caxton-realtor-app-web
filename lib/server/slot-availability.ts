// lib/server/slot-availability.ts
//
// Reads live ad_campaigns rows to determine which publication scopes
// ('realtyline' | 'newsline' | 'both') are currently SOLD on a given slot
// and therefore must be blocked in the public checkout UI + API.
//
// Rules
// -----
//   1. A campaign with publication='both' (or 'realtyline'+'newsline') blocks
//      all three scopes.
//   2. A campaign on a single pub (austin/realtyline OR san_antonio/newsline)
//      blocks that pub AND blocks 'both' (since 'both' requires both to be
//      free).
//   3. Date overlap is computed against the requested window. If none is
//      supplied, "today through 5 years out" is used so the public form
//      shows the slot as blocked while any future campaign is live.
//
// Pub label encoding: historical rows in ad_campaigns.publication may use
// either the DB enum ('austin' | 'san_antonio' | 'both') or the rate-card
// enum ('realtyline' | 'newsline' | 'both') depending on which code path
// inserted them. We normalize both here.

import { getSql } from '@/lib/db';
import { APP_AD_SLOTS, getSlotAvailablePubs, type AppAdSlot } from '@/lib/media-kit';

export type CheckoutPub = 'realtyline' | 'newsline' | 'both';

// House ads (advertiser_name = HOUSE_AD_ADVERTISER) exist to fill unsold
// inventory — they should never block a real booking inquiry. We exclude
// them from every blocking-availability query so the public checkout, the
// inquire route's sold-out probe, and pickAlternativeSlots all treat
// house-ad-only slots as available. When a real advertiser books, the
// admin deactivates the house campaign from /admin/ads.
export const HOUSE_AD_ADVERTISER = 'RealtyLine House';

interface ActiveCampaignRow {
  ad_space_slug: string;
  publication: string;
  start_date: string;
  end_date: string;
}

/**
 * Normalize an ad_campaigns.publication string into the checkout enum.
 * Returns null for unrecognized values (defensive).
 */
function normalizePub(raw: string): 'realtyline' | 'newsline' | 'both' | null {
  const v = (raw || '').toLowerCase().trim();
  if (v === 'realtyline' || v === 'austin') return 'realtyline';
  if (v === 'newsline' || v === 'san_antonio' || v === 'sa') return 'newsline';
  if (v === 'both') return 'both';
  return null;
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

/**
 * Reduce active-campaign rows (already filtered to a single slot) into the
 * set of checkout scopes that are blocked. Pure / no I/O.
 */
function rowsToBlockedSet(rows: ActiveCampaignRow[]): Set<CheckoutPub> {
  const blocked = new Set<CheckoutPub>();
  let realtylineTaken = false;
  let newslineTaken = false;

  for (const r of rows) {
    const pub = normalizePub(r.publication);
    if (pub === 'both') {
      realtylineTaken = true;
      newslineTaken = true;
    } else if (pub === 'realtyline') {
      realtylineTaken = true;
    } else if (pub === 'newsline') {
      newslineTaken = true;
    }
  }

  if (realtylineTaken) blocked.add('realtyline');
  if (newslineTaken) blocked.add('newsline');
  // 'both' is blocked whenever EITHER single pub is taken, since 'both'
  // requires both pubs to be available.
  if (realtylineTaken || newslineTaken) blocked.add('both');

  return blocked;
}

/**
 * Batch helper — returns the blocked-pub Set for EVERY known slot in
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
export async function getBookedPubsForAllSlots(
  startDate?: string,
  endDate?: string,
): Promise<Map<string, Set<CheckoutPub>>> {
  const { start, end } = defaultWindow(startDate, endDate);

  // Pre-seed every known slot with an empty Set so callers always get a
  // value back even when no campaign touches that slug.
  const result = new Map<string, Set<CheckoutPub>>();
  for (const s of APP_AD_SLOTS) {
    result.set(s.slug, new Set<CheckoutPub>());
  }

  let rows: ActiveCampaignRow[] = [];
  try {
    const sql = getSql();
    const r = (await sql`
      SELECT ad_space_slug,
             publication,
             start_date::text AS start_date,
             end_date::text   AS end_date
        FROM ad_campaigns
       WHERE active = TRUE
         AND advertiser_name <> ${HOUSE_AD_ADVERTISER}
         AND start_date <= ${end}::date
         AND end_date   >= ${start}::date
    `) as unknown as ActiveCampaignRow[];
    rows = Array.isArray(r) ? r : [];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[slot-availability] batch fail-open: ${msg}`);
    return result;
  }

  // Group rows by slug, then reduce each group with the shared helper.
  const bySlug = new Map<string, ActiveCampaignRow[]>();
  for (const r of rows) {
    const slug = r.ad_space_slug;
    if (!slug) continue;
    const list = bySlug.get(slug);
    if (list) list.push(r);
    else bySlug.set(slug, [r]);
  }

  for (const [slug, slugRows] of bySlug) {
    // If a campaign references an unknown slug, surface it anyway so
    // future callers can still query for it.
    result.set(slug, rowsToBlockedSet(slugRows));
  }

  return result;
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
             start_date::text AS start_date,
             end_date::text   AS end_date
        FROM ad_campaigns
       WHERE ad_space_slug = ${slotSlug}
         AND active = TRUE
         AND advertiser_name <> ${HOUSE_AD_ADVERTISER}
         AND start_date <= ${end}::date
         AND end_date   >= ${start}::date
    `) as unknown as ActiveCampaignRow[];
    rows = Array.isArray(result) ? result : [];
  } catch (err) {
    // Sandbox / no DB / table missing — fail open so the UI is not bricked.
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[slot-availability] fail-open for slot=${slotSlug}: ${msg}`);
    return new Set<CheckoutPub>();
  }

  return rowsToBlockedSet(rows);
}

/**
 * Determine whether a slot is fully sold out for the requested publication
 * (or, when pub='both', sold out across BOTH publications).
 */
export async function isSlotSoldOut(
  slotSlug: string,
  pub: CheckoutPub,
): Promise<boolean> {
  const blocked = await getBookedPubsForSlot(slotSlug);
  // For 'both' the slot is sold out if either single pub is blocked. For a
  // single pub the slot is sold out only when that specific pub is blocked.
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
  const pubCompatible = all.filter((s) => getSlotAvailablePubs(s).includes(pub));

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
