import { NextResponse } from 'next/server';
import { createHash, randomBytes } from 'node:crypto';
import { getSql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { ensureBusinessTables } from '@/lib/server/business-settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await getCurrentAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await ensureBusinessTables();
  const keys = await getSql()`SELECT id, name, key_prefix, created_by, created_at, last_used_at FROM admin_api_keys WHERE revoked_at IS NULL ORDER BY created_at DESC`;
  return NextResponse.json({ keys });
}

// The full key is returned once, here. Only its SHA-256 hash is stored.
export async function POST(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const name = (body.name ?? '').trim().slice(0, 80);
  if (!name) return NextResponse.json({ error: 'Name the key so you can recognize it later.' }, { status: 400 });
  await ensureBusinessTables();
  const key = `rnn_live_${randomBytes(24).toString('base64url')}`;
  const hash = createHash('sha256').update(key).digest('hex');
  const rows = (await getSql()`INSERT INTO admin_api_keys (name, key_prefix, key_hash, created_by) VALUES (${name}, ${key.slice(0, 13)}, ${hash}, ${admin.email ?? null}) RETURNING id`) as unknown as Array<{ id: string }>;
  return NextResponse.json({ ok: true, id: rows[0].id, key }, { status: 201 });
}
