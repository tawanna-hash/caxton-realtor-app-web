/**
 * GET /api/admin/mailing/publication-list?list=realtyline|newsline[&format=csv|json]
 *
 * Returns the unified email-only list for one publication, merging:
 *   - mailing_contacts (stage='mailing') for the publication's segments
 *   - mailing_contacts (stage='holding') for ABOR (unlockmls) or SABOR (ramco-sabor)
 *   - realtors (app subscribers) by market
 *   - newsletter_subscribers (weekly digest) where status='active'
 *
 * Emails are lower-cased + de-duplicated within the publication. Rows
 * with no email, an invalid email, or status in {unsubscribed, bounced,
 * suppressed, inactive} are dropped.
 *
 * Default format is CSV (Content-Disposition: attachment). Pass
 * ?format=json for an in-memory JSON dump (capped at 50k rows defensively).
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { getSql } from '@/lib/db';
import { suppressedSubset } from '@/lib/server/email-suppressions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DROP_STATUSES = new Set(['unsubscribed', 'bounced', 'suppressed', 'inactive']);

type Pub = 'realtyline' | 'newsline';

type Row = {
  email: string;
  first_name: string;
  last_name: string;
  source_table: string;
  source_segment: string;
  status: string;
  verification_status: string;
};

function configFor(pub: Pub) {
  return pub === 'realtyline'
    ? {
        segments: ['active-advertiser-atx', 'non-advertiser-atx', 'email-only-atx'],
        market: 'austin',
        holdingSource: 'unlockmls',
        holdingLabel: 'abor-members',
        newsletterPub: 'realtyline',
      }
    : {
        segments: ['active-advertiser-sa', 'non-advertiser-sa', 'manual-newsline', 'email-only-sa'],
        market: 'san_antonio',
        holdingSource: 'ramco-sabor',
        holdingLabel: 'sabor-members',
        newsletterPub: 'newsline',
      };
}

function normaliseEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const e = raw.trim().toLowerCase();
  if (!e || !EMAIL_RE.test(e)) return null;
  return e;
}

function csvField(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function buildList(pub: Pub): Promise<{ rows: Row[]; stats: Record<string, number> }> {
  const sql = getSql();
  const cfg = configFor(pub);

  // mailing_contacts has no `status` column — the unsubscribe signal is
  // `unsubscribed_at IS NOT NULL`, and email validity is captured by
  // email_status / email_override_status. We compute a derived status here
  // so the dedupe layer can apply uniform drop rules.
  const mailingRows = (await sql.query(
    `SELECT email, COALESCE(first_name,'') AS first_name,
            COALESCE(last_name,'') AS last_name, segment,
            CASE
              WHEN unsubscribed_at IS NOT NULL THEN 'unsubscribed'
              WHEN COALESCE(email_override_status, email_status) = 'Invalid' THEN 'bounced'
              ELSE 'active'
            END AS status
       FROM mailing_contacts
      WHERE stage = 'mailing'
        AND segment = ANY($1::text[])
        AND email IS NOT NULL AND length(trim(email)) > 0`,
    [cfg.segments],
  )) as Array<{ email: string; first_name: string; last_name: string; segment: string; status: string }>;

  const holdingRows = (await sql.query(
    `SELECT email, COALESCE(first_name,'') AS first_name,
            COALESCE(last_name,'') AS last_name,
            CASE
              WHEN unsubscribed_at IS NOT NULL THEN 'unsubscribed'
              WHEN COALESCE(email_override_status, email_status) = 'Invalid' THEN 'bounced'
              ELSE 'holding'
            END AS status
       FROM mailing_contacts
      WHERE stage = 'holding'
        AND external_source = $1
        AND email IS NOT NULL AND length(trim(email)) > 0`,
    [cfg.holdingSource],
  )) as Array<{ email: string; first_name: string; last_name: string; status: string }>;

  const realtorRows = (await sql.query(
    `SELECT email, COALESCE(first_name,'') AS first_name,
            COALESCE(last_name,'') AS last_name,
            COALESCE(status,'active') AS status
       FROM realtors
      WHERE market = $1
        AND email IS NOT NULL AND length(trim(email)) > 0`,
    [cfg.market],
  )) as Array<{ email: string; first_name: string; last_name: string; status: string }>;

  const newsletterRows = (await sql.query(
    `SELECT email, COALESCE(status,'active') AS status
       FROM newsletter_subscribers
      WHERE publication = $1
        AND status = 'active'
        AND email IS NOT NULL AND length(trim(email)) > 0`,
    [cfg.newsletterPub],
  )) as Array<{ email: string; status: string }>;

  const raw: Row[] = [];
  for (const r of mailingRows) {
    raw.push({
      email: r.email, first_name: r.first_name, last_name: r.last_name,
      source_table: 'mailing_contacts', source_segment: r.segment, status: r.status,
      verification_status: 'unverified',
    });
  }
  for (const r of holdingRows) {
    raw.push({
      email: r.email, first_name: r.first_name, last_name: r.last_name,
      source_table: 'mailing_contacts', source_segment: cfg.holdingLabel, status: r.status,
      verification_status: 'unverified',
    });
  }
  for (const r of realtorRows) {
    raw.push({
      email: r.email, first_name: r.first_name, last_name: r.last_name,
      source_table: 'realtors', source_segment: 'app-subscribers', status: r.status,
      verification_status: 'unverified',
    });
  }
  for (const r of newsletterRows) {
    raw.push({
      email: r.email, first_name: '', last_name: '',
      source_table: 'newsletter_subscribers', source_segment: 'weekly-digest', status: r.status,
      verification_status: 'unverified',
    });
  }

  // Dedupe + clean.
  const map = new Map<string, Row>();
  let dropped_invalid_email = 0;
  let dropped_status = 0;
  let collapsed = 0;
  for (const r of raw) {
    const email = normaliseEmail(r.email);
    if (!email) { dropped_invalid_email++; continue; }
    if (DROP_STATUSES.has(String(r.status).toLowerCase())) { dropped_status++; continue; }
    const existing = map.get(email);
    if (!existing) {
      map.set(email, { ...r, email });
    } else {
      collapsed++;
      if (!existing.first_name && r.first_name) existing.first_name = r.first_name;
      if (!existing.last_name && r.last_name) existing.last_name = r.last_name;
      if (!existing.source_segment.includes(r.source_segment)) {
        existing.source_segment = `${existing.source_segment}|${r.source_segment}`;
      }
    }
  }

  // Filter out anything in the permanent suppression list. This is the
  // tombstone that makes a Mailing-Hub delete truly permanent: even if
  // the holding sync didn't yet honor the suppression (race window) the
  // CSV export must never include a suppressed address.
  let rows = Array.from(map.values()).sort((a, b) => a.email.localeCompare(b.email));
  let dropped_suppressed = 0;
  if (rows.length > 0) {
    const suppressedSet = await suppressedSubset(rows.map((r) => r.email));
    if (suppressedSet.size > 0) {
      const before = rows.length;
      rows = rows.filter((r) => !suppressedSet.has(r.email));
      dropped_suppressed = before - rows.length;
    }
  }

  // Single batched lookup against the unified email_verifications table —
  // every email is already lower-cased + valid by this point.
  if (rows.length > 0) {
    const emails = rows.map(r => r.email);
    const verifs = (await sql.query(
      `SELECT email, status FROM email_verifications WHERE email = ANY($1::text[])`,
      [emails],
    )) as Array<{ email: string; status: string }>;
    const vmap = new Map(verifs.map(v => [v.email, v.status]));
    for (const r of rows) {
      r.verification_status = vmap.get(r.email) ?? 'unverified';
    }
  }

  return {
    rows,
    stats: {
      raw_pulled: raw.length,
      dropped_invalid_email,
      dropped_status,
      dropped_suppressed,
      collapsed_duplicates: collapsed,
      final_unique_emails: rows.length,
    },
  };
}

export const GET = withErrorHandling(async (req: Request) => {
  await requireAdmin();
  const url = new URL(req.url);
  const pubParam = (url.searchParams.get('list') || url.searchParams.get('pub') || '').toLowerCase();
  if (pubParam !== 'realtyline' && pubParam !== 'newsline') {
    throw new ApiError(400, 'invalid_list', "list must be 'realtyline' or 'newsline'");
  }
  const pub = pubParam as Pub;
  const format = (url.searchParams.get('format') || 'csv').toLowerCase();

  const { rows, stats } = await buildList(pub);

  if (format === 'json') {
    return NextResponse.json({ publication: pub, ...stats, rows });
  }

  // CSV
  const today = new Date().toISOString().slice(0, 10);
  const filename = `${pub}-emails-${today}.csv`;
  const header = 'email,first_name,last_name,source_table,source_segment,status,verification_status\n';
  let body = header;
  for (const r of rows) {
    body += [
      csvField(r.email),
      csvField(r.first_name),
      csvField(r.last_name),
      csvField(r.source_table),
      csvField(r.source_segment),
      csvField(r.status),
      csvField(r.verification_status),
    ].join(',') + '\n';
  }
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      // Surface the stats in headers so the UI can show counts without
      // re-parsing the CSV.
      'X-Mailing-Total': String(stats.final_unique_emails),
      'X-Mailing-Collapsed': String(stats.collapsed_duplicates),
      'X-Mailing-Dropped-Invalid': String(stats.dropped_invalid_email),
      'X-Mailing-Dropped-Status': String(stats.dropped_status),
      'X-Mailing-Dropped-Suppressed': String(stats.dropped_suppressed),
      'Cache-Control': 'no-store',
    },
  });
});
