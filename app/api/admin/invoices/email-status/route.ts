// GET — latest Resend delivery status (delivered / opened / clicked / bounced ...)
// for invoice emails sent since Oct 18, 2026. Reads Resend's email list with the
// same per-domain API keys the app sends with, and returns one row per email.

import { NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CUTOFF = '2026-10-18T05:00:00.000Z'; // Oct 18 00:00 America/Chicago
const TTL_MS = 2 * 60 * 1000;
const diag: string[] = [];
let cache: { at: number; rows: Row[] } | null = null;

type Row = { id: string; to: string[]; subject: string; created_at: string; last_event: string };
type ListItem = { id: string; to?: string[] | string; subject?: string; created_at: string; last_event?: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function listKey(key: string): Promise<Row[]> {
  const out: Row[] = [];
  let after: string | undefined;
  for (let page = 0; page < 20; page++) {
    const url = `https://api.resend.com/emails?limit=100${after ? `&after=${after}` : ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, cache: 'no-store' });
    if (res.status === 429) { await sleep(1200); page--; continue; }
    if (!res.ok) { diag.push(`${res.status} ${(await res.text()).slice(0, 120)}`); break; }
    const j = (await res.json()) as { data?: ListItem[]; has_more?: boolean };
    const data = j.data ?? [];
    for (const e of data) {
      if (e.created_at < CUTOFF) return out;
      if (!/invoice/i.test(e.subject ?? '')) continue;
      out.push({
        id: e.id,
        to: (Array.isArray(e.to) ? e.to : e.to ? [e.to] : []).map((t) => t.toLowerCase()),
        subject: e.subject ?? '',
        created_at: e.created_at,
        last_event: e.last_event ?? 'sent',
      });
    }
    if (!j.has_more || data.length === 0) break;
    after = data[data.length - 1].id;
    await sleep(600);
  }
  return out;
}

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (cache && Date.now() - cache.at < TTL_MS) return NextResponse.json({ rows: cache.rows });
  const keys = Array.from(new Set([
    process.env.RESEND_API_KEY_MYREALTYLINE,
    process.env.RESEND_API_KEY_REALTYNEWSNOW,
    process.env.RESEND_API_KEY_NEWSLINESA,
    process.env.RESEND_API_KEY,
  ].filter((k): k is string => Boolean(k))));
  const rows: Row[] = [];
  diag.length = 0; diag.push(`keys:${keys.length}`);
  for (const k of keys) {
    try { rows.push(...(await listKey(k))); } catch { /* skip this key */ }
  }
  const seen = new Set<string>();
  const uniq = rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  cache = { at: Date.now(), rows: uniq };
  return NextResponse.json({ rows: uniq, diag });
}
