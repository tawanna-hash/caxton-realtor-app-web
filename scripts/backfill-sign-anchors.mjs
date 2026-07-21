#!/usr/bin/env node
// Backfill print line-item run windows for already-signed agreements.
// Same 15th-cutoff rule as /api/sign POST: signed day ≤ 15 → first issue in
// signed month, else next month. Rewrites start_date / end_date /
// expiration_date / renewal_reminder_date / ad_timing_months / ad_timing_years
// on every print line whose parent agreement is already signed.
//
// USAGE:
//   node scripts/backfill-sign-anchors.mjs              # dry-run (default)
//   node scripts/backfill-sign-anchors.mjs --commit     # actually write
//   node scripts/backfill-sign-anchors.mjs --agreement <id> [--commit]
//
// Requires DATABASE_URL in the environment.

import { neon } from '@neondatabase/serverless';

const args = new Set(process.argv.slice(2));
const commit = args.has('--commit');
let filterAgreementId = null;
{
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--agreement');
  if (i !== -1 && argv[i + 1]) filterAgreementId = argv[i + 1];
}

const DB = process.env.DATABASE_URL;
if (!DB) {
  console.error('DATABASE_URL not set. Source .env.production.local first.');
  process.exit(1);
}
const sql = neon(DB);

const MONTH_KEYS = ['january','february','march','april','may','june','july','august','september','october','november','december'];

function freqToMonths(frequency) {
  if (!frequency) return 1;
  const m = /^(\d+)/.exec(String(frequency).trim());
  if (!m) return 1;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function pad2(n) { return n < 10 ? `0${n}` : `${n}`; }

function firstIssueMonth(signedIsoUtc) {
  const d = String(signedIsoUtc).slice(0, 10);
  const [y, m, day] = d.split('-').map(Number);
  if (!y || !m || !day) {
    const now = new Date();
    return { year: now.getUTCFullYear(), monthIdx: now.getUTCMonth() };
  }
  if (day <= 15) return { year: y, monthIdx: m - 1 };
  const next = new Date(Date.UTC(y, m, 1));
  return { year: next.getUTCFullYear(), monthIdx: next.getUTCMonth() };
}

function computePrintRun(signedIsoUtc, months) {
  const { year, monthIdx } = firstIssueMonth(signedIsoUtc);
  const startDate = new Date(Date.UTC(year, monthIdx, 1));
  const endDate = new Date(Date.UTC(year, monthIdx + months, 0));
  const remindDate = new Date(endDate.getTime());
  remindDate.setUTCDate(remindDate.getUTCDate() - 30);
  const iso = (d) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;

  const timingMonths = {};
  const timingYears = {};
  for (let i = 0; i < months; i++) {
    const cur = new Date(Date.UTC(year, monthIdx + i, 1));
    timingMonths[MONTH_KEYS[cur.getUTCMonth()]] = true;
    timingYears[MONTH_KEYS[cur.getUTCMonth()]] = String(cur.getUTCFullYear());
  }

  return {
    startIso: iso(startDate),
    endIso: iso(endDate),
    expIso: iso(endDate),
    remindIso: iso(remindDate),
    timingMonths,
    timingYears,
  };
}

console.log(`Mode: ${commit ? 'COMMIT (will write)' : 'DRY RUN (read-only)'}`);
if (filterAgreementId) console.log(`Filter: agreement ${filterAgreementId}`);
console.log('');

const agreements = filterAgreementId
  ? await sql`
      SELECT id, signed_at, status
      FROM agreements
      WHERE id = ${filterAgreementId}
        AND signed_at IS NOT NULL
    `
  : await sql`
      SELECT id, signed_at, status
      FROM agreements
      WHERE signed_at IS NOT NULL
      ORDER BY signed_at ASC
    `;

console.log(`Found ${agreements.length} signed agreement(s).`);

let touchedAgreements = 0;
let touchedLines = 0;

for (const ag of agreements) {
  const signedIso = ag.signed_at instanceof Date ? ag.signed_at.toISOString() : String(ag.signed_at);
  const lines = await sql`
    SELECT id, line_no, frequency,
           to_char(start_date, 'YYYY-MM-DD') AS start_date,
           to_char(end_date,   'YYYY-MM-DD') AS end_date,
           to_char(expiration_date, 'YYYY-MM-DD') AS expiration_date,
           to_char(renewal_reminder_date, 'YYYY-MM-DD') AS renewal_reminder_date
    FROM agreement_line_items
    WHERE agreement_id = ${ag.id} AND channel = 'print'
    ORDER BY line_no ASC
  `;
  if (lines.length === 0) continue;

  let agreementTouched = false;
  console.log(`\nAgreement ${ag.id} — signed ${signedIso.slice(0, 10)} (${ag.status})`);

  for (const li of lines) {
    const months = freqToMonths(li.frequency);
    const run = computePrintRun(signedIso, months);

    const changes = [];
    if (li.start_date !== run.startIso) changes.push(`start ${li.start_date}→${run.startIso}`);
    if (li.end_date !== run.endIso) changes.push(`end ${li.end_date}→${run.endIso}`);
    if (li.expiration_date !== run.expIso) changes.push(`exp ${li.expiration_date}→${run.expIso}`);
    if (li.renewal_reminder_date !== run.remindIso) changes.push(`remind ${li.renewal_reminder_date}→${run.remindIso}`);

    if (changes.length === 0) {
      console.log(`  line ${li.line_no} (${li.frequency}) — already anchored, skip`);
      continue;
    }
    console.log(`  line ${li.line_no} (${li.frequency}, ${months}mo): ${changes.join(' | ')}`);

    if (commit) {
      await sql`
        UPDATE agreement_line_items
        SET start_date            = ${run.startIso}::date,
            end_date              = ${run.endIso}::date,
            expiration_date       = ${run.expIso}::date,
            renewal_reminder_date = ${run.remindIso}::date,
            ad_timing_months      = ${JSON.stringify(run.timingMonths)}::jsonb,
            ad_timing_years       = ${JSON.stringify(run.timingYears)}::jsonb
        WHERE id = ${li.id}
      `;
    }
    touchedLines++;
    agreementTouched = true;
  }
  if (agreementTouched) touchedAgreements++;
}

console.log('');
console.log(`Summary: ${touchedLines} line(s) across ${touchedAgreements} agreement(s) ${commit ? 'UPDATED' : 'would be updated'}.`);
if (!commit && touchedLines > 0) {
  console.log('Re-run with --commit to apply.');
}
