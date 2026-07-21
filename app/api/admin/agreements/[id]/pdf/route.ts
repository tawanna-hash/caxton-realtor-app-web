// app/api/admin/agreements/[id]/pdf/route.ts
//
// GET — Stream a PDF for the given agreement.
//
// Behavior:
//   - If the agreement has a manually-uploaded PDF attachment (any file in
//     attachments.files whose name ends in .pdf OR whose URL ends in .pdf),
//     stream that file. The most recently uploaded PDF wins, so re-uploads
//     act as replacements.
//   - Otherwise fall back to generating the system PDF via
//     generateAgreementPdfBuffer.
//
// Auth: admin required.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { generateAgreementPdfBuffer } from '@/lib/agreement-pdf';
import type { Agreement } from '@/lib/agreements';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RouteCtx = { params: Promise<{ id: string }> };

type AttachmentFile = {
  name?: string;
  size?: number;
  url?: string;
  uploadedAt?: string;
};

/**
 * Pick the best uploaded PDF attachment for this agreement, if any.
 * Prefers files whose URL or name ends with `.pdf`. Returns the most
 * recently uploaded one (by uploadedAt; falls back to array order).
 */
function pickUploadedPdf(ag: Agreement): AttachmentFile | null {
  const files: AttachmentFile[] = Array.isArray(ag.attachments?.files)
    ? (ag.attachments!.files as AttachmentFile[])
    : [];
  const pdfs = files.filter((f) => {
    const url = (f?.url ?? '').toLowerCase();
    const name = (f?.name ?? '').toLowerCase();
    return url.endsWith('.pdf') || name.endsWith('.pdf');
  });
  if (pdfs.length === 0) return null;
  // Most-recent-wins: sort by uploadedAt desc, falling back to original order.
  const sorted = [...pdfs].sort((a, b) => {
    const ta = Date.parse(a.uploadedAt ?? '') || 0;
    const tb = Date.parse(b.uploadedAt ?? '') || 0;
    return tb - ta;
  });
  return sorted[0];
}

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  try {
    await ensureSchema();
    const sql = getSql();
    const rows = (await sql`SELECT * FROM agreements WHERE id = ${id}`) as unknown as Agreement[];

    // Bundle-aware: load line items for potential future itemization.
    // The current PDF renderer does not itemize; single line-total remains.
    const lineItemRows = (await sql`
      SELECT * FROM agreement_line_items
      WHERE agreement_id = ${id}
      ORDER BY line_no ASC
    `.catch(() => [] as unknown[])) as unknown as Array<{
      line_no: number;
      channel: string;
      package_label: string;
      quantity: number;
      unit_cents: number;
      amount_cents: number;
    }>;
    void lineItemRows;
    if (rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });

    const ag = rows[0];

    // 1. If a manually uploaded PDF exists, proxy it through. We proxy
    //    (rather than redirect) so the response keeps the same content-type
    //    and Content-Disposition the caller expects, and so the download
    //    works in environments that don't follow blob redirects gracefully.
    const uploadedPdf = pickUploadedPdf(ag);
    if (uploadedPdf?.url) {
      try {
        const r = await fetch(uploadedPdf.url);
        if (r.ok) {
          const bytes = Buffer.from(await r.arrayBuffer());
          const filename = uploadedPdf.name && uploadedPdf.name.toLowerCase().endsWith('.pdf')
            ? uploadedPdf.name
            : `agreement-${id}.pdf`;
          return new NextResponse(bytes, {
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': `inline; filename="${filename.replace(/"/g, '')}"`,
              'Content-Length': String(bytes.length),
            },
          });
        }
        // Fall through to system PDF on a failed fetch.
        console.warn('[agreements/pdf] uploaded PDF fetch returned', r.status, uploadedPdf.url);
      } catch (e) {
        console.warn('[agreements/pdf] uploaded PDF fetch threw', (e instanceof Error ? e.message : String(e)));
        // Fall through to system PDF.
      }
    }

    // 2. No uploaded PDF (or fetch failed) — generate the system PDF.
    const pdfUint8 = await generateAgreementPdfBuffer(ag);
    const pdfBuffer = Buffer.from(pdfUint8);

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="agreement-${id}.pdf"`,
        'Content-Length': String(pdfBuffer.length),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'pdf generation failed', detail: msg }, { status: 500 });
  }
}
