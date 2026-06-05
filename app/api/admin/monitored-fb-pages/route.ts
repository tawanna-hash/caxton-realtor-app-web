/**
 * /api/admin/monitored-fb-pages
 *   GET  — list all monitored FB pages (active + inactive)
 *   POST — add a new monitored Page { url_or_slug, label, pub }
 *
 * "Monitored" = Pages the admin *follows* but doesn't admin. Scanned by
 * /api/cron/scan-followed-fb-pages via headless Chromium since FB has no
 * API for non-admin Pages.
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { ensureSchema } from '@/lib/db';
import {
  listMonitoredFbPages,
  createMonitoredFbPage,
  parseFbPageSlug,
  type MonitoredPub,
} from '@/lib/server/monitored-fb-pages-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_PUBS: MonitoredPub[] = ['austin', 'san_antonio'];

export const GET = withErrorHandling(async () => {
  await requireAdmin();
  await ensureSchema();
  const pages = await listMonitoredFbPages();
  return NextResponse.json({ pages });
});

export const POST = withErrorHandling(async (req: Request) => {
  await requireAdmin();
  await ensureSchema();

  const body = (await req.json()) as {
    url_or_slug?: string;
    label?: string;
    pub?: string;
  };

  const raw = (body.url_or_slug ?? '').toString().trim();
  const label = (body.label ?? '').toString().trim();
  const pub = (body.pub ?? 'austin') as MonitoredPub;

  if (!raw) throw new ApiError(400, 'url_or_slug is required');
  if (!label) throw new ApiError(400, 'label is required');
  if (!VALID_PUBS.includes(pub)) {
    throw new ApiError(400, `pub must be one of: ${VALID_PUBS.join(', ')}`);
  }

  const slug = parseFbPageSlug(raw);
  if (!slug) {
    throw new ApiError(
      400,
      'Could not extract a Page slug from the input. Paste a facebook.com URL or just the @handle.'
    );
  }

  const page = await createMonitoredFbPage({ slug, label, pub });
  return NextResponse.json({ page });
});
