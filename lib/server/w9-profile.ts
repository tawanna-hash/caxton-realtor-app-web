import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { getSql } from '@/lib/db';
import type { W9Data, W9Signature } from '@/lib/w9';

export type W9Profile = { data: W9Data; signature: W9Signature | null; updatedAt: string | null; updatedBy: string | null };
export type W9Partner = {
  id: number; name: string; company: string | null; publication: string | null; status: string | null;
  address: string | null; address_2: string | null; city: string | null; state: string | null; zip: string | null;
  billing_email: string | null; contact_email: string | null; w9_updated_at: string | null;
};

/** Scope 'company' is Realty News Now's own W-9; 'partner:<id>' is one partner's. */
export const companyScope = 'company';
export const partnerScope = (id: number) => `partner:${id}`;

function key(): Buffer {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured');
  return createHash('sha256').update(`w9-profile:${secret}`).digest();
}
function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}
function decrypt(blob: string): string {
  const [iv, tag, enc] = blob.split('.').map((p) => Buffer.from(p, 'base64'));
  const d = createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

let ensured = false;
async function ensure() {
  if (ensured) return;
  const sql = getSql();
  await sql`CREATE TABLE IF NOT EXISTS w9_profile (id integer PRIMARY KEY DEFAULT 1, data jsonb NOT NULL DEFAULT '{}'::jsonb, tin_encrypted text, signature jsonb, updated_at timestamptz NOT NULL DEFAULT now(), updated_by text)`;
  await sql`CREATE TABLE IF NOT EXISTS w9_profiles (scope text PRIMARY KEY, advertiser_id integer, data jsonb NOT NULL DEFAULT '{}'::jsonb, tin_encrypted text, signature jsonb, updated_at timestamptz NOT NULL DEFAULT now(), updated_by text)`;
  // Carry over the single W-9 saved before per-partner profiles existed.
  await sql`INSERT INTO w9_profiles (scope, data, tin_encrypted, signature, updated_at, updated_by)
    SELECT 'company', data, tin_encrypted, signature, updated_at, updated_by FROM w9_profile WHERE id = 1
    ON CONFLICT (scope) DO NOTHING`;
  ensured = true;
}

type Row = { data: Omit<W9Data, 'tin'>; tin_encrypted: string | null; signature: W9Signature | null; updated_at: string; updated_by: string | null };

export async function loadW9Profile(scope: string): Promise<W9Profile | null> {
  await ensure();
  const rows = (await getSql()`SELECT data, tin_encrypted, signature, updated_at, updated_by FROM w9_profiles WHERE scope = ${scope}`) as unknown as Row[];
  const r = rows[0];
  if (!r) return null;
  let tin = '';
  try { tin = r.tin_encrypted ? decrypt(r.tin_encrypted) : ''; } catch { tin = ''; }
  return { data: { ...(r.data as W9Data), tin }, signature: r.signature, updatedAt: new Date(r.updated_at).toISOString(), updatedBy: r.updated_by };
}

export async function saveW9Profile(scope: string, advertiserId: number | null, data: W9Data, signature: W9Signature | null, by: string | null) {
  await ensure();
  const { tin, ...rest } = data;
  const enc = tin ? encrypt(tin) : null;
  await getSql()`INSERT INTO w9_profiles (scope, advertiser_id, data, tin_encrypted, signature, updated_at, updated_by)
    VALUES (${scope}, ${advertiserId}, ${JSON.stringify(rest)}::jsonb, ${enc}, ${signature ? JSON.stringify(signature) : null}::jsonb, now(), ${by})
    ON CONFLICT (scope) DO UPDATE SET data = EXCLUDED.data, tin_encrypted = EXCLUDED.tin_encrypted, signature = EXCLUDED.signature, updated_at = now(), updated_by = EXCLUDED.updated_by`;
}

export async function clearW9Profile(scope: string) {
  await ensure();
  await getSql()`DELETE FROM w9_profiles WHERE scope = ${scope}`;
  if (scope === companyScope) await getSql()`DELETE FROM w9_profile WHERE id = 1`;
}

export async function listW9Partners(): Promise<W9Partner[]> {
  await ensure();
  return (await getSql()`
    SELECT a.id, a.name, a.company, a.publication, a.status, a.address, a.address_2, a.city, a.state, a.zip,
           a.billing_email, a.contact_email, p.updated_at AS w9_updated_at
      FROM advertisers a
      LEFT JOIN w9_profiles p ON p.scope = 'partner:' || a.id::text
     WHERE coalesce(a.status, 'prospect') NOT IN ('archived', 'inactive')
     ORDER BY lower(coalesce(a.company, a.name)), a.id`) as unknown as W9Partner[];
}
