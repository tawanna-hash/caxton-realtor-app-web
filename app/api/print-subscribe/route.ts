import { type PubKey } from '@/lib/pub-meta';

// Phase 2 — Print subscription POST handler
// Receives form data from /subscribe, validates the address with Google,
// stores the subscriber on Neon, sends a notification to the publisher
// and a confirmation to the subscriber.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getEmailProvider } from '@/lib/server/email';
import { escapeHtml } from '@/lib/server/email/html';
import { verifyAddressGoogle } from '@/lib/address-validation';
import { ADMIN_INBOX } from '@/lib/admin-inbox';

export const runtime = 'nodejs';

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

type SubscribePayload = {
  publication: PubKey;
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

type AddressCheckResult = {
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
      publication: b.publication as PubKey,
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
// Google Address Validation — non-blocking for print subscriptions.
// ----------------------------------------------------------------------------

async function verifyAddressWithGoogle(p: SubscribePayload): Promise<AddressCheckResult> {
  const result = await verifyAddressGoogle({
    streetAddress: p.street,
    secondaryAddress: p.address2,
    city: p.city,
    state: p.state,
    zip: p.zip,
  });
  if (!result.ok) return { ok: false, error: result.error };
  if (result.status !== 'Valid') {
    return { ok: false, rawResponse: result.evidence, error: result.detail };
  }
  return {
    ok: true,
    rawResponse: result.evidence,
    normalized: {
      streetAddress: result.normalized.streetAddress,
      secondaryAddress: result.normalized.secondaryAddress || undefined,
      city: result.normalized.city,
      state: result.normalized.state,
      ZIPCode: result.normalized.zip5,
      ZIPPlus4: result.normalized.zip4 || undefined,
    },
  };
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
      address_verified BOOLEAN NOT NULL DEFAULT FALSE,
      address_validation_response JSONB,
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
  await sql`ALTER TABLE print_subscribers ADD COLUMN IF NOT EXISTS address_verified BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`ALTER TABLE print_subscribers ADD COLUMN IF NOT EXISTS address_validation_response JSONB`;
  await sql`CREATE INDEX IF NOT EXISTS idx_print_subscribers_email ON print_subscribers (email)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_print_subscribers_pub_status ON print_subscribers (publication, status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_print_subscribers_created ON print_subscribers (created_at DESC)`;
  printSubscribersEnsured = true;
}

// ----------------------------------------------------------------------------
// Email sender (delegates to shared EmailProvider — honors EMAIL_PROVIDER,
// EMAIL_FROM_ADDRESS, EMAIL_FROM_NAME). Wrapped so the call sites below keep
// their existing ok/error shape.
// ----------------------------------------------------------------------------

async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  emailType: string;
}): Promise<{ ok: boolean; error?: string }> {
  const provider = getEmailProvider();
  const result = await provider.send({
    to: { email: opts.to },
    subject: opts.subject,
    html: opts.html,
    text: opts.text ?? '',
    replyTo: opts.replyTo,
    emailType: opts.emailType,
  });
  if (!result.success) {
    console.error('[print-subscribe] email send failed:', result.error);
    return { ok: false, error: result.error };
  }
  return { ok: true };
}

// ----------------------------------------------------------------------------
// Email templates
// ----------------------------------------------------------------------------

function pubLabel(pub: PubKey): string {
  return pub === 'realtyline' ? 'RealtyLine Austin' : 'Newsline San Antonio';
}



function notificationEmailHtml(p: SubscribePayload, usps: AddressCheckResult): string {
  const norm = usps.normalized;
  return `
<div style="font-family: -apple-system, system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #301D5D; margin: 0 0 16px;">New print subscription — ${escapeHtml(pubLabel(p.publication))}</h2>
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
    <tr><td style="padding: 6px 12px 6px 0; color: #6b7280; vertical-align: top;">Address check (Google)</td><td style="padding: 6px 0;">
      ${usps.ok
        ? `<span style="color: #c2410c;">✓ Verified</span>${norm ? `<br/><small style="color: #6b7280;">Normalized: ${escapeHtml(norm.streetAddress)}, ${escapeHtml(norm.city)}, ${escapeHtml(norm.state)} ${escapeHtml(norm.ZIPCode)}${norm.ZIPPlus4 ? '-' + escapeHtml(norm.ZIPPlus4) : ''}</small>` : ''}`
        : `<span style="color: #b91c1c;">⚠ ${escapeHtml(usps.error || 'Could not verify')}</span><br/><small style="color: #6b7280;">Review address before mailing.</small>`
      }
    </td></tr>
  </table>
  <p style="color: #9ca3af; font-size: 12px; margin: 32px 0 0; padding-top: 16px; border-top: 1px solid #e5e7eb;">
    Realty News Now subscription system — Caxton Publications, Inc.
  </p>
</div>`.trim();
}

function confirmationEmailHtml(p: SubscribePayload, usps: AddressCheckResult): string {
  const accent = p.publication === 'realtyline' ? '#301D5D' : '#301D5D';
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
    Realty News Now<br/>
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

  // Address validation (non-blocking — if Google fails, we still accept the
  // submission and flag for manual review)
  const addressResult = await verifyAddressWithGoogle(payload);

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
        address_verified, address_validation_response,
        source_ip, user_agent
      ) VALUES (
        ${payload.publication}, ${payload.firstName}, ${payload.lastName}, ${payload.name},
        ${payload.company}, ${payload.email}, ${payload.mobile}, ${payload.title},
        ${payload.licenseType || null}, ${payload.licenseNumber || null},
        ${payload.street}, ${payload.address2 || null}, ${payload.city},
        ${payload.state}, ${payload.zip},
        ${parseInt(payload.birthdayMonth, 10)}, ${parseInt(payload.birthdayDay, 10)},
        FALSE, NULL,
        ${addressResult.ok}, ${JSON.stringify(addressResult.rawResponse || addressResult.error || null)}::jsonb,
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
  const notifyTo = ADMIN_INBOX;

  const [notifyResult, confirmResult] = await Promise.all([
    sendEmail({
      to: notifyTo,
      subject: `New ${pubLabel(payload.publication)} subscriber: ${payload.name}`,
      html: notificationEmailHtml(payload, addressResult),
      replyTo: payload.email,
      emailType: 'print_subscribe_notification',
    }),
    sendEmail({
      to: payload.email,
      subject: `You're subscribed to ${pubLabel(payload.publication)}`,
      html: confirmationEmailHtml(payload, addressResult),
      emailType: 'print_subscribe_confirmation',
    }),
  ]);

  if (!notifyResult.ok) console.error('[print-subscribe] Notification email failed:', notifyResult.error);
  if (!confirmResult.ok) console.error('[print-subscribe] Confirmation email failed:', confirmResult.error);

  return NextResponse.json({
    ok: true,
    uspsVerified: false,
    addressVerified: addressResult.ok,
    emailsSent: {
      notification: notifyResult.ok,
      confirmation: confirmResult.ok,
    },
  });
}
