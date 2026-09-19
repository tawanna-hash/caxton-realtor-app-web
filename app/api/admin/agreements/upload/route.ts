// app/api/admin/agreements/upload/route.ts
//
// POST  multipart/form-data  { file: File, agreementId?: string }
//
// Two modes:
//   1. No agreementId  -> upload PDF/JPEG and create a NEW SIGNED agreement
//                         row (is_uploaded=true, status='signed', sign_date=today,
//                         file stored on signed_document, audit 'signed'). Used
//                         for the "Upload manually signed agreement" entry point
//                         in /admin/agreements.
//   2. With agreementId -> upload file and append it to the existing
//                          agreement's attachments.files JSONB array.
//                          Used by the agreement drawer's Attachments
//                          drop zone so files persist immediately without
//                          having to also click Save.
//
// Sanitizes filename → company_name (mirrors Pressbook agHandleUpload).

import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { extractUploadedAgreementFields } from '@/lib/server/agreement-upload-extract';
import { type Agreement, type AgreementAuditEntry } from '@/lib/agreements';
import { ensureAdvertiserForAgreement } from '@/lib/advertisers-from-agreement';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AgreementRow = {
  id: string;
  attachments: { files?: Array<Record<string, unknown>> } | null;
  [key: string]: unknown;
};

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Mirror Pressbook agHandleUpload sanitisation. */
function sanitizeFilename(filename: string): string {
  // Strip extension
  const noExt = filename.replace(/\.[^.]+$/, '');
  // Replace dashes + underscores with spaces
  const spaced = noExt.replace(/[-_]+/g, ' ');
  // Strip common noise words
  const cleaned = spaced
    .replace(/\b(agreement|draft|signed|final|copy|ad|advertising|contract)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // Title-case
  return cleaned
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export const POST = withAdminTracking(async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'invalid form data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file field required' }, { status: 400 });
  }

  const agreementIdRaw = formData.get('agreementId');
  const agreementId = typeof agreementIdRaw === 'string' && agreementIdRaw.trim() ? agreementIdRaw.trim() : null;

  try {
    // Read the file once into a Buffer — used both for the Vercel Blob
    // upload and for best-effort PDF field extraction (same for both modes).
    const buf = Buffer.from(await file.arrayBuffer());
    const blob = await put(`agreements/${Date.now()}-${file.name}`, buf, {
      access: 'public',
      contentType: file.type || 'application/octet-stream',
    });

    const attachment = {
      name:       file.name,
      size:       file.size,
      url:        blob.url,
      uploadedAt: new Date().toISOString(),
    };

    await ensureSchema();
    const sql = getSql();

    if (agreementId) {
      // Mode 2: append to existing agreement's attachments.
      const found = (await sql`
        SELECT id, attachments FROM agreements WHERE id = ${agreementId}
      `) as unknown as AgreementRow[];
      if (found.length === 0) {
        return NextResponse.json({ error: 'agreement not found' }, { status: 404 });
      }
      const current = found[0];
      const existingFiles = Array.isArray(current.attachments?.files) ? current.attachments!.files! : [];
      const nextFiles = [...existingFiles, attachment];

      const updated = (await sql`
        UPDATE agreements
        SET attachments = ${JSON.stringify({ files: nextFiles })}::jsonb,
            updated_at = NOW()
        WHERE id = ${agreementId}
        RETURNING *
      `) as unknown as AgreementRow[];

      return NextResponse.json({ agreement: updated[0], attachment }, { status: 200 });
    }

    // Mode 1: create a new SIGNED record from a manually-uploaded signed
    // document (paper / PDF / scanned JPEG). The file is stored on
    // signed_document and the row is born 'signed'. When the file is a PDF
    // with a text layer (typically the app's own generated agreement),
    // advertiser + ad details are pre-filled from the extracted text so the
    // admin drawer opens populated instead of empty. Extraction is
    // best-effort and fail-open: any parse failure yields a sparse record.
    const ext = await extractUploadedAgreementFields({
      fileName: file.name,
      mimeType: file.type,
      buffer: buf,
    });
    const f = ext.fields;
    const companyName = f.company_name ?? sanitizeFilename(file.name);
    const todayUtc = new Date().toISOString().slice(0, 10);
    const signDate = f.sign_date ?? todayUtc;
    const now = new Date().toISOString();
    const seedAudit: AgreementAuditEntry[] = [
      {
        event: 'signed',
        timestamp: now,
        user_email: admin.email ?? undefined,
        details: `Manually uploaded signed document (${file.name})`,
      },
    ];
    const filledCount = Object.keys(f).length;
    if (filledCount > 0) {
      seedAudit.push({
        event: 'note',
        timestamp: now,
        details: `Pre-filled ${filledCount} field(s) from uploaded PDF (${ext.status})`,
      });
    }
    const rows = (await sql`
      INSERT INTO agreements (
        company_name, advertiser_email, advertiser_phone,
        address, city, state, zip,
        ad_size, frequency, page_position,
        ad_rate_cents, discount_cents, ad_premium_cents, total_monthly_rate_cents,
        ad_timing_months,
        bill_to, billing_email, billing_contact_name, billing_contact_phone,
        exp_date, start_date, end_date, sign_date,
        status, is_uploaded, signed_document, signed_at,
        attachments, audit_log, created_by
      ) VALUES (
        ${companyName},
        ${f.advertiser_email ?? null},
        ${f.advertiser_phone ?? null},
        ${f.address ?? null},
        ${f.city ?? null},
        ${f.state ?? null},
        ${f.zip ?? null},
        ${f.ad_size ?? null},
        ${f.frequency ?? null},
        ${f.page_position ?? null},
        ${f.ad_rate_cents ?? null},
        ${f.discount_cents ?? null},
        ${f.ad_premium_cents ?? null},
        ${f.total_monthly_rate_cents ?? null},
        ${f.ad_timing_months ? JSON.stringify(f.ad_timing_months) : null}::jsonb,
        ${f.bill_to ?? null},
        ${f.billing_email ?? null},
        ${f.billing_contact_name ?? null},
        ${f.billing_contact_phone ?? null},
        ${f.exp_date ?? null},
        ${f.start_date ?? null},
        ${f.end_date ?? null},
        ${signDate},
        'signed',
        true,
        ${blob.url},
        NOW(),
        ${JSON.stringify({ files: [attachment] })}::jsonb,
        ${JSON.stringify(seedAudit)}::jsonb,
        ${admin.email ?? null}
      )
      RETURNING *
    `) as unknown as AgreementRow[];

    // Promote prospect → advertiser (idempotent). The sign-wizard route does
    // this via ensureAdvertiserForAgreement; mirror it here so an
    // admin-uploaded signed agreement flips its contact from prospect to
    // advertiser too (the upload path otherwise leaves status='prospect').
    try {
      await ensureAdvertiserForAgreement(rows[0] as unknown as Agreement, {
        desiredStatus: 'advertiser',
      });
    } catch (err) {
      console.warn(
        '[admin/agreements/upload POST] partner promote failed:',
        err instanceof Error ? err.message : String(err),
      );
    }

    return NextResponse.json({ agreement: rows[0], attachment, extraction: ext }, { status: 201 });
  } catch (err) {
    console.error('[admin/agreements/upload POST]', errMessage(err));
    return NextResponse.json({ error: 'upload failed', detail: errMessage(err) }, { status: 500 });
  }
});
