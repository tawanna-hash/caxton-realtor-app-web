// lib/email.ts
//
// Lightweight Resend SDK wrapper for direct API calls.
// Uses process.env.RESEND_API_KEY.

/**
 * Resend supports per-message attachments via ONE of two mechanisms:
 *   - `content`: base64-encoded file bytes (we encode server-side), or
 *   - `path`:    a remote URL that Resend fetches itself (passthrough).
 * Exactly one of the two should be set. `path` avoids pulling large files
 * (e.g. a 10–40 MB media-kit PDF) through our function memory.
 * `filename` becomes the visible name in the recipient's client.
 * `contentType` is recommended but optional — Resend will sniff if omitted.
 * See https://resend.com/docs/api-reference/emails/send-email
 */
export interface EmailAttachment {
  filename: string;
  content?: string; // base64 (mutually exclusive with path)
  path?: string;    // remote URL passthrough (mutually exclusive with content)
  contentType?: string;
}

export interface SendEmailOptions {
  to: string | string[];
  from?: string;
  subject: string;
  html: string;
  replyTo?: string | string[];
  cc?: string | string[];
  attachments?: EmailAttachment[];
}

export interface SendEmailResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

import { captureServerEvent } from '@/lib/server/posthog';

// myrealtyline.com is verified in Resend. realtynewsnow.app is not (yet).
// hello@ is the role mailbox that forwards to a monitored inbox; noreply@
// was a dead address that silently dropped sends. Override with EMAIL_FROM.
const FROM_DEFAULT = process.env.EMAIL_FROM ?? 'RealtyLine <hello@myrealtyline.com>';

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
    // Resend accepts either `content` (base64, caller-encoded) or `path`
    // (a URL Resend fetches itself). Emit whichever the caller provided;
    // prefer `path` for URL passthrough of large files.
    payload.attachments = opts.attachments
      .filter((a) => a.path || a.content)
      .map((a) => ({
        filename: a.filename,
        ...(a.path ? { path: a.path } : { content: a.content }),
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
      const error = `Resend ${res.status}: ${body}`;
      captureServerEvent('dispatch_failed', 'server', {
        subject: opts.subject,
        recipient_count: recipients.length,
        status: res.status,
        error,
      });
      return { ok: false, error };
    }

    let data: { id?: string } = {};
    try { data = JSON.parse(body) as { id?: string }; } catch { /* ignore */ }

    captureServerEvent('email_sent', 'server', {
      subject: opts.subject,
      recipient_count: recipients.length,
      message_id: data.id ?? null,
      has_attachments: !!(opts.attachments && opts.attachments.length > 0),
    });
    return { ok: true, messageId: data.id };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'fetch error';
    captureServerEvent('dispatch_failed', 'server', {
      subject: opts.subject,
      recipient_count: recipients.length,
      error,
    });
    return { ok: false, error };
  }
}
