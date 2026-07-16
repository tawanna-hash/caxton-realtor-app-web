// tests/e2e/06-marketing-attachments.spec.ts
//
// Logic-level smoke tests for the marketing-email attachment pipeline.
// These exercise the pure render + resolver functions directly (no live
// server, no DB, no real Resend), mocking global fetch for the HEAD
// preflight. Run with PLAYWRIGHT_NO_SERVER=1 so no Next server spins up.
//
// Covers the fix for the missing Blob link + Resend URL passthrough:
//   (a) email HTML contains an <a href="https://…blob.vercel-storage.com/…">
//       for each attachment
//   (b) attachments[0].path is populated with the Blob URL (passthrough)
//   (c) all-attachments-failed → callers should 502 (allAttachmentsFailed)
//   (d) a file over 40MB renders the link but skips the real attachment

import { test, expect } from '@playwright/test';
import { renderEmail, type AttachmentLink } from '@/lib/marketing-email';
import {
  resolveAttachmentsForSend,
  allAttachmentsFailed,
  RESEND_MAX_ATTACHMENT_BYTES,
} from '@/lib/server/marketing-attachments';

const BLOB = 'https://acme.public.blob.vercel-storage.com';

type FetchResponse = { ok: boolean; status: number; headers: { get: (h: string) => string | null } };

// Install a fake global.fetch that answers HEAD requests from a routing
// table keyed by URL. Returns a restore function.
function stubFetch(table: Record<string, { status: number; size?: number }>) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const entry = table[url];
    if (!entry) return { ok: false, status: 404, headers: { get: () => null } } as FetchResponse;
    const headers = {
      get: (h: string) => (h.toLowerCase() === 'content-length' && entry.size != null ? String(entry.size) : null),
    };
    return { ok: entry.status >= 200 && entry.status < 300, status: entry.status, headers } as FetchResponse;
  }) as unknown as typeof fetch;
  return () => { globalThis.fetch = original; };
}

test('(a) renderEmail emits a Blob <a href> link for each attachment', async () => {
  const links: AttachmentLink[] = [
    { filename: '2026-Media-Kit.pdf', url: `${BLOB}/media-kit-abc123.pdf` },
    { filename: 'Rate-Card.pdf', url: `${BLOB}/rate-card-def456.pdf` },
  ];
  const html = renderEmail({
    subject: 'Hello',
    bodyHtml: '<p>Body</p>',
    unsubscribeUrl: 'https://realtynewsnow.app/unsubscribe/tok',
    attachments: links,
  });
  expect(html).toContain('Attachments');
  for (const l of links) {
    expect(html).toContain(`href="${l.url}"`);
    expect(html).toMatch(/href="https:\/\/[^"]*blob\.vercel-storage\.com\/[^"]*"/);
    expect(html).toContain(l.filename);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener"');
  }
});

test('(b) resolver populates attachments[0].path with the Blob URL (passthrough, no base64)', async () => {
  const url = `${BLOB}/media-kit-abc123.pdf`;
  const restore = stubFetch({ [url]: { status: 200, size: 12 * 1024 * 1024 } });
  try {
    const resolved = await resolveAttachmentsForSend([
      { filename: '2026-Media-Kit.pdf', url, content_type: 'application/pdf' },
    ]);
    expect(resolved.resendAttachments).toHaveLength(1);
    expect(resolved.resendAttachments[0].path).toBe(url);
    expect(resolved.resendAttachments[0].content).toBeUndefined();
    expect(resolved.links).toHaveLength(1);
    expect(resolved.links[0].url).toBe(url);
    expect(resolved.failures).toHaveLength(0);
  } finally {
    restore();
  }
});

test('(c) nonexistent Blob URL → all attachments fail → callers 502', async () => {
  const url = `${BLOB}/deleted-999.pdf`;
  const restore = stubFetch({ [url]: { status: 404 } });
  try {
    const resolved = await resolveAttachmentsForSend([{ filename: 'gone.pdf', url }]);
    expect(resolved.links).toHaveLength(0);
    expect(resolved.resendAttachments).toHaveLength(0);
    expect(resolved.failures).toHaveLength(1);
    expect(resolved.failures[0].error).toContain('404');
    expect(allAttachmentsFailed(resolved)).toBe(true);
  } finally {
    restore();
  }
});

test('(d) file over 40MB renders the inline link but skips the real Resend attachment', async () => {
  const url = `${BLOB}/huge-100mb.pdf`;
  const restore = stubFetch({ [url]: { status: 200, size: RESEND_MAX_ATTACHMENT_BYTES + 1 } });
  try {
    const resolved = await resolveAttachmentsForSend([{ filename: 'huge.pdf', url }]);
    expect(resolved.links).toHaveLength(1);
    expect(resolved.links[0].url).toBe(url);
    expect(resolved.resendAttachments).toHaveLength(0);
    expect(allAttachmentsFailed(resolved)).toBe(false);
  } finally {
    restore();
  }
});
