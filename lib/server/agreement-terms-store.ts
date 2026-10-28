// lib/server/agreement-terms-store.ts
//
// Dated versions of the Advertising Agreement Terms. An agreement uses the
// version in effect when it was signed; unsigned agreements use the version in
// effect now. Falls back to the terms in code if the database is unavailable.

import { getSql } from '@/lib/db';
import { ADVERTISING_TERMS, LEGACY_ADVERTISING_TERMS, TERMS_UPDATE_CUTOFF } from '@/lib/agreement-terms';

export type TermsVersion = {
  id: number;
  body: string;
  effective_at: string;
  note: string;
  created_by: string;
  created_at: string;
};

let ready = false;
async function ensure(sql: ReturnType<typeof getSql>) {
  if (ready) return;
  await sql`CREATE TABLE IF NOT EXISTS agreement_terms_versions (
    id serial PRIMARY KEY,
    body text NOT NULL,
    effective_at timestamptz NOT NULL,
    note text NOT NULL DEFAULT '',
    created_by text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now())`;
  const c = (await sql`SELECT count(*)::int AS n FROM agreement_terms_versions`) as unknown as Array<{ n: number }>;
  if (!c[0] || c[0].n === 0) {
    await sql`INSERT INTO agreement_terms_versions (body, effective_at, note, created_by) VALUES
      (${LEGACY_ADVERTISING_TERMS}, '1970-01-01T00:00:00Z', 'Original terms', 'system'),
      (${ADVERTISING_TERMS}, ${TERMS_UPDATE_CUTOFF}, 'ACH and buy now pay later update', 'system')`;
  }
  ready = true;
}

const FALLBACK = (): Array<{ body: string; effective_at: string }> => [
  { body: LEGACY_ADVERTISING_TERMS, effective_at: '1970-01-01T00:00:00Z' },
  { body: ADVERTISING_TERMS, effective_at: TERMS_UPDATE_CUTOFF },
];

export async function getTermsVersions(): Promise<TermsVersion[]> {
  const sql = getSql();
  await ensure(sql);
  const rows = (await sql`SELECT id, body, effective_at, note, created_by, created_at
    FROM agreement_terms_versions ORDER BY effective_at DESC, id DESC`) as unknown as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: Number(r.id),
    body: String(r.body),
    effective_at: new Date(r.effective_at as string).toISOString(),
    note: String(r.note ?? ''),
    created_by: String(r.created_by ?? ''),
    created_at: new Date(r.created_at as string).toISOString(),
  }));
}

export async function addTermsVersion(body: string, effectiveAt: Date, note: string, admin: string): Promise<void> {
  const sql = getSql();
  await ensure(sql);
  await sql`INSERT INTO agreement_terms_versions (body, effective_at, note, created_by)
            VALUES (${body}, ${effectiveAt.toISOString()}, ${note}, ${admin})`;
}

/** Terms text in effect at signedAt (or now when unsigned). Never throws. */
export async function termsTextFor(signedAt?: string | Date | null): Promise<string> {
  const when = signedAt ? new Date(signedAt).getTime() : Date.now();
  const at = Number.isFinite(when) ? when : Date.now();
  let versions: Array<{ body: string; effective_at: string }>;
  try {
    versions = await getTermsVersions();
  } catch {
    versions = FALLBACK().reverse();
  }
  // versions are newest effective first
  const hit = versions.find((v) => new Date(v.effective_at).getTime() <= at);
  return (hit ?? versions[versions.length - 1] ?? { body: ADVERTISING_TERMS }).body;
}
