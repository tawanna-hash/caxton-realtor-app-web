// app/api/inventory/submit/route.ts
//
// Public POST endpoint for builder/developer inventory submissions.
// Receives multipart/form-data with the flyer PDF, uploads it to Vercel Blob,
// INSERTs the inventory row (status='pending'), enqueues a thumbnail job
// for the droplet worker, and emails a notification to admin.

import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { neon } from '@neondatabase/serverless';
import {
  createBuilderInventory,
  ensureBuilderInventorySchema,
  type CreateBuilderInventoryInput,
  type Kind,
  type Publication,
  type PromoType,
} from '@/lib/builder-inventory';

const sql = neon(process.env.DATABASE_URL!);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30; // seconds — covers the PDF upload + DB inserts

const NOTIFY_TO = process.env.INVENTORY_NOTIFY_TO || 'tawanna@myrealtyline.com';
const MAX_PDF_BYTES = 25 * 1024 * 1024;

function readStr(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readInt(fd: FormData, key: string): number | null {
  const v = readStr(fd, key);
  if (v == null) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function readFloat(fd: FormData, key: string): number | null {
  const v = readStr(fd, key);
  if (v == null) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData();

    // Parse + validate required fields
    const kind = readStr(fd, 'kind') as Kind | null;
    if (kind !== 'listing' && kind !== 'promotion') {
      return NextResponse.json(
        { ok: false, error: 'Invalid kind. Must be "listing" or "promotion".' },
        { status: 400 },
      );
    }

    const publication = readStr(fd, 'publication') as Publication | null;
    if (
      publication !== 'realtyline' &&
      publication !== 'newsline' &&
      publication !== 'both'
    ) {
      return NextResponse.json(
        { ok: false, error: 'Invalid publication.' },
        { status: 400 },
      );
    }

    const required = {
      submittedByName: readStr(fd, 'submittedByName'),
      submittedByEmail: readStr(fd, 'submittedByEmail'),
      builderName: readStr(fd, 'builderName'),
      title: readStr(fd, 'title'),
      city: readStr(fd, 'city'),
    };
    for (const [key, val] of Object.entries(required)) {
      if (!val) {
        return NextResponse.json(
          { ok: false, error: `Missing required field: ${key}` },
          { status: 400 },
        );
      }
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(required.submittedByEmail!)) {
      return NextResponse.json(
        { ok: false, error: 'Submitter email is not valid.' },
        { status: 400 },
      );
    }

    // Promotion-specific required
    let promoType: PromoType | null = null;
    if (kind === 'promotion') {
      const pt = readStr(fd, 'promoType') as PromoType | null;
      const VALID: PromoType[] = ['rate_buydown', 'incentive', 'event', 'broker_bonus', 'other'];
      if (!pt || !VALID.includes(pt)) {
        return NextResponse.json(
          { ok: false, error: 'Promotion type is required for a promotion.' },
          { status: 400 },
        );
      }
      promoType = pt;
    }

    // PDF
    const pdfEntry = fd.get('flyerPdf');
    if (!(pdfEntry instanceof Blob)) {
      return NextResponse.json(
        { ok: false, error: 'Flyer PDF is required.' },
        { status: 400 },
      );
    }
    if (pdfEntry.size === 0) {
      return NextResponse.json(
        { ok: false, error: 'Flyer PDF is empty.' },
        { status: 400 },
      );
    }
    if (pdfEntry.size > MAX_PDF_BYTES) {
      return NextResponse.json(
        { ok: false, error: 'Flyer PDF exceeds 25 MB.' },
        { status: 400 },
      );
    }
    if (pdfEntry.type !== 'application/pdf') {
      return NextResponse.json(
        { ok: false, error: 'Flyer must be a PDF.' },
        { status: 400 },
      );
    }

    // Upload PDF to Vercel Blob
    // Path scheme: inventory-flyers/<timestamp>-<random>.pdf
    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2, 10);
    const safeBuilderSlug = required
      .builderName!
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
    const blobPath = `inventory-flyers/${ts}-${rand}-${safeBuilderSlug}.pdf`;

    const blob = await put(blobPath, pdfEntry, {
      access: 'public',
      contentType: 'application/pdf',
    });

    // Build CreateBuilderInventoryInput
    const sourceIp =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      null;
    const userAgent = req.headers.get('user-agent') || null;

    const input: CreateBuilderInventoryInput = {
      kind,
      publication,
      submittedByName: required.submittedByName!,
      submittedByEmail: required.submittedByEmail!,
      submittedByPhone: readStr(fd, 'submittedByPhone'),
      builderName: required.builderName!,
      title: required.title!,
      city: required.city!,
      state: readStr(fd, 'state') ?? 'TX',
      description: readStr(fd, 'description'),
      bedsMin: kind === 'listing' ? readInt(fd, 'bedsMin') : null,
      bedsMax: kind === 'listing' ? readInt(fd, 'bedsMax') : null,
      bathsMin: kind === 'listing' ? readFloat(fd, 'bathsMin') : null,
      bathsMax: kind === 'listing' ? readFloat(fd, 'bathsMax') : null,
      sqftMin: kind === 'listing' ? readInt(fd, 'sqftMin') : null,
      sqftMax: kind === 'listing' ? readInt(fd, 'sqftMax') : null,
      priceMin: kind === 'listing' ? readInt(fd, 'priceMin') : null,
      priceMax: kind === 'listing' ? readInt(fd, 'priceMax') : null,
      promoType,
      expiresAt: kind === 'promotion' ? readStr(fd, 'expiresAt') : null,
      flyerPdfUrl: blob.url,
      thumbnailUrl: null,
      sourceIp,
      userAgent,
    };

    // INSERT inventory row
    const row = await createBuilderInventory(input);

    // INSERT thumbnail job
    await ensureBuilderInventorySchema();
    await sql`
      INSERT INTO thumbnail_jobs (inventory_id, pdf_url)
      VALUES (${row.id}, ${blob.url})
    `;

    // Send admin notification email (best-effort; failure does not roll back)
    try {
      const escape = (s: string) =>
        s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
      const emailHtml = `
<!DOCTYPE html>
<html><body style="font-family: -apple-system, system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #111827;">
<h1 style="margin: 0 0 16px; font-size: 22px;">New ${escape(kind)} submission</h1>
<p style="margin: 0 0 8px; font-size: 14px;"><strong>Builder:</strong> ${escape(row.builderName)}</p>
<p style="margin: 0 0 8px; font-size: 14px;"><strong>Title:</strong> ${escape(row.title)}</p>
<p style="margin: 0 0 8px; font-size: 14px;"><strong>Location:</strong> ${escape(row.city)}, ${escape(row.state)}</p>
<p style="margin: 0 0 8px; font-size: 14px;"><strong>Publication:</strong> ${escape(row.publication)}</p>
<p style="margin: 0 0 8px; font-size: 14px;"><strong>Submitter:</strong> ${escape(row.submittedByName)} &lt;${escape(row.submittedByEmail)}&gt;</p>
${row.submittedByPhone ? `<p style="margin: 0 0 8px; font-size: 14px;"><strong>Phone:</strong> ${escape(row.submittedByPhone)}</p>` : ''}
${row.description ? `<p style="margin: 16px 0 8px; font-size: 14px;"><strong>Description:</strong></p><p style="margin: 0 0 8px; font-size: 14px; line-height: 1.5;">${escape(row.description)}</p>` : ''}
<p style="margin: 20px 0 8px;"><a href="${escape(blob.url)}" style="color: #185FA5; font-weight: 500;">View flyer PDF →</a></p>
<p style="margin: 24px 0 0; font-size: 13px; color: #6b7280;">Review at <a href="https://app.myrealtyline.com/admin/inventory" style="color: #185FA5;">/admin/inventory</a></p>
</body></html>`;

      const emailResp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'HarmonyOne <noreply@myrealtyline.com>',
          to: NOTIFY_TO,
          subject: `New ${kind} submission — ${row.builderName} / ${row.title}`,
          html: emailHtml,
        }),
      });
      if (!emailResp.ok) {
        const text = await emailResp.text().catch(() => '');
        console.error('[inventory/submit] notification email send failed:', emailResp.status, text);
      }
    } catch (emailErr) {
      console.error('[inventory/submit] notification email failed:', emailErr);
      // Continue — the submission itself succeeded.
    }

    return NextResponse.json({ ok: true, id: row.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[inventory/submit] error:', message);
    return NextResponse.json(
      { ok: false, error: 'Server error processing submission. Please try again.' },
      { status: 500 },
    );
  }
}
