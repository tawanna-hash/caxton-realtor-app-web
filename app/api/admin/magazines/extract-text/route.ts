// app/api/admin/magazines/extract-text/route.ts
//
// Server-side PDF text extraction for magazine search.
//
//   POST /api/admin/magazines/extract-text
//        body: { pdf_url: string }
//        returns: { pages: string[] }
//
// Uses pdfjs-dist (which we already have for the client reader) instead
// of pdf-parse. pdf-parse depends on browser globals like DOMMatrix that
// don't exist in Vercel's Node runtime, causing intermittent failures.
// pdfjs-dist's legacy/node build works in pure Node.

import { NextRequest, NextResponse } from 'next/server';

// DOMMatrix shim for Node runtime. pdfjs-dist (even the legacy/node build)
// references DOMMatrix when parsing certain PDF content streams. The actual
// math operations don't need fidelity for text-only extraction — we just
// need the class to exist with the right method shapes so pdfjs doesn't
// throw ReferenceError. This shim provides a basic identity-matrix
// implementation that satisfies pdfjs's usage.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (typeof (globalThis as any).DOMMatrix === 'undefined') {
  class DOMMatrixShim {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    m11 = 1; m12 = 0; m13 = 0; m14 = 0;
    m21 = 0; m22 = 1; m23 = 0; m24 = 0;
    m31 = 0; m32 = 0; m33 = 1; m34 = 0;
    m41 = 0; m42 = 0; m43 = 0; m44 = 1;
    is2D = true;
    isIdentity = true;
    constructor(init?: number[] | string) {
      if (Array.isArray(init) && init.length >= 6) {
        this.a = this.m11 = init[0];
        this.b = this.m12 = init[1];
        this.c = this.m21 = init[2];
        this.d = this.m22 = init[3];
        this.e = this.m41 = init[4];
        this.f = this.m42 = init[5];
        this.isIdentity = false;
      }
    }
    multiply() { return new DOMMatrixShim(); }
    multiplySelf() { return this; }
    translate() { return new DOMMatrixShim(); }
    translateSelf() { return this; }
    scale() { return new DOMMatrixShim(); }
    scaleSelf() { return this; }
    rotate() { return new DOMMatrixShim(); }
    rotateSelf() { return this; }
    invertSelf() { return this; }
    transformPoint(p?: { x?: number; y?: number; z?: number; w?: number }) {
      return { x: p?.x ?? 0, y: p?.y ?? 0, z: p?.z ?? 0, w: p?.w ?? 1 };
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).DOMMatrix = DOMMatrixShim;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.myrealtyline.com';

async function isAdmin(cookieHeader: string | null): Promise<boolean> {
  if (!cookieHeader) return false;
  try {
    const r = await fetch(`${API_URL}/admin/auth/me`, {
      method: 'GET',
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
    return r.ok;
  } catch {
    return false;
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown';
}

// Minimal pdfjs types — surface we use.
interface PdfJsTextItem { str?: string }
interface PdfJsTextContent { items: PdfJsTextItem[] }
interface PdfJsPage {
  getTextContent: () => Promise<PdfJsTextContent>;
}
interface PdfJsDoc {
  numPages: number;
  getPage: (n: number) => Promise<PdfJsPage>;
}
interface PdfJsLib {
  getDocument: (src: { data: Uint8Array; disableFontFace?: boolean; isEvalSupported?: boolean; verbosity?: number }) => { promise: Promise<PdfJsDoc> };
}

export async function POST(req: NextRequest) {
  const cookieHeader = req.headers.get('cookie');
  if (!(await isAdmin(cookieHeader))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { pdf_url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const url = String(body.pdf_url || '').trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: 'pdf_url required (HTTPS)' }, { status: 400 });
  }

  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    return NextResponse.json({ error: 'pdf_url is not a valid URL' }, { status: 400 });
  }
  const ALLOWED = [
    /\.public\.blob\.vercel-storage\.com$/i,
    /\.vercel-storage\.com$/i,
    /^api\.myrealtyline\.com$/i,
    /^api\.realtynewsnow\.app$/i,
    /^www\.realtyline\.us$/i,
    /^www\.newslinesa\.com$/i,
  ];
  if (!ALLOWED.some((re) => re.test(host))) {
    return NextResponse.json(
      { error: `pdf_url host not allowed: ${host}` },
      { status: 400 },
    );
  }

  let pdfBuffer: Uint8Array;
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) {
      return NextResponse.json(
        { error: `failed to fetch pdf: ${r.status}` },
        { status: 502 },
      );
    }
    const arr = await r.arrayBuffer();
    pdfBuffer = new Uint8Array(arr);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: `fetch error: ${errMessage(err)}` },
      { status: 502 },
    );
  }

  const pages: string[] = [];
  try {
    // Load pdfjs-dist's legacy Node build. The "legacy" entry is the
    // ESM/CommonJS dual-build that works in older Node + Vercel runtimes.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs' as any)) as unknown as PdfJsLib;
    const doc = await pdfjs.getDocument({
      data: pdfBuffer,
      disableFontFace: true,  // avoid DOMMatrix dependency in Node
      isEvalSupported: false, // safer in serverless
      verbosity: 0,           // suppress noisy logs
    }).promise;
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      const text = tc.items
        .map((item) => (typeof item.str === 'string' ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      pages.push(text);
    }
  } catch (err: unknown) {
    const msg = errMessage(err);
    console.error('[extract-text] pdfjs extraction failed:', msg);
    return NextResponse.json(
      { error: `pdf parse failed: ${msg}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ pages, page_count: pages.length });
}
