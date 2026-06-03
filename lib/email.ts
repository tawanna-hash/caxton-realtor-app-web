// lib/email.ts
//
// Lightweight Resend SDK wrapper for direct API calls.
// Uses process.env.RESEND_API_KEY.

/**
 * Resend supports per-message attachments. `content` is base64-encoded
 * file bytes; `filename` becomes the visible name in the recipient's
 * client. `contentType` is recommended but optional — Resend will sniff
 * if omitted. See https://resend.com/docs/api-reference/emails/send-email
 */
export interface EmailAttachment {
  filename: string;
  content: string; // base64
  contentType?: string;
}

export interface SendEmailOptions {
  to: string | string[];
  from?: string;
  subject: string;
  html: string;
  replyTo?: string;
  cc?: string | string[];
  attachments?: EmailAttachment[];
}

export interface SendEmailResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

// myrealtyline.com is verified in Resend. realtynewsnow.app is not (yet).
// Override with EMAIL_FROM env var if needed.
const FROM_DEFAULT = process.env.EMAIL_FROM ?? 'RealtyLine <noreply@myrealtyline.com>';

export async function sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: 'RESEND_API_KEY not configured' };
  }

  const recipients = Array.isArray(opts.to) ? opts.to : [opts.to];
  const payload: Record<string, unknown> = {
    from: opts.from ?? FROM_DEFAULT,
    to: recipients,
    subject: opts.subject,
    html: opts.html,
  };
  if (opts.replyTo) payload.reply_to = opts.replyTo;
  if (opts.cc) payload.cc = Array.isArray(opts.cc) ? opts.cc : [opts.cc];
  if (opts.attachments && opts.attachments.length > 0) {
    // Resend expects { filename, content, content_type? } with content
    // already base64-encoded by the caller.
    payload.attachments = opts.attachments.map((a) => ({
      filename: a.filename,
      content: a.content,
      ...(a.contentType ? { content_type: a.contentType } : {}),
    }));
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const body = await res.text();
    if (!res.ok) {
      return { ok: false, error: `Resend ${res.status}: ${body}` };
    }

    let data: { id?: string } = {};
    try { data = JSON.parse(body) as { id?: string }; } catch { /* ignore */ }

    return { ok: true, messageId: data.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'fetch error' };
  }
}
