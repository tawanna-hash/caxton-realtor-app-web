// app/api/admin/activity/route.ts
//
// Real-time activity feed for /admin/activity. Queries PostHog HogQL for
// recent events on the public app. Supports event-type filtering, path
// filtering, and time-window selection.
//
// Returns the last N events ordered newest-first. The dashboard polls
// this endpoint every ~10s for live updates.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/server/auth/admin';
import { ApiError } from '@/lib/server/error';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const POSTHOG_HOST = 'https://us.posthog.com';
const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID;
const POSTHOG_API_KEY = process.env.POSTHOG_PERSONAL_API_KEY;

// UI exposes four logical buckets. We translate to PostHog event names below.
const FILTER_SCHEMA = z.object({
  bucket: z.enum(['all', 'pageview', 'click', 'form', 'error']).default('all'),
  minutes: z.coerce.number().int().min(1).max(10080).default(60),
  path: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

// Map UI bucket -> HogQL WHERE fragment on event/properties.
const BUCKET_FILTER: Record<string, string> = {
  all: "event IN ('$pageview','$autocapture','$rageclick','$exception','form_submitted','cta_clicked','newsletter_signup','giveaway_entered','advertiser_signed','article_opened','share_click')",
  pageview: "event = '$pageview'",
  click: "event IN ('$autocapture','$rageclick','cta_clicked','share_click','article_opened')",
  form: "event IN ('form_submitted','newsletter_signup','giveaway_entered','advertiser_signed')",
  error: "event IN ('$exception','client_error')",
};

async function runHogQL(query: string): Promise<unknown[]> {
  const res = await fetch(
    `${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID}/query/`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${POSTHOG_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
      cache: 'no-store',
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ApiError(502, `PostHog query failed: ${res.status} ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { results?: unknown[] };
  return data.results ?? [];
}

export const GET = withAdminTracking(async (req: Request) => {
  await requireAdmin();
  if (!POSTHOG_API_KEY || !POSTHOG_PROJECT_ID) {
    throw new ApiError(500, 'Server misconfigured: POSTHOG_PERSONAL_API_KEY or POSTHOG_PROJECT_ID missing.');
  }

  const url = new URL(req.url);
  const parsed = FILTER_SCHEMA.safeParse({
    bucket: url.searchParams.get('bucket') ?? undefined,
    minutes: url.searchParams.get('minutes') ?? undefined,
    path: url.searchParams.get('path') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) throw new ApiError(400, 'Invalid query params');
  const { bucket, minutes, path, limit } = parsed.data;

  const conditions: string[] = [
    `timestamp >= now() - INTERVAL ${minutes} MINUTE`,
    // Only public app traffic; admin pages are noise here.
    `properties.$pathname NOT LIKE '/admin%'`,
    `properties.$pathname NOT LIKE '/api/admin%'`,
    BUCKET_FILTER[bucket],
  ];
  if (path) {
    // Safe: HogQL escapes via parameter substitution? Be defensive with a regex.
    const safePath = path.replace(/[^a-zA-Z0-9/_-]/g, '');
    if (safePath) conditions.push(`properties.$pathname LIKE '%${safePath}%'`);
  }

  // Limit-bound HogQL query. Pull the fields the dashboard needs.
  const query = `
    SELECT
      timestamp,
      event,
      properties.$pathname AS pathname,
      properties.$host AS host,
      properties.$current_url AS url,
      properties.publication AS publication,
      properties.$device_type AS device,
      properties.$browser AS browser,
      properties.$os AS os,
      properties.$geoip_city_name AS city,
      properties.$geoip_country_name AS country,
      distinct_id,
      person.properties.email AS email,
      properties.$exception_message AS error_message,
      properties.$el_text AS el_text,
      properties.$el_href AS el_href,
      properties.action AS action,
      properties.form_name AS form_name
    FROM events
    WHERE ${conditions.join(' AND ')}
    ORDER BY timestamp DESC
    LIMIT ${limit}
  `;

  const rows = await runHogQL(query);

  // Also fetch quick rollup counts per bucket for the header tiles.
  const rollupQuery = `
    SELECT
      countIf(event = '$pageview') AS pageviews,
      countIf(event IN ('$autocapture','$rageclick','cta_clicked','share_click','article_opened')) AS clicks,
      countIf(event IN ('form_submitted','newsletter_signup','giveaway_entered','advertiser_signed')) AS forms,
      countIf(event IN ('$exception','client_error')) AS errors,
      uniq(distinct_id) AS visitors
    FROM events
    WHERE timestamp >= now() - INTERVAL ${minutes} MINUTE
      AND properties.$pathname NOT LIKE '/admin%'
      AND properties.$pathname NOT LIKE '/api/admin%'
  `;
  const rollupRows = await runHogQL(rollupQuery);
  const rollup = Array.isArray(rollupRows[0]) ? rollupRows[0] : [];

  return NextResponse.json({
    events: rows,
    rollup: {
      pageviews: Number(rollup[0] ?? 0),
      clicks: Number(rollup[1] ?? 0),
      forms: Number(rollup[2] ?? 0),
      errors: Number(rollup[3] ?? 0),
      visitors: Number(rollup[4] ?? 0),
    },
    window: { bucket, minutes, path: path ?? null, limit },
  });
});
