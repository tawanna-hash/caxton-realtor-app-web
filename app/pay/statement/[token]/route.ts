// Online payment links have been removed. This page only explains that.
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function page() {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Payment</title></head><body style="margin:0;background:#F5F4F9;font-family:Arial,sans-serif;color:#262626"><div style="max-width:460px;margin:12vh auto;background:#fff;border-radius:14px;padding:28px"><div style="font-size:12px;letter-spacing:.08em;color:#6b6b6b">CAXTON PUBLICATIONS, INC.</div><h1 style="font-size:20px;color:#301D5D;margin:10px 0 12px">Online payment is not available</h1><p style="font-size:14px;line-height:1.5">Please contact us to arrange payment by check.</p></div></body></html>`;
  return new NextResponse(html, { status: 410, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

export async function GET() {
  return page();
}

export async function POST() {
  return page();
}
