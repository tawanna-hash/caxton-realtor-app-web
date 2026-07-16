// tests/e2e/06-marketing-attachment-passthrough.spec.ts
//
// Smoke #6 — marketing email attachments go to Resend as a `path` (public
// Blob URL Resend fetches server-side), NOT as base64 `content`. This guards
// the fix for the media-kit PDF that silently dropped when base64-inflated
// past Resend's 40 MB cap / the Vercel 4.5 MB route body limit.
//
// Runs in-process (no HTTP server): we stub global fetch to (a) answer the
// HEAD pre-flight against Vercel Blob and (b) capture the outgoing Resend
// POST body, then assert the attachment shape.

import { test, expect } from '@playwright/test';
import { buildBlobUrlAttachments } from '@/lib/server/blob-fetch';
import { sendEmail } from '@/lib/email';

const BLOB_URL =
  'https://abc123.public.blob.vercel-storage.com/media-kit-2026.pdf';

test('marketing attachment is sent to Resend as path passthrough, not base64 content', async () => {
  const realFetch = globalThis.fetch;
  process.env.RESEND_API_KEY = 'test-key';

  let resendBody: { attachments?: Array<{ path?: string; content?: string; filename?: string }> } | null = null;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();

    // HEAD pre-flight against the Blob URL.
    if (url.includes('.public.blob.vercel-storage.com') && method === 'HEAD') {
      return new Response(null, {
        status: 200,
        headers: {
          'content-length': String(30 * 1024 * 1024), // 30 MB media kit
          'content-type': 'application/pdf',
        },
      });
    }

    // The Resend send.
    if (url === 'https://api.resend.com/emails') {
      resendBody = JSON.parse(String(init?.body ?? '{}'));
      return new Response(JSON.stringify({ id: 'test-message-id' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    throw new Error(`unexpected fetch: ${method} ${url}`);
  }) as typeof fetch;

  try {
    const attachments = await buildBlobUrlAttachments([
      { url: BLOB_URL, filename: 'media-kit-2026.pdf' },
    ]);

    // Helper returns Resend `path` shape (URL), never base64.
    expect(attachments).toHaveLength(1);
    expect(attachments[0].path).toBe(BLOB_URL);
    expect((attachments[0] as { content?: string }).content).toBeUndefined();

    const res = await sendEmail({
      to: 'tawanna@example.com',
      subject: 'Media kit test',
      html: '<p>hi</p>',
      attachments,
    });
    expect(res.ok).toBe(true);

    // The outgoing Resend payload carries `path`, not `content`.
    expect(resendBody).not.toBeNull();
    expect(resendBody!.attachments).toHaveLength(1);
    expect(resendBody!.attachments![0].path).toBe(BLOB_URL);
    expect(resendBody!.attachments![0].content).toBeUndefined();
    expect(resendBody!.attachments![0].filename).toBe('media-kit-2026.pdf');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('buildBlobUrlAttachments fails loud on an unreachable Blob URL', async () => {
  const realFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    if (url.includes('.public.blob.vercel-storage.com') && method === 'HEAD') {
      return new Response(null, { status: 404 });
    }
    throw new Error(`unexpected fetch: ${method} ${url}`);
  }) as typeof fetch;

  try {
    await expect(
      buildBlobUrlAttachments([{ url: BLOB_URL, filename: 'media-kit-2026.pdf' }]),
    ).rejects.toThrow(/not reachable|HTTP 404/);
  } finally {
    globalThis.fetch = realFetch;
  }
});
