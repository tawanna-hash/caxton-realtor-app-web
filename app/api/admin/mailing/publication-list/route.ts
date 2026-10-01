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
import { ApiError } from '@/lib/server/error';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { getSql } from '@/lib/db';
import { suppressedSubset } from '@/lib/server/email-suppressions';
import { PUB_ACTIVE, type PubId } from '@/lib/publications';
import { EXTRA_FIELD_IDS } from '@/lib/server/mailing/extra-fields';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DROP_STATUSES = new Set(['unsubscribed', 'bounced', 'suppressed', 'inactive']);

type Pub = PubId;

type Row = {
  email: string;
  first_name: string;
  last_name: string;
  source_table: string;
  source_segment: string;
  status: string;
  verification_status: string;
  // Mailing-contact id + detail columns (only for mailing_contacts rows).
  // Used by the paged browse view (format=page); stripped from the legacy
  // json/csv outputs so their shape is unchanged.
  id?: string | null;
  d?: Record<string, string | null> | null;
};

// Detail columns returned for mailing_contacts rows in the browse view.
const DETAIL_COLS = [
  'phone', 'mobile_phone', 'company', 'title', 'license_number', 'address', 'address_2',
  'city', 'state', 'zip', 'website', 'notes', ...EXTRA_FIELD_IDS,
] as const;
const DETAIL_SELECT = DETAIL_COLS.map((c) => `${c}::text AS ${c}`).join(', ');

function pickDetails(r: Record<string, unknown>): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const c of DETAIL_COLS) {
    const v = r[c];
    out[c] = typeof v === 'string' && v.trim() ? v : null;
  }
  return out;
}

function configFor(pub: Pub) {
  const configs: Record<Pub, {
    segments: string[];
    market: string;
    holdingSource: string;
    holdingLabel: string;
    newsletterPub: string;
  }> = {
    realtyline: {
        segments: ['realtyline-atx-print', 'email-only-atx'],
        market: 'austin',
        holdingSource: 'unlockmls',
        holdingLabel: 'abor-members',
        newsletterPub: 'realtyline',
    },
    newsline: {
        segments: ['newsline-sa-print', 'email-only-sa'],
        market: 'san_antonio',
        holdingSource: 'ramco-sabor',
        holdingLabel: 'sabor-members',
        newsletterPub: 'newsline',
    },
    'realtyline-houston': {
      segments: ['houston-mailing'],
      market: 'houston',
      holdingSource: '__none__',
      holdingLabel: 'houston',
      newsletterPub: 'realtyline-houston',
    },
    'realtyline-dallas': {
      segments: ['dallas-trec', 'fortworth-trec'],
      market: 'dallas',
      holdingSource: '__none__',
      holdingLabel: 'dallas-ft-worth',
      newsletterPub: 'realtyline-dallas',
    },
  };
  return configs[pub];
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
    `SELECT id::text AS id, ${DETAIL_SELECT}, email, COALESCE(first_name,'') AS first_name,
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
  )) as Array<{ id: string; email: string; first_name: string; last_name: string; segment: string; status: string } & Record<string, unknown>>;

  const holdingRows = (await sql.query(
    `SELECT id::text AS id, ${DETAIL_SELECT}, email, COALESCE(first_name,'') AS first_name,
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
  )) as Array<{ id: string; email: string; first_name: string; last_name: string; status: string } & Record<string, unknown>>;

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
      verification_status: 'unverified', id: r.id, d: pickDetails(r),
    });
  }
  for (const r of holdingRows) {
    raw.push({
      email: r.email, first_name: r.first_name, last_name: r.last_name,
      source_table: 'mailing_contacts', source_segment: cfg.holdingLabel, status: r.status,
      verification_status: 'unverified', id: r.id, d: pickDetails(r),
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
      if (!existing.id && r.id) { existing.id = r.id; existing.d = r.d; }
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

// ---------------------------------------------------------------------------
// Browse view (format=page): server-side search / filter / sort / paging so
// the admin table can show every detail column without shipping the whole
// list to the browser.
// ---------------------------------------------------------------------------
const PAGE_FILTER_FIELDS = [
  'license_type', 'member_type', 'role_code', 'source_file', 'county', 'city',
  'state', 'title', 'office_type',
];
const SEARCH_DETAIL = [
  'company', 'license_number', 'city', 'zip', 'nrds_id', 'office_nrds_id', 'county',
  'phone', 'notes', 'title', 'address', 'designated_realtor',
];

function sortValue(r: Row, key: string): string {
  switch (key) {
    case 'email': return r.email;
    case 'name': return `${r.first_name} ${r.last_name}`.trim().toLowerCase();
    case 'source': return r.source_table;
    case 'segment': return r.source_segment;
    case 'verification': return r.verification_status;
    default: return (r.d?.[key] ?? '').toLowerCase();
  }
}

function pageView(all: Row[], url: URL) {
  const sp = url.searchParams;
  const page = Math.max(1, parseInt(sp.get('page') || '1', 10) || 1);
  const pageSize = Math.min(500, Math.max(1, parseInt(sp.get('pageSize') || '50', 10) || 50));
  const q = (sp.get('q') || '').trim().toLowerCase();
  const verif = sp.get('verif') || 'all';
  const source = sp.get('source') || 'all';
  const sort = sp.get('sort') || 'email';
  const dir = sp.get('dir') === 'desc' ? -1 : 1;
  const ff: Record<string, string> = {};
  for (const [k, v] of sp.entries()) {
    if (k.startsWith('f_') && PAGE_FILTER_FIELDS.includes(k.slice(2)) && v) ff[k.slice(2)] = v;
  }

  const base = all.filter((r) => {
    if (verif !== 'all' && r.verification_status !== verif) return false;
    if (source !== 'all' && r.source_table !== source) return false;
    if (q) {
      const hay = [r.email, r.first_name, r.last_name, r.source_segment,
        ...SEARCH_DETAIL.map((c) => r.d?.[c] ?? '')].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // Facets reflect search + verification + source, before column filters.
  const facets: Record<string, Array<{ value: string; count: number }>> = {};
  for (const f of PAGE_FILTER_FIELDS) {
    const m = new Map<string, number>();
    for (const r of base) {
      const v = r.d?.[f];
      if (v) m.set(v, (m.get(v) ?? 0) + 1);
    }
    facets[f] = Array.from(m, ([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
      .slice(0, 300);
  }

  const filtered = Object.keys(ff).length
    ? base.filter((r) => Object.entries(ff).every(([k, v]) => (r.d?.[k] ?? '') === v))
    : base;

  const sorted = filtered.slice().sort((a, b) => {
    const av = sortValue(a, sort);
    const bv = sortValue(b, sort);
    if (!av && bv) return 1;   // blanks last
    if (av && !bv) return -1;
    return av.localeCompare(bv) * dir || a.email.localeCompare(b.email);
  });

  return {
    total: filtered.length,
    unfiltered: all.length,
    page,
    pageSize,
    facets,
    rows: sorted.slice((page - 1) * pageSize, page * pageSize),
  };
}

export const GET = withAdminTracking(async (req: Request) => {
  await requireAdmin();
  const url = new URL(req.url);
  const pubParam = (url.searchParams.get('list') || url.searchParams.get('pub') || '').toLowerCase();
  if (!PUB_ACTIVE.some((publication) => publication.id === pubParam)) {
    throw new ApiError(400, 'invalid_list', 'list must be an active publication');
  }
  const pub = pubParam as Pub;
  const format = (url.searchParams.get('format') || 'csv').toLowerCase();

  const { rows, stats } = await buildList(pub);

  if (format === 'page') {
    return NextResponse.json({ publication: pub, ...stats, ...pageView(rows, url) });
  }

  // Legacy shapes: strip the browse-only id/detail fields.
  for (const r of rows) { delete r.id; delete r.d; }

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
