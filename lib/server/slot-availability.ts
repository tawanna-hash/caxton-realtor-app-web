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

export type CheckoutPub = 'realtyline' | 'newsline' | 'both';

interface ActiveCampaignRow {
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
  const blocked = new Set<CheckoutPub>();

  // Default window: today -> +5y. This is intentionally wide so the
  // checkout form treats any live or upcoming campaign as taken on
  // first paint. Once the buyer narrows dates, the API recomputes.
  const today = new Date().toISOString().slice(0, 10);
  const farFuture = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 5);
    return d.toISOString().slice(0, 10);
  })();
  const start = startDate || today;
  const end = endDate || farFuture;

  let rows: ActiveCampaignRow[] = [];
  try {
    const sql = getSql();
    const result = (await sql`
      SELECT publication, start_date::text AS start_date, end_date::text AS end_date
        FROM ad_campaigns
       WHERE ad_space_slug = ${slotSlug}
         AND active = TRUE
         AND start_date <= ${end}::date
         AND end_date   >= ${start}::date
    `) as unknown as ActiveCampaignRow[];
    rows = Array.isArray(result) ? result : [];
  } catch (err) {
    // Sandbox / no DB / table missing — fail open so the UI is not bricked.
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[slot-availability] fail-open for slot=${slotSlug}: ${msg}`);
    return blocked;
  }

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
