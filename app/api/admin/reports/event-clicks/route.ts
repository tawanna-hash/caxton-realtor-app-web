// app/api/admin/reports/event-clicks/route.ts
// Per-click detail log for a single event's registration short link
// (/e/[id]). Backed by Postgres (event_registration_clicks), not
// PostHog — this is the "who clicked" drill-down behind the aggregate
// registrations count shown in Admin > Reports > Events.
//
// Each row is one click from a browser/device (visitor_id), not a named
// person — public event pages don't require login, so there is no
// name/email to attribute a click to.
//
// Query params:
//   event_id (required)
//   days     (optional, default 30) — rolling window, clamped 1..365

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { ensureSchema, getSql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

async function verifyAdmin(): Promise<boolean> {
  try {
    const admin = await getCurrentAdmin();
    return admin !== null;
  } catch {
    return false;
  }
}

type ClickRow = {
  occurred_at: string;
  visitor_id: string;
  city: string | null;
  region: string | null;
  country: string | null;
  user_agent: string | null;
  referrer: string | null;
};

export async function GET(req: NextRequest) {
  const isAdmin = await verifyAdmin();
  if (!isAdmin) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const eventIdRaw = req.nextUrl.searchParams.get('event_id');
  const eventId = eventIdRaw ? Number(eventIdRaw) : NaN;
  if (!Number.isInteger(eventId) || eventId <= 0) {
    return NextResponse.json(
      { ok: false, error: 'Missing or invalid required param: event_id' },
      { status: 400 },
    );
  }

  const daysRaw = req.nextUrl.searchParams.get('days');
  const daysParsed = daysRaw ? parseInt(daysRaw, 10) : 30;
  const days = Number.isFinite(daysParsed) && daysParsed >= 1 && daysParsed <= 365
    ? daysParsed
    : 30;

  try {
    await ensureSchema();
    const sql = getSql();
    const rows = (await sql`
      SELECT occurred_at, visitor_id, city, region, country, user_agent, referrer
        FROM event_registration_clicks
       WHERE event_id = ${eventId}
         AND occurred_at >= NOW() - (${days} || ' days')::interval
       ORDER BY occurred_at DESC
       LIMIT 500
    `) as unknown as ClickRow[];

    // Distinct visitor count — how many different browsers/devices clicked,
    // vs. total clicks which may include repeat taps from the same visitor.
    const distinctVisitors = new Set(rows.map((r) => r.visitor_id)).size;

    return NextResponse.json({
      ok: true,
      event_id: eventId,
      range_days: days,
      total_clicks: rows.length,
      distinct_visitors: distinctVisitors,
      clicks: rows.map((r) => ({
        occurred_at: r.occurred_at,
        visitor_id: r.visitor_id,
        location: [r.city, r.region, r.country].filter(Boolean).join(', ') || null,
        user_agent: r.user_agent,
        referrer: r.referrer,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
