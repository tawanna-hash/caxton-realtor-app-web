// app/api/admin/magazines/extract-text/route.ts
//
// Server-side PDF text extraction for magazine search.
//
//   POST /api/admin/magazines/extract-text
//        body: { pdf_url: string }
//        returns: { pages: string[] }

import { NextRequest, NextResponse } from 'next/server';

// pdf-parse is a Node-only library. We narrow its surface to what we use.
// Install: npm install pdf-parse @types/pdf-parse
interface PdfTextItem {
  str?: string;
}
interface PdfTextContent {
  items: PdfTextItem[];
}
interface PdfPageData {
  getTextContent: (opts: {
    normalizeWhitespace: boolean;
    disableCombineTextItems: boolean;
  }) => Promise<PdfTextContent>;
}
interface PdfParseOptions {
  pagerender?: (pageData: PdfPageData) => Promise<string>;
}
type PdfParseResult = Record<string, unknown>;

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

  let pdfBuffer: Buffer;
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) {
      return NextResponse.json(
        { error: `failed to fetch pdf: ${r.status}` },
        { status: 502 },
      );
    }
    const arr = await r.arrayBuffer();
    pdfBuffer = Buffer.from(arr);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: `fetch error: ${errMessage(err)}` },
      { status: 502 },
    );
  }

  const pages: string[] = [];
  try {
    // Lazy-load pdf-parse to avoid evaluating it at module-load time, which
    // breaks Vercel builds (the package's auto-init tries to load @napi-rs/canvas
    // and falls back to PDF.js polyfills that need DOMMatrix in Node).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse: (buf: Buffer, opts?: PdfParseOptions) => Promise<PdfParseResult> = require('pdf-parse');
    await pdfParse(pdfBuffer, {
      pagerender: async (pageData) => {
        const textContent = await pageData.getTextContent({
          normalizeWhitespace: true,
          disableCombineTextItems: false,
        });
        const strings: string[] = [];
        for (const item of textContent.items) {
          if (typeof item.str === 'string') strings.push(item.str);
        }
        const pageText = strings.join(' ').replace(/\s+/g, ' ').trim();
        pages.push(pageText);
        return pageText;
      },
    });
  } catch (err: unknown) {
    const msg = errMessage(err);
    console.error('[extract-text] pdf-parse failed:', msg);
    return NextResponse.json(
      { error: `pdf parse failed: ${msg}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ pages, page_count: pages.length });
}
