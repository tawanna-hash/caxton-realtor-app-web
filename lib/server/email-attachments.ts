// lib/server/email-attachments.ts
//
// Shared helpers for outbound marketing/CRM email attachments and the
// "Download attachment" call-to-action button. Used by cron, /send, /test.

export interface AttachmentRef {
  filename: string;
  url?: string;
  content?: string;
  contentType?: string;
}

export async function fetchAttachmentContent(
  a: AttachmentRef,
): Promise<{ filename: string; content: string; contentType?: string } | null> {
  if (a.content) {
    return { filename: a.filename, content: a.content, contentType: a.contentType };
  }
  if (!a.url) return null;
  try {
    const r = await fetch(a.url);
    if (!r.ok) {
      console.warn('[email-attachments] fetch failed', a.url, r.status);
      return null;
    }
    const buf = Buffer.from(await r.arrayBuffer());
    return { filename: a.filename, content: buf.toString('base64'), contentType: a.contentType };
  } catch (err) {
    console.warn('[email-attachments] fetch error', a.url, err);
    return null;
  }
}

/** Resolve a list of attachment refs (URLs or inline content) into the
 * base64 content shape Resend expects. Failures are logged and skipped. */
export async function resolveAttachments(
  refs: AttachmentRef[] | null | undefined,
): Promise<Array<{ filename: string; content: string; contentType?: string }>> {
  if (!refs || refs.length === 0) return [];
  const out: Array<{ filename: string; content: string; contentType?: string }> = [];
  for (const a of refs) {
    const resolved = await fetchAttachmentContent(a);
    if (resolved) out.push(resolved);
  }
  return out;
}

/** Append the purple "Download attachment" CTA button to an email body. */
export function appendAttachmentLinkButton(
  body: string,
  url: string | null | undefined,
  label: string | null | undefined,
): string {
  if (!url) return body;
  const safeLabel = (label || 'Download attachment')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const safeUrl = url.replace(/"/g, '&quot;');
  return body + `
<div style="margin:32px 0;text-align:center;">
  <a href="${safeUrl}" style="display:inline-block;padding:14px 28px;background:#5a0e5f;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">${safeLabel}</a>
</div>`;
}
