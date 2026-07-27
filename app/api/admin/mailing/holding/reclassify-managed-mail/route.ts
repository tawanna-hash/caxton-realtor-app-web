import { NextResponse } from 'next/server';
import { promises as dns } from 'node:dns';
import { z } from 'zod';
import { ensureSchema, getSql } from '@/lib/db';
import { requireAdmin } from '@/lib/server/auth/admin';
import { classifyManagedMail } from '@/lib/email-verify';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { parseJson } from '@/lib/server/schemas/_common';

// ────────────────────────────────────────────────────────────────────
// One-shot reclassification endpoint.
//
// Scans every mailing_contacts row with email_status='Invalid' whose
// MX matches the managed-mail patterns (Microsoft 365 EOP, Google
// Workspace, Proofpoint) and flips it back to Pending. These are
// false-negatives caused by cloud-IP rate-limiting on the SMTP probe;
// the address is almost certainly valid but unverifiable from a
// serverless function.
//
// Each reclassified row gets:
//   • email_status        = 'Pending'
//   • email_check.signals.managedMailProvider = '<id>'
//   • email_notes         += timestamped audit log line
//
// POST  /api/admin/mailing/holding/reclassify-managed-mail
//   body:  { "dryRun": true|false }   (default true)
//
// Dry-run is the default — returns the candidate list without writing.
// Pass {"dryRun": false} to actually persist the reclassification.
// ────────────────────────────────────────────────────────────────────

const reclassifyBodySchema = z
  .object({ dryRun: z.boolean().default(true) })
  .partial()
  .default({});

interface InvalidRow {
  id:                string;
  email:             string;
  email_verified_at: string | null;
  email_check:       Record<string, unknown> | null;
  email_notes:       string | null;
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

export const POST = withAdminTracking(async (req: Request) => {
  await requireAdmin();
  await ensureSchema();
  const sql = getSql();

  const body = await parseJson(req, reclassifyBodySchema);
  const dryRun = body.dryRun !== false; // default true

  // Pull every Invalid row with an email.
  const rows = (await sql`
    SELECT id, email, email_verified_at, email_check, email_notes
      FROM mailing_contacts
     WHERE email_status = 'Invalid'
       AND email IS NOT NULL
       AND email <> ''
  `) as unknown as InvalidRow[];

  // Group by domain for one DNS lookup per domain.
  const byDomain = new Map<string, InvalidRow[]>();
  for (const r of rows) {
    const dom = (r.email.split('@')[1] ?? '').toLowerCase().trim();
    if (!dom) continue;
    const arr = byDomain.get(dom) ?? [];
    arr.push(r);
    byDomain.set(dom, arr);
  }

  // Resolve MX with bounded parallelism.
  const domains = Array.from(byDomain.keys());
  const mxByDomain = new Map<string, string[]>();
  const CONCURRENCY = 20;
  for (let i = 0; i < domains.length; i += CONCURRENCY) {
    const slice = domains.slice(i, i + CONCURRENCY);
    const results = await Promise.all(slice.map(async d => [d, await resolveMxSafe(d)] as const));
    for (const [d, hosts] of results) mxByDomain.set(d, hosts);
  }

  // Build reclassification candidates.
  type Candidate = {
    id:              string;
    email:           string;
    domain:          string;
    provider:        'microsoft365-eop' | 'google-workspace' | 'proofpoint';
    providerLabel:   string;
    mx:              string[];
    original_detail: string | null;
    previous_notes:  string | null;
  };
  const candidates: Candidate[] = [];
  for (const [dom, drows] of byDomain) {
    const hosts = mxByDomain.get(dom) ?? [];
    const managed = classifyManagedMail(hosts);
    if (!managed) continue;
    for (const r of drows) {
      candidates.push({
        id:              r.id,
        email:           r.email,
        domain:          dom,
        provider:        managed.id,
        providerLabel:   managed.label,
        mx:              hosts,
        original_detail: ((r.email_check as { detail?: string } | null)?.detail) ?? null,
        previous_notes:  r.email_notes,
      });
    }
  }

  if (dryRun) {
    return NextResponse.json({
      dryRun:              true,
      invalid_rows_scanned: rows.length,
      candidates_count:    candidates.length,
      candidates,
    });
  }

  // ───── Apply reclassification ─────
  // For each candidate:
  //   1. flip email_status to Pending
  //   2. merge managedMailProvider into the existing email_check.signals
  //      (preserve every other field so we don't lose verifier history)
  //   3. append a timestamped audit line to email_notes
  let updated = 0;
  for (const c of candidates) {
    const logLine =
      `Reclassified Invalid → Pending — ${c.providerLabel} ` +
      `blocks SMTP verification from cloud IPs; mailbox not provably invalid. ` +
      `Original detail: ${c.original_detail ?? '(none)'}`;
    const result = (await sql`
      UPDATE mailing_contacts
         SET email_status = 'Pending',
             email_check  = COALESCE(email_check, '{}'::jsonb)
                            || jsonb_build_object(
                                 'signals',
                                 COALESCE(email_check->'signals', '{}'::jsonb)
                                 || jsonb_build_object('managedMailProvider', ${c.provider}::text),
                                 'reclassifiedAt',
                                 to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                               ),
             email_notes  = CONCAT_WS(
                              E'\n',
                              NULLIF(email_notes, ''),
                              CONCAT(
                                '[',
                                to_char(NOW() AT TIME ZONE 'America/Chicago', 'YYYY-MM-DD HH24:MI'),
                                '] ',
                                ${logLine}::text
                              )
                            )
       WHERE id = ${c.id}::uuid
         AND email_status = 'Invalid'
   RETURNING id
    `) as unknown as { id: string }[];
    if (result.length === 1) updated += 1;
  }

  return NextResponse.json({
    dryRun:               false,
    invalid_rows_scanned: rows.length,
    candidates_count:     candidates.length,
    reclassified_count:   updated,
    candidates,
  });
});
