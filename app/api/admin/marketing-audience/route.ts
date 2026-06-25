// app/api/admin/marketing-audience/route.ts
//
// POST — multi-source audience preview for the marketing email modal.
// Accepts an array of sources (advertisers + subscribers + manual emails),
// resolves each, dedupes by lowercase email, and returns count + sample.
//
// Distinct from /api/admin/marketing-campaigns/[id]/audience which only
// resolves the legacy single-filter audience tied to one campaign.

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withErrorHandling } from '@/lib/server/error';
import { parseJson } from '@/lib/server/schemas/_common';
import { getSql, ensureSchema } from '@/lib/db';
import { resolveAudience } from '@/lib/marketing-campaigns';
import { audiencePreviewSchema } from '@/lib/server/schemas/marketing-outreach';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PreviewRecipient {
  source: 'advertiser' | 'subscriber' | 'manual';
  id: number | null;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  publication: string | null;
}

export const POST = withErrorHandling(async (req: Request) => {
  await requireAdmin();
  const input = await parseJson(req, audiencePreviewSchema);
  await ensureSchema();
  const sql = getSql();

  const seen = new Set<string>();
  const recipients: PreviewRecipient[] = [];

  // ── Advertisers ────────────────────────────────────────────────
  if (input.sources.includes('advertisers')) {
    const ids = await resolveAudience(sql as never, input.advertiser_filter ?? {});
    if (ids.length > 0) {
      const rows = (await sql`
        SELECT id, email, first_name, last_name, company, publication
        FROM advertisers
        WHERE id = ANY(${ids}::int[])
          AND email IS NOT NULL
          AND length(trim(email)) > 0
        ORDER BY name ASC
      `) as unknown as Array<{
        id: number; email: string; first_name: string | null;
        last_name: string | null; company: string | null; publication: string | null;
      }>;
      for (const r of rows) {
        const key = r.email.trim().toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        recipients.push({
          source: 'advertiser',
          id: r.id,
          email: r.email,
          first_name: r.first_name,
          last_name: r.last_name,
          company: r.company,
          publication: r.publication,
        });
      }
    }
  }

  // ── Newsletter subscribers ─────────────────────────────────────
  if (input.sources.includes('subscribers') || input.sources.includes('segment')) {
    const f = input.subscriber_filter ?? {};
    const rows = (await sql`
      SELECT n.id, n.email, n.publication
      FROM newsletter_subscribers n
      LEFT JOIN email_verifications ev ON ev.email = lower(n.email)
      WHERE COALESCE(n.status, 'active') = COALESCE(${f.status ?? null}, COALESCE(n.status, 'active'))
        AND (${f.publication ?? null}::text IS NULL OR n.publication = ${f.publication ?? null})
        AND (
          ${f.verified ?? null}::text IS NULL
          OR (${f.verified ?? null} = 'unverified' AND ev.status IS NULL)
          OR (${f.verified ?? null} <> 'unverified' AND ev.status = ${f.verified ?? null})
        )
      ORDER BY n.created_at DESC
      LIMIT 50000
    `) as unknown as Array<{ id: number; email: string; publication: string | null }>;
    for (const r of rows) {
      const key = r.email.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      recipients.push({
        source: 'subscriber',
        id: r.id,
        email: r.email,
        first_name: null,
        last_name: null,
        company: null,
        publication: r.publication,
      });
    }
  }

  // ── Manual entries ─────────────────────────────────────────────
  if (input.sources.includes('manual') && input.manual_emails) {
    for (const raw of input.manual_emails) {
      const key = raw.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      recipients.push({
        source: 'manual',
        id: null,
        email: raw.trim(),
        first_name: null,
        last_name: null,
        company: null,
        publication: null,
      });
    }
  }

  return NextResponse.json({
    count: recipients.length,
    sample: recipients.slice(0, 25),
    by_source: {
      advertiser: recipients.filter(r => r.source === 'advertiser').length,
      subscriber: recipients.filter(r => r.source === 'subscriber').length,
      manual:     recipients.filter(r => r.source === 'manual').length,
    },
  });
});
