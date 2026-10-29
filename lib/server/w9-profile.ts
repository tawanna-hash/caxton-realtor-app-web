import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { getSql } from '@/lib/db';
import type { W9Data, W9Signature } from '@/lib/w9';

export type W9Profile = { data: W9Data; signature: W9Signature | null; updatedAt: string | null; updatedBy: string | null };

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
  await getSql()`CREATE TABLE IF NOT EXISTS w9_profile (id integer PRIMARY KEY DEFAULT 1, data jsonb NOT NULL DEFAULT '{}'::jsonb, tin_encrypted text, signature jsonb, updated_at timestamptz NOT NULL DEFAULT now(), updated_by text)`;
  ensured = true;
}

export async function loadW9Profile(): Promise<W9Profile | null> {
  await ensure();
  const rows = (await getSql()`SELECT data, tin_encrypted, signature, updated_at, updated_by FROM w9_profile WHERE id = 1`) as unknown as Array<{
    data: Omit<W9Data, 'tin'>; tin_encrypted: string | null; signature: W9Signature | null; updated_at: string; updated_by: string | null;
  }>;
  const r = rows[0];
  if (!r) return null;
  let tin = '';
  try { tin = r.tin_encrypted ? decrypt(r.tin_encrypted) : ''; } catch { tin = ''; }
  return { data: { ...(r.data as W9Data), tin }, signature: r.signature, updatedAt: new Date(r.updated_at).toISOString(), updatedBy: r.updated_by };
}

export async function saveW9Profile(data: W9Data, signature: W9Signature | null, by: string | null) {
  await ensure();
  const { tin, ...rest } = data;
  const enc = tin ? encrypt(tin) : null;
  await getSql()`INSERT INTO w9_profile (id, data, tin_encrypted, signature, updated_at, updated_by)
    VALUES (1, ${JSON.stringify(rest)}::jsonb, ${enc}, ${signature ? JSON.stringify(signature) : null}::jsonb, now(), ${by})
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, tin_encrypted = EXCLUDED.tin_encrypted, signature = EXCLUDED.signature, updated_at = now(), updated_by = EXCLUDED.updated_by`;
}

export async function clearW9Profile() {
  await ensure();
  await getSql()`DELETE FROM w9_profile WHERE id = 1`;
}
