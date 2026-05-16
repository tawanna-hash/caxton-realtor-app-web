// Phase 2 — Print subscription POST handler
// Receives form data from /subscribe, validates the address against USPS,
// stores the subscriber on Neon, sends a notification to the publisher
// and a confirmation to the subscriber.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';

export const runtime = 'nodejs';

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

type SubscribePayload = {
  publication: 'realtyline' | 'newsline';
  firstName: string;
  lastName: string;
  name: string;            // server-derived: firstName + ' ' + lastName
  company: string;
  email: string;
  mobile: string;
  title: string;
  licenseType?: 'TREC' | 'NMLS' | '';
  licenseNumber?: string;
  street: string;
  address2?: string;
  city: string;
  state: string;
  zip: string;
  birthdayMonth: string;
  birthdayDay: string;
};

type UspsVerifyResult = {
  ok: boolean;
  normalized?: {
    streetAddress: string;
    secondaryAddress?: string;
    city: string;
    state: string;
    ZIPCode: string;
    ZIPPlus4?: string;
  };
  rawResponse?: unknown;
  error?: string;
};

// ----------------------------------------------------------------------------
// Validation
// ----------------------------------------------------------------------------

function validatePayload(body: unknown): { ok: true; data: SubscribePayload } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid request body' };

  const b = body as Record<string, unknown>;

  const requiredStrings = [
    'publication', 'firstName', 'lastName', 'company', 'email', 'mobile', 'title',
    'street', 'city', 'state', 'zip', 'birthdayMonth', 'birthdayDay',
  ];
  for (const k of requiredStrings) {
    if (typeof b[k] !== 'string' || !(b[k] as string).trim()) {
      return { ok: false, error: `Missing or invalid field: ${k}` };
    }
  }

  if (b.publication !== 'realtyline' && b.publication !== 'newsline') {
    return { ok: false, error: `Invalid publication: ${b.publication}` };
  }

  if (typeof b.email === 'string' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)) {
    return { ok: false, error: 'Invalid email format' };
  }

  if (typeof b.zip === 'string' && !/^\d{5}(-\d{4})?$/.test(b.zip)) {
    return { ok: false, error: 'Invalid ZIP code' };
  }

  const month = parseInt(b.birthdayMonth as string, 10);
  const day = parseInt(b.birthdayDay as string, 10);
  if (!Number.isFinite(month) || month < 1 || month > 12) {
    return { ok: false, error: 'Invalid birthday month' };
  }
  if (!Number.isFinite(day) || day < 1 || day > 31) {
    return { ok: false, error: 'Invalid birthday day' };
  }

  const firstName = (b.firstName as string).trim();
  const lastName = (b.lastName as string).trim();

  return {
    ok: true,
    data: {
      publication: b.publication as 'realtyline' | 'newsline',
      firstName,
      lastName,
      name: `${firstName} ${lastName}`,
      company: (b.company as string).trim(),
      email: (b.email as string).trim().toLowerCase(),
      mobile: (b.mobile as string).trim(),
      title: (b.title as string).trim(),
      licenseType: (b.licenseType as 'TREC' | 'NMLS' | '' | undefined) || '',
      licenseNumber: typeof b.licenseNumber === 'string' ? b.licenseNumber.trim() : '',
      street: (b.street as string).trim(),
      address2: typeof b.address2 === 'string' ? b.address2.trim() : '',
      city: (b.city as string).trim(),
      state: ((b.state as string).trim()).toUpperCase(),
      zip: (b.zip as string).trim(),
      birthdayMonth: String(month).padStart(2, '0'),
      birthdayDay: String(day).padStart(2, '0'),
    },
  };
}

// ----------------------------------------------------------------------------
// USPS — OAuth token + Addresses v3 verify
// ----------------------------------------------------------------------------

// Tokens last ~8 hours per USPS docs. Cache in module memory so warm functions
// reuse it. Cold starts fetch a new token.
let cachedUspsToken: { token: string; expiresAt: number } | null = null;

async function getUspsToken(): Promise<string | null> {
  const now = Date.now();
  if (cachedUspsToken && cachedUspsToken.expiresAt > now + 60_000) {
    return cachedUspsToken.token;
  }

  const consumerKey = process.env.USPS_CONSUMER_KEY;
  const consumerSecret = process.env.USPS_CONSUMER_SECRET;
  if (!consumerKey || !consumerSecret) {
    console.warn('[USPS] Consumer key/secret not set; skipping address verification');
    return null;
  }

  try {
    const resp = await fetch('https://apis.usps.com/oauth2/v3/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: consumerKey,
        client_secret: consumerSecret,
      }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      console.error('[USPS] OAuth token request failed:', resp.status, text);
      return null;
    }
    const data = (await resp.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) {
      console.error('[USPS] OAuth response missing access_token');
      return null;
    }
    cachedUspsToken = {
      token: data.access_token,
      expiresAt: now + (data.expires_in ?? 28_800) * 1_000,
    };
    return cachedUspsToken.token;
  } catch (err) {
    console.error('[USPS] OAuth token fetch error:', err);
    return null;
  }
}

async function verifyAddressWithUsps(p: SubscribePayload): Promise<UspsVerifyResult> {
  const token = await getUspsToken();
  if (!token) {
    return { ok: false, error: 'USPS not configured' };
  }

  const params = new URLSearchParams({
    streetAddress: p.street,
    city: p.city,
    state: p.state,
    ZIPCode: p.zip.split('-')[0],
  });
  if (p.address2) params.set('secondaryAddress', p.address2);

  try {
    const resp = await fetch(`https://apis.usps.com/addresses/v3/address?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const raw = await resp.json().catch(() => null);
    if (!resp.ok) {
      return { ok: false, rawResponse: raw, error: `USPS HTTP ${resp.status}` };
    }
    if (!raw || typeof raw !== 'object' || !('address' in raw)) {
      return { ok: false, rawResponse: raw, error: 'USPS response missing address' };
    }
    const addr = (raw as { address: UspsVerifyResult['normalized'] }).address;
    return { ok: true, normalized: addr, rawResponse: raw };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown' };
  }
}

// ----------------------------------------------------------------------------
// Schema (Neon) — extends events DB
// ----------------------------------------------------------------------------

let printSubscribersEnsured = false;

async function ensurePrintSubscribersTable() {
  if (printSubscribersEnsured) return;
  await ensureSchema(); // base events schema
  const sql = getSql();
  // SERIAL id chosen to match every other Neon table in this app (events,
  // magazines, ad_*). No pgcrypto dependency.
  await sql`
    CREATE TABLE IF NOT EXISTS print_subscribers (
      id              SERIAL PRIMARY KEY,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      publication     TEXT NOT NULL CHECK (publication IN ('realtyline','newsline')),
      name            TEXT NOT NULL,
      company         TEXT NOT NULL,
      email           TEXT NOT NULL,
      mobile          TEXT NOT NULL,
      title           TEXT NOT NULL,
      license_type    TEXT,
      license_number  TEXT,
      street          TEXT NOT NULL,
      address2        TEXT,
      city            TEXT NOT NULL,
      state           TEXT NOT NULL,
      zip             TEXT NOT NULL,
      birthday_month  INT NOT NULL,
      birthday_day    INT NOT NULL,
      usps_verified   BOOLEAN NOT NULL DEFAULT FALSE,
      usps_response   JSONB,
      status          TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','active','cancelled')),
      source_ip       TEXT,
      user_agent      TEXT
    )
  `;
  // Backward-compatible split: name column stays NOT NULL for existing rows;
  // first_name / last_name added as nullable. New inserts populate all three.
  await sql`ALTER TABLE print_subscribers ADD COLUMN IF NOT EXISTS first_name TEXT`;
  await sql`ALTER TABLE print_subscribers ADD COLUMN IF NOT EXISTS last_name  TEXT`;
  await sql`CREATE INDEX IF NOT EXISTS idx_print_subscribers_email ON print_subscribers (email)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_print_subscribers_pub_status ON print_subscribers (publication, status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_print_subscribers_created ON print_subscribers (created_at DESC)`;
  printSubscribersEnsured = true;
}

// ----------------------------------------------------------------------------
// Resend — email sender
// ----------------------------------------------------------------------------

async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: 'RESEND_API_KEY not configured' };

  const from = process.env.RESEND_FROM_ADDRESS || 'SnapNews24 <noreply@myrealtyline.com>';

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
      }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      console.error('[Resend] Send failed:', resp.status, text);
      return { ok: false, error: `Resend HTTP ${resp.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error('[Resend] Send error:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'unknown' };
  }
}

// ----------------------------------------------------------------------------
// Email templates
// ----------------------------------------------------------------------------

function pubLabel(pub: 'realtyline' | 'newsline'): string {
  return pub === 'realtyline' ? 'RealtyLine (Austin)' : 'Newsline (San Antonio)';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function notificationEmailHtml(p: SubscribePayload, usps: UspsVerifyResult): string {
  const norm = usps.normalized;
  return `
<div style="font-family: -apple-system, system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #1a2a44; margin: 0 0 16px;">New print subscription — ${escapeHtml(pubLabel(p.publication))}</h2>
  <p style="color: #6b7280; font-size: 14px; margin: 0 0 24px;">
    Submitted at ${new Date().toISOString()}
  </p>
  <table style="border-collapse: collapse; width: 100%; font-size: 14px;">
    <tr><td style="padding: 6px 12px 6px 0; color: #6b7280; vertical-align: top;">Name</td><td style="padding: 6px 0;"><strong>${escapeHtml(p.name)}</strong></td></tr>
    <tr><td style="padding: 6px 12px 6px 0; color: #6b7280; vertical-align: top;">Company</td><td style="padding: 6px 0;">${escapeHtml(p.company)}</td></tr>
    <tr><td style="padding: 6px 12px 6px 0; color: #6b7280; vertical-align: top;">Title</td><td style="padding: 6px 0;">${escapeHtml(p.title)}</td></tr>
    <tr><td style="padding: 6px 12px 6px 0; color: #6b7280; vertical-align: top;">Email</td><td style="padding: 6px 0;"><a href="mailto:${escapeHtml(p.email)}">${escapeHtml(p.email)}</a></td></tr>
    <tr><td style="padding: 6px 12px 6px 0; color: #6b7280; vertical-align: top;">Mobile</td><td style="padding: 6px 0;">${escapeHtml(p.mobile)}</td></tr>
    ${p.licenseType ? `<tr><td style="padding: 6px 12px 6px 0; color: #6b7280; vertical-align: top;">License</td><td style="padding: 6px 0;">${escapeHtml(p.licenseType)} — ${escapeHtml(p.licenseNumber || '')}</td></tr>` : ''}
    <tr><td style="padding: 6px 12px 6px 0; color: #6b7280; vertical-align: top;">Birthday</td><td style="padding: 6px 0;">${p.birthdayMonth}/${p.birthdayDay}</td></tr>
    <tr><td style="padding: 18px 12px 6px 0; color: #6b7280; vertical-align: top;">Mailing address</td><td style="padding: 18px 0 6px 0;">
      <strong>${escapeHtml(p.name)}</strong><br/>
      ${escapeHtml(p.street)}${p.address2 ? '<br/>' + escapeHtml(p.address2) : ''}<br/>
      ${escapeHtml(p.city)}, ${escapeHtml(p.state)} ${escapeHtml(p.zip)}
    </td></tr>
    <tr><td style="padding: 6px 12px 6px 0; color: #6b7280; vertical-align: top;">USPS check</td><td style="padding: 6px 0;">
      ${usps.ok
        ? `<span style="color: #15803d;">✓ Verified</span>${norm ? `<br/><small style="color: #6b7280;">Normalized: ${escapeHtml(norm.streetAddress)}, ${escapeHtml(norm.city)}, ${escapeHtml(norm.state)} ${escapeHtml(norm.ZIPCode)}${norm.ZIPPlus4 ? '-' + escapeHtml(norm.ZIPPlus4) : ''}</small>` : ''}`
        : `<span style="color: #b91c1c;">⚠ ${escapeHtml(usps.error || 'Could not verify')}</span><br/><small style="color: #6b7280;">Review address before mailing.</small>`
      }
    </td></tr>
  </table>
  <p style="color: #9ca3af; font-size: 12px; margin: 32px 0 0; padding-top: 16px; border-top: 1px solid #e5e7eb;">
    SnapNews24 subscription system — Caxton Publications, Inc.
  </p>
</div>`.trim();
}

function confirmationEmailHtml(p: SubscribePayload, usps: UspsVerifyResult): string {
  const accent = p.publication === 'realtyline' ? '#1a2a44' : '#3D0740';
  const norm = usps.normalized;
  return `
<div style="font-family: -apple-system, system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px;">
  <p style="color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 8px;">${escapeHtml(pubLabel(p.publication))}</p>
  <h1 style="color: #111827; margin: 0 0 20px; font-size: 28px;">You're on the list, ${escapeHtml(p.firstName)}.</h1>
  <p style="color: #374151; font-size: 16px; line-height: 1.6;">
    Thanks for subscribing to <strong>${escapeHtml(pubLabel(p.publication))}</strong>. We've received your request and we'll mail your first issue within the next few weeks.
  </p>
  <div style="background: #f9fafb; border-left: 4px solid ${accent}; padding: 16px 20px; margin: 24px 0;">
    <p style="color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px;">Mailing to</p>
    <p style="color: #111827; font-size: 15px; line-height: 1.5; margin: 0;">
      <strong>${escapeHtml(p.name)}</strong><br/>
      ${norm ? escapeHtml(norm.streetAddress) : escapeHtml(p.street)}${(norm?.secondaryAddress || p.address2) ? '<br/>' + escapeHtml(norm?.secondaryAddress || p.address2 || '') : ''}<br/>
      ${escapeHtml(norm?.city || p.city)}, ${escapeHtml(norm?.state || p.state)} ${escapeHtml(norm?.ZIPCode || p.zip)}${norm?.ZIPPlus4 ? '-' + escapeHtml(norm.ZIPPlus4) : ''}
    </p>
  </div>
  <p style="color: #374151; font-size: 16px; line-height: 1.6;">
    Need to update your information or unsubscribe? Just reply to this email and we'll take care of it.
  </p>
  <p style="color: #9ca3af; font-size: 12px; margin: 40px 0 0; padding-top: 20px; border-top: 1px solid #e5e7eb;">
    SnapNews24<br/>
    a Caxton Publications, Inc. brand<br/>
    P.O. Box 81366, Austin, TX 78708-1366<br/>
    (512) 965-0057
  </p>
</div>`.trim();
}

// ----------------------------------------------------------------------------
// Route handler
// ----------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  // Validate payload
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const validation = validatePayload(body);
  if (!validation.ok) {
    return NextResponse.json({ ok: false, error: validation.error }, { status: 400 });
  }
  const payload = validation.data;

  // USPS verification (non-blocking — if USPS fails, we still accept the
  // submission and flag for manual review)
  const uspsResult = await verifyAddressWithUsps(payload);

  // DB insert
  try {
    await ensurePrintSubscribersTable();
    const sql = getSql();
    const sourceIp =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      null;
    const userAgent = req.headers.get('user-agent') || null;

    await sql`
      INSERT INTO print_subscribers (
        publication, first_name, last_name, name,
        company, email, mobile, title,
        license_type, license_number,
        street, address2, city, state, zip,
        birthday_month, birthday_day,
        usps_verified, usps_response,
        source_ip, user_agent
      ) VALUES (
        ${payload.publication}, ${payload.firstName}, ${payload.lastName}, ${payload.name},
        ${payload.company}, ${payload.email}, ${payload.mobile}, ${payload.title},
        ${payload.licenseType || null}, ${payload.licenseNumber || null},
        ${payload.street}, ${payload.address2 || null}, ${payload.city},
        ${payload.state}, ${payload.zip},
        ${parseInt(payload.birthdayMonth, 10)}, ${parseInt(payload.birthdayDay, 10)},
        ${uspsResult.ok}, ${JSON.stringify(uspsResult.rawResponse || uspsResult.error || null)}::jsonb,
        ${sourceIp}, ${userAgent}
      )
    `;
  } catch (err) {
    console.error('[print-subscribe] DB insert failed:', err);
    return NextResponse.json(
      { ok: false, error: 'Could not save subscription. Please try again.' },
      { status: 500 },
    );
  }

  // Send emails (best-effort — log failures but don't fail the request)
  const notifyTo = process.env.SUBSCRIBE_NOTIFY_TO || 'subscribe@myrealtyline.com';

  const [notifyResult, confirmResult] = await Promise.all([
    sendEmail({
      to: notifyTo,
      subject: `New ${pubLabel(payload.publication)} subscriber: ${payload.name}`,
      html: notificationEmailHtml(payload, uspsResult),
      replyTo: payload.email,
    }),
    sendEmail({
      to: payload.email,
      subject: `You're subscribed to ${pubLabel(payload.publication)}`,
      html: confirmationEmailHtml(payload, uspsResult),
    }),
  ]);

  if (!notifyResult.ok) console.error('[print-subscribe] Notification email failed:', notifyResult.error);
  if (!confirmResult.ok) console.error('[print-subscribe] Confirmation email failed:', confirmResult.error);

  return NextResponse.json({
    ok: true,
    uspsVerified: uspsResult.ok,
    emailsSent: {
      notification: notifyResult.ok,
      confirmation: confirmResult.ok,
    },
  });
}
