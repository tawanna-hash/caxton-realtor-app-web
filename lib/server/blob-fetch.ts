/**
 * Fetch a list of Vercel Blob URLs and materialize them as
 * Resend-shaped { filename, content, contentType } attachments.
 *
 * Guards:
 *   - Only accepts URLs on *.public.blob.vercel-storage.com (our tenant).
 *   - Skips anything larger than MAX_BYTES to avoid a rogue payload
 *     blowing past Resend's ~40 MB per-email cap.
 */

export interface RemoteAttachment {
  url: string;
  filename: string;
  content_type?: string;
}

export interface ResendAttachment {
  filename: string;
  content: string; // base64
  contentType?: string;
}

const MAX_BYTES = 40 * 1024 * 1024; // Resend total-email ceiling
const ALLOWED_HOST_SUFFIX = '.public.blob.vercel-storage.com';

export async function fetchBlobAttachments(
  items: RemoteAttachment[] | undefined,
): Promise<{ attachments: ResendAttachment[]; skipped: string[] }> {
  if (!items || items.length === 0) return { attachments: [], skipped: [] };

  const attachments: ResendAttachment[] = [];
  const skipped: string[] = [];
  let totalBytes = 0;

  for (const item of items) {
    let u: URL;
    try {
      u = new URL(item.url);
    } catch {
      skipped.push(`${item.filename}: invalid URL`);
      continue;
    }
    if (u.protocol !== 'https:' || !u.host.endsWith(ALLOWED_HOST_SUFFIX)) {
      skipped.push(`${item.filename}: host not allowed`);
      continue;
    }

    const res = await fetch(item.url);
    if (!res.ok) {
      skipped.push(`${item.filename}: fetch ${res.status}`);
      continue;
    }
    const arr = new Uint8Array(await res.arrayBuffer());
    if (totalBytes + arr.byteLength > MAX_BYTES) {
      skipped.push(`${item.filename}: would exceed 40MB cap`);
      continue;
    }
    totalBytes += arr.byteLength;

    // Buffer is only available in nodejs runtime — routes using this
    // helper must export `runtime = "nodejs"`.
    const b64 = Buffer.from(arr).toString('base64');
    attachments.push({
      filename: item.filename,
      content: b64,
      contentType: item.content_type || res.headers.get('content-type') || undefined,
    });
  }

  return { attachments, skipped };
}
