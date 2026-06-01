// app/api/sign/[token]/pdf/route.ts
//
// Token-authenticated PDF download for the public sign wizard.
// Uses verifyToken (HMAC) instead of admin session auth.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { verifyToken } from '@/lib/sign-token';
import { generateAgreementPdfBuffer } from '@/lib/agreement-pdf';
import type { Agreement } from '@/lib/agreements';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ token: string }> };

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const { token } = await ctx.params;
  const parsed = verifyToken(token);
  if (!parsed) return NextResponse.json({ error: 'invalid or expired token' }, { status: 401 });

  try {
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`SELECT * FROM agreements WHERE id = ${parsed.agreementId}` as unknown as Agreement[];
    if (rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });

    const pdfUint8 = await generateAgreementPdfBuffer(rows[0]);
    const pdfBuffer = Buffer.from(pdfUint8);

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="agreement-${parsed.agreementId}.pdf"`,
        'Content-Length': String(pdfBuffer.length),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'pdf generation failed', detail: msg }, { status: 500 });
  }
}
