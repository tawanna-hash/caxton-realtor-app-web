// app/api/diag/stripe-ping/route.ts
//
// Diagnostic: locates the invalid char causing StripeConnectionError ERR_INVALID_CHAR.
// Compares raw fetch vs SDK, and dumps the secret-key char codes to find any
// stray whitespace, newline, smart quote, NBSP, etc. introduced via the Vercel UI.

import { NextResponse } from 'next/server';
import { getStripe, isStripeConfigured } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ErrInfo {
  message: string;
  type?: string;
  code?: string;
  statusCode?: number;
  requestId?: string;
  raw?: unknown;
  detailCode?: string;
}

function extractErr(err: unknown): ErrInfo {
  const out: ErrInfo = { message: err instanceof Error ? err.message : String(err) };
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    if (typeof e.type === 'string') out.type = e.type;
    if (typeof e.code === 'string') out.code = e.code;
    if (typeof e.statusCode === 'number') out.statusCode = e.statusCode;
    if (typeof e.requestId === 'string') out.requestId = e.requestId;
    if (e.raw) {
      out.raw = e.raw;
      const r = e.raw as Record<string, unknown>;
      if (r.detail && typeof r.detail === 'object') {
        const d = r.detail as Record<string, unknown>;
        if (typeof d.code === 'string') out.detailCode = d.code;
      }
    }
  }
  return out;
}

function inspectString(s: string | undefined | null, label: string) {
  if (!s) return { label, present: false };
  const codes: { i: number; ch: string; code: number; suspicious: boolean }[] = [];
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    // ASCII printable is 32..126. Anything outside = suspicious.
    const suspicious = code < 32 || code > 126;
    if (suspicious || i < 4 || i >= s.length - 4) {
      codes.push({ i, ch: suspicious ? `\\x${code.toString(16).padStart(2, '0')}` : s[i], code, suspicious });
    }
  }
  const anySuspicious = codes.some((c) => c.suspicious);
  return {
    label,
    present: true,
    length: s.length,
    starts_with: s.slice(0, 8),
    ends_with: s.slice(-4),
    any_non_ascii_char: anySuspicious,
    char_samples: codes,
  };
}

export async function GET() {
  const env_inspect = {
    STRIPE_SECRET_KEY: inspectString(process.env.STRIPE_SECRET_KEY, 'STRIPE_SECRET_KEY'),
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: inspectString(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'),
    STRIPE_WEBHOOK_SECRET: inspectString(process.env.STRIPE_WEBHOOK_SECRET, 'STRIPE_WEBHOOK_SECRET'),
    node_version: process.version,
    region: process.env.VERCEL_REGION ?? null,
  };

  if (!isStripeConfigured()) {
    return NextResponse.json({ ok: false, stage: 'config', env_inspect }, { status: 503 });
  }

  // Raw fetch (already known to work — for completeness)
  let rawFetch: { ok: boolean; status?: number; elapsedMs?: number; error?: string } = { ok: false };
  try {
    const t0 = Date.now();
    const r = await fetch('https://api.stripe.com/v1/balance', {
      method: 'GET',
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
    });
    rawFetch = { ok: r.ok, status: r.status, elapsedMs: Date.now() - t0 };
  } catch (err) {
    rawFetch = { ok: false, error: extractErr(err).message };
  }

  // SDK balance.retrieve
  let sdkBal: { ok: boolean; error?: ErrInfo; elapsedMs?: number } = { ok: false };
  try {
    const t0 = Date.now();
    const stripe = getStripe();
    await stripe.balance.retrieve();
    sdkBal = { ok: true, elapsedMs: Date.now() - t0 };
  } catch (err) {
    sdkBal = { ok: false, error: extractErr(err) };
  }

  return NextResponse.json({
    ok: rawFetch.ok && sdkBal.ok,
    env_inspect,
    raw_fetch: rawFetch,
    sdk_balance: sdkBal,
  });
}
