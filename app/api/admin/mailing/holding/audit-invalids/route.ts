import { NextResponse } from 'next/server';
import { promises as dns } from 'node:dns';
import { ensureSchema, getSql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';

// ────────────────────────────────────────────────────────────────────
// Temporary one-shot audit endpoint.
//
// Scans every mailing_contacts row with email_status='Invalid' that was
// verified BEFORE the new verifier shipped (commit 066761e at ~2026-05-30
// 18:43 CDT == 2026-05-30 23:43 UTC). For each, resolves the domain's MX
// records and bucket-matches the host against:
//
//   • Microsoft 365 EOP    (*.mail.protection.outlook.com,
//                           *.olc.protection.outlook.com,
//                           *.mail.eo.outlook.com)
//   • Google Workspace     (*.aspmx.l.google.com,
//                           aspmx*.googlemail.com,
//                           alt*.aspmx.l.google.com)
//   • Proofpoint           (*.pphosted.com, *.ppe-hosted.com)
//
// Anything matching one of those patterns was almost certainly a
// false-negative caused by the old 8s verifier (the cloud-egress IP got
// rate-limited / silently dropped) and should be reclassified to Pending.
//
// Returns JSON; nothing is mutated. (Reclassification will be a separate
// explicit endpoint to keep this audit purely read-only.)
// ────────────────────────────────────────────────────────────────────

interface InvalidRow {
  id:                string;
  email:             string;
  email_verified_at: string | null;
  email_check:       Record<string, unknown> | null;
}

interface MxBucket {
  provider:  'microsoft365-eop' | 'google-workspace' | 'proofpoint' | 'other' | 'unresolved';
  mxHosts:   string[];
}

const M365_PATTERNS = [
  /\.mail\.protection\.outlook\.com\.?$/i,
  /\.olc\.protection\.outlook\.com\.?$/i,
  /\.mail\.eo\.outlook\.com\.?$/i,
];
const GOOGLE_PATTERNS = [
  /\.aspmx\.l\.google\.com\.?$/i,
  /^aspmx\d*\.googlemail\.com\.?$/i,
  /^alt\d+\.aspmx\.l\.google\.com\.?$/i,
  /^gmail-smtp-in\.l\.google\.com\.?$/i,
];
const PROOFPOINT_PATTERNS = [
  /\.pphosted\.com\.?$/i,
  /\.ppe-hosted\.com\.?$/i,
];

function classifyMx(hosts: string[]): MxBucket['provider'] {
  if (hosts.length === 0) return 'unresolved';
  const matchAny = (rxs: RegExp[]) => hosts.some(h => rxs.some(rx => rx.test(h)));
  if (matchAny(M365_PATTERNS))      return 'microsoft365-eop';
  if (matchAny(GOOGLE_PATTERNS))    return 'google-workspace';
  if (matchAny(PROOFPOINT_PATTERNS)) return 'proofpoint';
  return 'other';
}

async function resolveMxSafe(domain: string): Promise<string[]> {
  try {
    const records = await dns.resolveMx(domain);
    return records
      .sort((a, b) => a.priority - b.priority)
      .map(r => r.exchange.toLowerCase());
  } catch {
    return [];
  }
}

// Cutoff: anything verified before this UTC timestamp used the old 8s
// verifier (with no smtpTimedOut/mxAttempts signals, no Invalid-on-all-MX-
// timeout fallback). The deploy of 066761e finished ~23:48 UTC on 5/30.
const NEW_VERIFIER_CUTOFF_UTC = '2026-05-30 23:48:00';

export async function GET(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  await ensureSchema();
  const sql = getSql();

  const url = new URL(req.url);
  const includeAll = url.searchParams.get('all') === '1';

  // Pull all Invalid rows that pre-date the new verifier OR whose stored
  // signals lack the new keys (smtpTimedOut, mxAttempts). With `?all=1`
  // we also include Invalids verified after the cutoff — useful for
  // sanity-checking that the new verifier itself isn't bucketing
  // EOP/Google/Proofpoint mistakes.
  const rows = (await sql`
    SELECT id, email, email_verified_at, email_check
      FROM mailing_contacts
     WHERE email_status = 'Invalid'
       AND email IS NOT NULL
       AND email <> ''
       AND (
         ${includeAll}::boolean
         OR email_verified_at IS NULL
         OR email_verified_at < (${NEW_VERIFIER_CUTOFF_UTC}::timestamptz)
         OR (email_check->'signals' ? 'smtpTimedOut') = false
       )
  `) as unknown as InvalidRow[];

  // Group by domain so we only do one DNS lookup per domain.
  const byDomain = new Map<string, InvalidRow[]>();
  for (const r of rows) {
    const dom = (r.email.split('@')[1] ?? '').toLowerCase().trim();
    if (!dom) continue;
    const arr = byDomain.get(dom) ?? [];
    arr.push(r);
    byDomain.set(dom, arr);
  }

  // Resolve MX with bounded parallelism (20 at a time).
  const domains = Array.from(byDomain.keys());
  const mxByDomain = new Map<string, string[]>();
  const CONCURRENCY = 20;
  for (let i = 0; i < domains.length; i += CONCURRENCY) {
    const slice = domains.slice(i, i + CONCURRENCY);
    const results = await Promise.all(slice.map(async d => [d, await resolveMxSafe(d)] as const));
    for (const [d, hosts] of results) mxByDomain.set(d, hosts);
  }

  // Bucket rows by provider.
  const candidates: Array<{
    id:                string;
    email:             string;
    domain:            string;
    provider:          MxBucket['provider'];
    mx:                string[];
    email_verified_at: string | null;
    original_detail:   string | null;
  }> = [];

  const summary: Record<MxBucket['provider'], number> = {
    'microsoft365-eop': 0,
    'google-workspace': 0,
    'proofpoint':       0,
    'other':            0,
    'unresolved':       0,
  };

  for (const [dom, drows] of byDomain) {
    const hosts    = mxByDomain.get(dom) ?? [];
    const provider = classifyMx(hosts);
    for (const r of drows) {
      summary[provider] += 1;
      if (provider === 'microsoft365-eop' || provider === 'google-workspace' || provider === 'proofpoint') {
        const detail = ((r.email_check as { detail?: string } | null)?.detail) ?? null;
        candidates.push({
          id:                r.id,
          email:             r.email,
          domain:            dom,
          provider,
          mx:                hosts,
          email_verified_at: r.email_verified_at,
          original_detail:   detail,
        });
      }
    }
  }

  // Sort candidates: provider, then email, for stable output.
  candidates.sort((a, b) =>
    a.provider.localeCompare(b.provider) || a.email.localeCompare(b.email)
  );

  return NextResponse.json({
    cutoff_utc:           NEW_VERIFIER_CUTOFF_UTC,
    include_all:          includeAll,
    invalid_rows_scanned: rows.length,
    distinct_domains:     domains.length,
    summary,
    candidates_count:     candidates.length,
    candidates,
  });
}
