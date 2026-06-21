#!/usr/bin/env tsx
/**
 * Build per-publication email-only lists.
 *
 *   pnpm tsx scripts/mailing/build-publication-email-lists.ts [--out ./out]
 *
 * Produces two CSVs, one per publication:
 *
 *   out/realtyline-emails-YYYY-MM-DD.csv   (Austin / RealtyLine)
 *   out/newsline-emails-YYYY-MM-DD.csv     (San Antonio / Newsline)
 *
 * Each CSV: email, first_name, last_name, source_table, source_segment, status
 *
 * Sources merged per publication:
 *
 *   RealtyLine (Austin):
 *     - mailing_contacts where segment in ('active-advertiser-atx','non-advertiser-atx')
 *     - mailing_contacts where stage='holding' and external_source='unlockmls' (ABOR Members)
 *     - realtors where market='austin'
 *     - newsletter_subscribers where publication='realtyline' and status='active'
 *
 *   Newsline (San Antonio):
 *     - mailing_contacts where segment in ('active-advertiser-sa','non-advertiser-sa','manual-newsline')
 *     - mailing_contacts where stage='holding' and external_source='ramco-sabor' (SABOR Members)
 *     - realtors where market='san_antonio'
 *     - newsletter_subscribers where publication='newsline' and status='active'
 *
 * Rules:
 *   - Only rows with a non-empty, syntactically valid email are emitted.
 *   - Emails are lower-cased + trimmed; duplicates within a publication are
 *     collapsed to ONE row (first source wins for first_name/last_name).
 *   - Rows with status in {'unsubscribed','bounced','suppressed'} are dropped.
 *   - A row that appears in BOTH publications is kept in both files (we
 *     don't de-dupe across publications — each list is a sendable audience).
 *
 * Requires DATABASE_URL in env (same Neon connection string the app uses).
 */

import { neon } from '@neondatabase/serverless';
import { promises as fs } from 'node:fs';
import path from 'node:path';

// ---------- helpers ----------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DROP_STATUSES = new Set(['unsubscribed', 'bounced', 'suppressed', 'inactive']);

type Row = {
  email: string;
  first_name: string;
  last_name: string;
  source_table: string;
  source_segment: string;
  status: string;
};

function normaliseEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const e = raw.trim().toLowerCase();
  if (!e || !EMAIL_RE.test(e)) return null;
  return e;
}

function toCsvField(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(rows: Row[]): string {
  const header = ['email', 'first_name', 'last_name', 'source_table', 'source_segment', 'status'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([
      toCsvField(r.email),
      toCsvField(r.first_name),
      toCsvField(r.last_name),
      toCsvField(r.source_table),
      toCsvField(r.source_segment),
      toCsvField(r.status),
    ].join(','));
  }
  return lines.join('\n') + '\n';
}

// ---------- queries ----------

type Pub = 'realtyline' | 'newsline';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchPublication(sql: any, pub: Pub): Promise<Row[]> {
  // Map publication → segment list + market label + ABOR/SABOR source.
  const config = pub === 'realtyline'
    ? {
        segments: ['active-advertiser-atx', 'non-advertiser-atx'],
        market: 'austin',
        holdingSource: 'unlockmls',
        newsletterPub: 'realtyline',
      }
    : {
        segments: ['active-advertiser-sa', 'non-advertiser-sa', 'manual-newsline'],
        market: 'san_antonio',
        holdingSource: 'ramco-sabor',
        newsletterPub: 'newsline',
      };

  const out: Row[] = [];

  // 1. mailing_contacts — stage=mailing rows for this publication's segments
  // (mailing_contacts has no status column; derive it from unsubscribed_at +
  // email_status / email_override_status).
  const mailingRows = await sql.query(
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
    [config.segments],
  ) as unknown as Array<{ email: string; first_name: string; last_name: string; segment: string; status: string }>;
  for (const r of mailingRows) {
    out.push({
      email: r.email,
      first_name: r.first_name,
      last_name: r.last_name,
      source_table: 'mailing_contacts',
      source_segment: r.segment,
      status: r.status,
    });
  }

  // 2. mailing_contacts — stage=holding ABOR or SABOR rows for this pub
  const holdingRows = await sql.query(
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
    [config.holdingSource],
  ) as unknown as Array<{ email: string; first_name: string; last_name: string; status: string }>;
  for (const r of holdingRows) {
    out.push({
      email: r.email,
      first_name: r.first_name,
      last_name: r.last_name,
      source_table: 'mailing_contacts',
      source_segment: pub === 'realtyline' ? 'abor-members' : 'sabor-members',
      status: r.status,
    });
  }

  // 3. realtors (app subscribers) — market match
  const realtorRows = await sql.query(
    `SELECT email, COALESCE(first_name,'') AS first_name,
            COALESCE(last_name,'') AS last_name,
            COALESCE(status,'active') AS status
       FROM realtors
      WHERE market = $1
        AND email IS NOT NULL AND length(trim(email)) > 0`,
    [config.market],
  ) as unknown as Array<{ email: string; first_name: string; last_name: string; status: string }>;
  for (const r of realtorRows) {
    out.push({
      email: r.email,
      first_name: r.first_name,
      last_name: r.last_name,
      source_table: 'realtors',
      source_segment: 'app-subscribers',
      status: r.status,
    });
  }

  // 4. newsletter_subscribers — publication match, active only
  const newsletterRows = await sql.query(
    `SELECT email,
            COALESCE(status,'active') AS status
       FROM newsletter_subscribers
      WHERE publication = $1
        AND status = 'active'
        AND email IS NOT NULL AND length(trim(email)) > 0`,
    [config.newsletterPub],
  ) as unknown as Array<{ email: string; status: string }>;
  for (const r of newsletterRows) {
    out.push({
      email: r.email,
      first_name: '',
      last_name: '',
      source_table: 'newsletter_subscribers',
      source_segment: 'weekly-digest',
      status: r.status,
    });
  }

  return out;
}

// ---------- dedupe + filter ----------

function dedupeAndClean(rows: Row[]): Row[] {
  const map = new Map<string, Row>();
  let dropped_invalid_email = 0;
  let dropped_status = 0;
  let collapsed = 0;
  for (const r of rows) {
    const email = normaliseEmail(r.email);
    if (!email) { dropped_invalid_email++; continue; }
    if (DROP_STATUSES.has(String(r.status).toLowerCase())) { dropped_status++; continue; }
    const existing = map.get(email);
    if (!existing) {
      map.set(email, { ...r, email });
    } else {
      collapsed++;
      // Prefer the row that has names if the first one didn't.
      if (!existing.first_name && r.first_name) existing.first_name = r.first_name;
      if (!existing.last_name && r.last_name) existing.last_name = r.last_name;
      // Append source to source_segment so the operator can see the overlap.
      if (!existing.source_segment.includes(r.source_segment)) {
        existing.source_segment = `${existing.source_segment}|${r.source_segment}`;
      }
    }
  }
  // Sort by email for deterministic output.
  const out = Array.from(map.values()).sort((a, b) => a.email.localeCompare(b.email));
  // Surface stats via a sentinel property on the array.
  (out as Row[] & { _stats?: Record<string, number> })._stats = {
    dropped_invalid_email,
    dropped_status,
    collapsed_duplicates: collapsed,
    final_unique_emails: out.length,
  };
  return out;
}

// ---------- main ----------

async function main() {
  const args = process.argv.slice(2);
  const outDirIdx = args.indexOf('--out');
  const outDir = path.resolve(outDirIdx >= 0 ? args[outDirIdx + 1] : './out');
  await fs.mkdir(outDir, { recursive: true });

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }
  const sql = neon(url);

  const today = new Date().toISOString().slice(0, 10);

  for (const pub of ['realtyline', 'newsline'] as Pub[]) {
    process.stdout.write(`\n=== ${pub.toUpperCase()} ===\n`);
    const raw = await fetchPublication(sql, pub);
    console.log(`  raw rows pulled:        ${raw.length}`);
    const clean = dedupeAndClean(raw);
    const stats = (clean as Row[] & { _stats?: Record<string, number> })._stats!;
    console.log(`  dropped invalid email:  ${stats.dropped_invalid_email}`);
    console.log(`  dropped by status:      ${stats.dropped_status}`);
    console.log(`  collapsed duplicates:   ${stats.collapsed_duplicates}`);
    console.log(`  final unique emails:    ${stats.final_unique_emails}`);

    const fname = `${pub}-emails-${today}.csv`;
    const fpath = path.join(outDir, fname);
    await fs.writeFile(fpath, rowsToCsv(clean), 'utf8');
    console.log(`  wrote: ${fpath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
