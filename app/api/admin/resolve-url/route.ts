// app/api/admin/resolve-url/route.ts
//
// Admin-only utility endpoint to resolve a URL to its final destination
// (following redirects). Used by the hotspot editor to populate the
// tracking_url field when admin pastes a shortener URL.
//
// POST { url: string }  →  { resolved, hops, final_status }

import { NextRequest, NextResponse } from 'next/server';
import { resolveUrl } from '@/lib/url-resolver';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.myrealtyline.com';

async function isAdmin(cookieHeader: string | null): Promise<boolean> {
  if (!cookieHeader) return false;
  try {
    const r = await fetch(`${API_URL}/admin/auth/me`, {
      method: 'GET', headers: { cookie: cookieHeader }, cache: 'no-store',
    });
    return r.ok;
  } catch { return false; }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

export async function POST(req: NextRequest) {
  const cookieHeader = req.headers.get('cookie');
  if (!(await isAdmin(cookieHeader))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const input = String(body.url ?? '').trim();
  if (!input) {
    return NextResponse.json({ error: 'url required' }, { status: 400 });
  }

  try {
    const result = await resolveUrl(input, { maxHops: 8, timeoutMs: 5000 });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: 'resolve failed', detail: errMessage(err) },
      { status: 422 },
    );
  }
}
