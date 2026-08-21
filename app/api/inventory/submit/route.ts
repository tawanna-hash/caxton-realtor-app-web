// app/api/inventory/submit/route.ts
//
// Public POST endpoint for builder/developer inventory submissions.
// Receives multipart/form-data with the flyer PDF, uploads it to Vercel Blob,
// INSERTs the inventory row (status='pending'), enqueues a thumbnail job
// for the droplet worker, and emails a notification to admin.

import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { neon } from '@neondatabase/serverless';
import { withErrorHandling } from '@/lib/server/error';
import {
  createBuilderInventory,
  ensureBuilderInventorySchema,
  type CreateBuilderInventoryInput,
  type Kind,
  type Publication,
  type PromoType,
} from '@/lib/builder-inventory';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { getEmailProvider } from '@/lib/server/email';

const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL || '');

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30; // seconds — covers the PDF upload + DB inserts

const NOTIFY_TO = process.env.INVENTORY_NOTIFY_TO || 'tawanna@myrealtyline.com';
const MAX_PDF_BYTES = 25 * 1024 * 1024;
const MAX_IMG_BYTES = 10 * 1024 * 1024;
const ADMIN_EMAIL = 'admin:tawanna@myrealtyline.com';

// Vercel Blob host allowlist for validating URLs submitted in the
// admin JSON path.  The client uploads directly to blob.vercel-storage.com
// via @vercel/blob/client, then POSTs the resulting URLs to us.  We
// only accept URLs whose host matches this pattern so an attacker
// can't submit a row that points its image at an arbitrary URL.
const VERCEL_BLOB_HOST_RE = /\.public\.blob\.vercel-storage\.com$/;

function isVercelBlobUrl(u: string | null | undefined): boolean {
  if (!u) return false;
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== 'https:') return false;
    return VERCEL_BLOB_HOST_RE.test(parsed.hostname);
  } catch {
    return false;
  }
}

async function verifyAdmin(): Promise<boolean> {
  try {
    const admin = await getCurrentAdmin();
    return admin !== null;
  } catch {
    return false;
  }
}

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

async function handleAdminJsonSubmit(req: NextRequest): Promise<NextResponse> {
  try {
    const ok = await verifyAdmin();
    if (!ok) {
      return NextResponse.json(
        { ok: false, error: 'Admin authentication required.' },
        { status: 403 },
      );
    }

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Invalid JSON body.' },
        { status: 400 },
      );
    }

    const readB = (k: string): string | null => {
      const v = body[k];
      if (typeof v !== 'string') return null;
      const t = v.trim();
      return t.length > 0 ? t : null;
    };
    const readBInt = (k: string): number | null => {
      const v = body[k];
      if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
      if (typeof v === 'string' && v.trim()) {
        const n = parseInt(v, 10);
        return Number.isFinite(n) ? n : null;
      }
      return null;
    };
    const readBFloat = (k: string): number | null => {
      const v = body[k];
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      if (typeof v === 'string' && v.trim()) {
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : null;
      }
      return null;
    };

    const kind = readB('kind') as Kind | null;
    if (kind !== 'listing' && kind !== 'promotion') {
      return NextResponse.json(
        { ok: false, error: 'Invalid kind. Must be \"listing\" or \"promotion\".' },
        { status: 400 },
      );
    }

    const publication = readB('publication') as Publication | null;
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
      submittedByName: readB('submittedByName'),
      submittedByEmail: readB('submittedByEmail'),
      builderName: readB('builderName'),
      title: readB('title'),
      city: readB('city'),
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

    const imageUrl = readB('imageUrl');
    const flyerPdfUrl = readB('flyerPdfUrl');
    if (!imageUrl && !flyerPdfUrl) {
      return NextResponse.json(
        { ok: false, error: 'Admin submissions require either an image or a PDF.' },
        { status: 400 },
      );
    }
    // Both URLs (if present) must point at Vercel Blob storage — the
    // client is trusted to be admin, but we still don't accept arbitrary
    // externally-hosted URLs (an admin session hijack could otherwise
    // stash any URL into thumbnail_url).
    if (imageUrl && !isVercelBlobUrl(imageUrl)) {
      return NextResponse.json(
        { ok: false, error: 'imageUrl must be a Vercel Blob URL.' },
        { status: 400 },
      );
    }
    if (flyerPdfUrl && !isVercelBlobUrl(flyerPdfUrl)) {
      return NextResponse.json(
        { ok: false, error: 'flyerPdfUrl must be a Vercel Blob URL.' },
        { status: 400 },
      );
    }

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
      submittedByPhone: readB('submittedByPhone'),
      builderName: required.builderName!,
      title: required.title!,
      city: required.city!,
      state: readB('state') ?? 'TX',
      description: readB('description'),
      bedsMin: kind === 'listing' ? readBInt('bedsMin') : null,
      bedsMax: kind === 'listing' ? readBInt('bedsMax') : null,
      bathsMin: kind === 'listing' ? readBFloat('bathsMin') : null,
      bathsMax: kind === 'listing' ? readBFloat('bathsMax') : null,
      sqftMin: kind === 'listing' ? readBInt('sqftMin') : null,
      sqftMax: kind === 'listing' ? readBInt('sqftMax') : null,
      priceMin: kind === 'listing' ? readBInt('priceMin') : null,
      priceMax: kind === 'listing' ? readBInt('priceMax') : null,
      promoType: null,
      expiresAt: kind === 'promotion' ? readB('expiresAt') : null,
      flyerPdfUrl,
      thumbnailUrl: imageUrl,
      sourceIp,
      userAgent,
    };

    const row = await createBuilderInventory(input);

    // Admin JSON path is always admin mode → auto-active, skip queue.
    await ensureBuilderInventorySchema();
    await sql`
      UPDATE builder_inventory
      SET status = 'active',
          reviewed_by = ${ADMIN_EMAIL},
          reviewed_at = NOW()
      WHERE id = ${row.id}
    `;

    return NextResponse.json({ ok: true, id: row.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[inventory/submit JSON] error:', message);
    return NextResponse.json(
      { ok: false, error: 'Server error processing submission. Please try again.' },
      { status: 500 },
    );
  }
}

export const POST = withErrorHandling(async (req: NextRequest) => {
  const contentType = req.headers.get('content-type') || '';

  // -----------------------------------------------------------------
  // JSON path: admin create form uploads image + PDF directly to Blob,
  // then POSTs { imageUrl, flyerPdfUrl, ...fields } here.  No multipart,
  // no 4.5MB serverless body cap risk.
  // -----------------------------------------------------------------
  if (contentType.includes('application/json')) {
    return handleAdminJsonSubmit(req);
  }

  // -----------------------------------------------------------------
  // Multipart path (public builder submit + legacy admin fallback).
  // Original implementation — unchanged.
  // -----------------------------------------------------------------
  try {
    const fd = await req.formData();

    // Admin mode: gated by cookie auth, allows image-only promotions
    // and bypasses the pending queue (auto-active on insert).
    const isAdminMode = readStr(fd, 'mode') === 'admin';
    if (isAdminMode) {
      const ok = await verifyAdmin();
      if (!ok) {
        return NextResponse.json(
          { ok: false, error: 'Admin authentication required.' },
          { status: 403 },
        );
      }
    }

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

    // Promotion type field removed — promoType is always null in current UI.
    // The column remains in the schema for backward compat with old rows.
    const promoType: PromoType | null = null;

    // PDF — required in public mode, optional in admin mode
    const pdfEntry = fd.get('flyerPdf');
    const hasPdf = pdfEntry instanceof Blob && pdfEntry.size > 0;
    if (!isAdminMode) {
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
    }
    if (hasPdf) {
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
    }

    // Image — admin-only field. Accepted formats: jpg, png, webp.
    const imgEntry = fd.get('image');
    const hasImg = imgEntry instanceof Blob && imgEntry.size > 0;
    if (isAdminMode && !hasPdf && !hasImg) {
      return NextResponse.json(
        { ok: false, error: 'Admin submissions require either an image or a PDF.' },
        { status: 400 },
      );
    }
    if (hasImg) {
      if (imgEntry.size > MAX_IMG_BYTES) {
        return NextResponse.json(
          { ok: false, error: 'Image exceeds 10 MB.' },
          { status: 400 },
        );
      }
      const validImgTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!validImgTypes.includes(imgEntry.type)) {
        return NextResponse.json(
          { ok: false, error: 'Image must be jpg, png, or webp.' },
          { status: 400 },
        );
      }
    }

    // Upload media to Vercel Blob (PDF and/or image, depending on mode)
    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2, 10);
    const safeBuilderSlug = required
      .builderName!
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);

    let pdfUrl: string | null = null;
    if (hasPdf) {
      const pdfBlobPath = `inventory-flyers/${ts}-${rand}-${safeBuilderSlug}.pdf`;
      const pdfBlob = await put(pdfBlobPath, pdfEntry, {
        access: 'public',
        contentType: 'application/pdf',
      });
      pdfUrl = pdfBlob.url;
    }

    let imgUrl: string | null = null;
    if (hasImg) {
      const ext = imgEntry.type === 'image/png' ? 'png' : imgEntry.type === 'image/webp' ? 'webp' : 'jpg';
      const imgBlobPath = `inventory-thumbs/${ts}-${rand}-${safeBuilderSlug}.${ext}`;
      const imgBlob = await put(imgBlobPath, imgEntry, {
        access: 'public',
        contentType: imgEntry.type,
      });
      imgUrl = imgBlob.url;
    }

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
      flyerPdfUrl: pdfUrl,
      thumbnailUrl: imgUrl,
      sourceIp,
      userAgent,
    };

    // INSERT inventory row
    const row = await createBuilderInventory(input);

    // Admin mode: immediately mark active + skip queue / email / thumb job
    if (isAdminMode) {
      await ensureBuilderInventorySchema();
      await sql`
        UPDATE builder_inventory
        SET status = 'active',
            reviewed_by = ${ADMIN_EMAIL},
            reviewed_at = NOW()
        WHERE id = ${row.id}
      `;
      return NextResponse.json({ ok: true, id: row.id });
    }

    // Public mode: enqueue thumbnail extraction job
    await ensureBuilderInventorySchema();
    await sql`
      INSERT INTO thumbnail_jobs (inventory_id, pdf_url)
      VALUES (${row.id}, ${pdfUrl})
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
<p style="margin: 20px 0 8px;"><a href="${escape(pdfUrl ?? '')}" style="color: #c2410c; font-weight: 500;">View flyer PDF →</a></p>
<p style="margin: 24px 0 0; font-size: 13px; color: #6b7280;">Review at <a href="https://app.myrealtyline.com/admin/inventory" style="color: #c2410c;">/admin/inventory</a></p>
</body></html>`;

      const emailResult = await getEmailProvider().send({
        to: { email: NOTIFY_TO },
        subject: `New ${kind} submission — ${row.builderName} / ${row.title}`,
        html: emailHtml,
        text: `New ${kind} submission from ${row.builderName} (${row.title}). View at ${pdfUrl ?? '(no PDF)'}`,
        emailType: 'inventory_submission_notification',
      });
      if (!emailResult.success) {
        console.error('[inventory/submit] notification email send failed:', emailResult.error);
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
});
