import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument } from 'pdf-lib';
import { requireUser } from '@/lib/server/auth/user';
import { withErrorHandling } from '@/lib/server/error';
import { getAgentAccountDetails } from '@/lib/server/agent-account-details';
import { stampBrokerageFooter } from '@/lib/server/brokerage-footer-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Serves a form PDF with the saved brokerage row stamped along the bottom of every page. */
export const GET = withErrorHandling(async (req: NextRequest): Promise<Response> => {
  const user = await requireUser();
  const src = req.nextUrl.searchParams.get('src') ?? '';
  const name = (req.nextUrl.searchParams.get('name') ?? 'form').replace(/[^\w.-]+/g, '-').slice(0, 80);
  const download = req.nextUrl.searchParams.get('download') === '1';
  let url: URL;
  try { url = new URL(src, req.nextUrl.origin); } catch { return NextResponse.json({ error: 'Form not found.' }, { status: 400 }); }
  const sameOrigin = url.origin === req.nextUrl.origin && url.pathname.startsWith('/forms/');
  const blobHost = url.protocol === 'https:' && url.hostname.endsWith('.public.blob.vercel-storage.com');
  if (!sameOrigin && !blobHost) return NextResponse.json({ error: 'Form source not allowed.' }, { status: 400 });
  const source = await fetch(url);
  if (!source.ok) return NextResponse.json({ error: 'Could not load the form.' }, { status: 502 });
  const bytes = new Uint8Array(await source.arrayBuffer());
  let output: Uint8Array = bytes;
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    await stampBrokerageFooter(doc, await getAgentAccountDetails(user.realtorId));
    output = await doc.save();
  } catch { /* fall back to the unstamped form */ }
  return new NextResponse(Buffer.from(output), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${name}.pdf"`,
      'Cache-Control': 'private, no-store, max-age=0',
    },
  });
});
