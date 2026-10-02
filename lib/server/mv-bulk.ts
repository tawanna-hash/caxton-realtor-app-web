// lib/server/mv-bulk.ts
// MillionVerifier bulk file API helpers + results store.

import { getSql } from '@/lib/db';

const BASE = 'https://bulkapi.millionverifier.com/bulkapi/v2';

function key(): string {
  const k = process.env.MILLIONVERIFIER_API_KEY;
  if (!k) throw new Error('MILLIONVERIFIER_API_KEY is not set.');
  return k;
}

export async function ensureBulkJobsTable(): Promise<void> {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS mv_bulk_jobs (
      id          SERIAL PRIMARY KEY,
      file_id     TEXT NOT NULL,
      label       TEXT NOT NULL DEFAULT '',
      total       INTEGER NOT NULL DEFAULT 0,
      status      TEXT NOT NULL DEFAULT 'in_progress',
      percent     INTEGER NOT NULL DEFAULT 0,
      applied_at  TIMESTAMPTZ,
      summary     JSONB,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
}

export async function uploadEmails(emails: string[]): Promise<string> {
  const csv = 'email\n' + emails.join('\n') + '\n';
  const form = new FormData();
  form.append('key', key());
  form.append('file_contents', new Blob([csv], { type: 'text/csv' }), 'emails.csv');
  const res = await fetch(`${BASE}/upload?remove_duplicates=1`, { method: 'POST', body: form });
  const j = (await res.json()) as { file_id?: string | number; error?: string };
  if (j.error || j.file_id === undefined) throw new Error(j.error ?? 'Upload failed.');
  return String(j.file_id);
}

export async function fileInfo(fileId: string): Promise<{ status: string; percent: number }> {
  const res = await fetch(`${BASE}/fileinfo?key=${encodeURIComponent(key())}&file_id=${encodeURIComponent(fileId)}`, { cache: 'no-store' });
  const j = (await res.json()) as { status?: string; percent?: number; error?: string };
  if (j.error) throw new Error(j.error);
  return { status: j.status ?? 'in_progress', percent: Math.round(j.percent ?? 0) };
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

type Unified = 'valid' | 'invalid' | 'risky' | 'unknown';

function mapResult(r: string): { status: Unified; detail: string; risk: number } {
  switch (r.trim().toLowerCase()) {
    case 'ok': return { status: 'valid', detail: 'Mailbox confirmed by MillionVerifier.', risk: 5 };
    case 'catch_all': return { status: 'risky', detail: 'Domain accepts all mail (catch-all); mailbox cannot be confirmed.', risk: 50 };
    case 'invalid': return { status: 'invalid', detail: 'Mailbox does not exist.', risk: 100 };
    case 'disposable': return { status: 'invalid', detail: 'Disposable / throwaway address.', risk: 100 };
    default: return { status: 'unknown', detail: 'The mail server did not give a definite answer.', risk: 60 };
  }
}

/** Download the finished report and upsert every result into email_verifications. */
export async function applyReport(fileId: string): Promise<Record<string, number>> {
  const res = await fetch(`${BASE}/download?key=${encodeURIComponent(key())}&file_id=${encodeURIComponent(fileId)}&filter=all`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Report download failed (${res.status}).`);
  const lines = (await res.text()).split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) return {};
  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const ei = header.indexOf('email');
  const ri = header.indexOf('result');
  if (ei < 0 || ri < 0) throw new Error('Unexpected report format.');

  const emails: string[] = [];
  const statuses: string[] = [];
  const details: string[] = [];
  const risks: number[] = [];
  const summary: Record<string, number> = {};
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const email = (cols[ei] ?? '').trim().toLowerCase();
    if (!email.includes('@')) continue;
    const m = mapResult(cols[ri] ?? '');
    emails.push(email); statuses.push(m.status); details.push(m.detail); risks.push(m.risk);
    summary[m.status] = (summary[m.status] ?? 0) + 1;
  }

  const sql = getSql();
  const CHUNK = 3000;
  for (let i = 0; i < emails.length; i += CHUNK) {
    const e = emails.slice(i, i + CHUNK);
    const s = statuses.slice(i, i + CHUNK);
    const d = details.slice(i, i + CHUNK);
    const r = risks.slice(i, i + CHUNK);
    await sql`
      INSERT INTO email_verifications (email, status, sub_status, provider, verified_at, risk_score, updated_at)
      SELECT t.email, t.status, t.detail, 'millionverifier-bulk', NOW(), t.risk, NOW()
        FROM unnest(${e}::text[], ${s}::text[], ${d}::text[], ${r}::int[]) AS t(email, status, detail, risk)
      ON CONFLICT (email) DO UPDATE
        SET status = EXCLUDED.status, sub_status = EXCLUDED.sub_status,
            provider = EXCLUDED.provider, verified_at = EXCLUDED.verified_at,
            risk_score = EXCLUDED.risk_score, updated_at = NOW()`;
  }
  return summary;
}
