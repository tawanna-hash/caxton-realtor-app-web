// app/api/admin/analytics/marketing-performance/route.ts
//
// GET — monthly × channel rollup for /admin/marketing-performance.
// Sources and attribution rules are documented in
// lib/server/marketing-performance.ts.
//
// Cached in memory (see marketing-performance-cache.ts): fresh 15 min, then
// stale-while-revalidate up to 6 h. Add ?refresh=1 to force a rebuild.

import { NextResponse, after } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { buildMarketingPerformance, isPubFilter } from '@/lib/server/marketing-performance';
import { FRESH_MS, claimRefresh, getCached, putCached } from '@/lib/server/marketing-performance-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// A rollup where any connected source timed out or errored is "degraded":
// it is shown once but never cached, and never replaces a good cached copy.
function isDegraded(data: Awaited<ReturnType<typeof buildMarketingPerformance>>): boolean {
  const s = data.sources;
  return Boolean(s.ga4.error || s.mailchimp.error || s.meta.error);
}

export const GET = withAdminTracking(async (req: Request) => {
  await requireAdmin();
  const sp = new URL(req.url).searchParams;
  const pubParam = sp.get('pub');
  const pub = isPubFilter(pubParam) ? pubParam : 'all';
  const key = String(pub);

  if (sp.get('refresh') !== '1') {
    const hit = getCached(key);
    if (hit) {
      if (hit.ageMs > FRESH_MS && claimRefresh(key)) {
        after(async () => {
          try {
            const fresh = await buildMarketingPerformance(pub);
            if (!isDegraded(fresh)) putCached(key, fresh);
          } catch { /* keep stale copy */ }
        });
      }
      return NextResponse.json({ ok: true, data: hit.data, cached: true, age_s: Math.round(hit.ageMs / 1000) });
    }
  }

  const data = await buildMarketingPerformance(pub);
  if (!isDegraded(data)) putCached(key, data);
  return NextResponse.json({ ok: true, data });
});
