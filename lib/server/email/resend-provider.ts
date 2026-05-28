import { logger } from '../logger';
import type { EmailProvider, EmailSendInput, EmailSendResult } from './types';

/**
 * Resend transactional email. https://resend.com/docs/api-reference/emails/send-email
 *
 * Env: RESEND_API_KEY (required), EMAIL_FROM_ADDRESS, EMAIL_FROM_NAME, EMAIL_REPLY_TO.
 */
export class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend';

  constructor() {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is required when EMAIL_PROVIDER=resend.');
    }
  }

  async send(input: EmailSendInput): Promise<EmailSendResult> {
    const recipients = Array.isArray(input.to) ? input.to : [input.to];

    const fromEmail = process.env.EMAIL_FROM_ADDRESS;
    const fromName = process.env.EMAIL_FROM_NAME;
    if (!fromEmail) {
      return { success: false, error: 'EMAIL_FROM_ADDRESS is not set' };
    }
    const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

    const tagList = input.tags ?? [input.emailType];
    const tags = tagList.map((t) => ({ name: 'category', value: sanitizeTag(t) }));

    const payload: Record<string, unknown> = {
      from,
      to: recipients.map((r) => (r.name ? `${r.name} <${r.email}>` : r.email)),
      subject: input.subject,
      text: input.text,
      html: input.html,
      tags,
    };

    const replyTo = input.replyTo ?? process.env.EMAIL_REPLY_TO;
    if (replyTo) payload.reply_to = replyTo;

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify(payload),
      });

      const bodyText = await response.text();

      if (!response.ok) {
        logger.error({ status: response.status, body: bodyText }, 'Resend send failed');
        return { success: false, error: `Resend ${response.status}: ${bodyText}` };
      }

      let data: { id?: string } = {};
      try {
        data = JSON.parse(bodyText) as { id?: string };
      } catch {
        // ignore
      }

      if (!data.id) {
        return { success: false, error: `Resend response missing id: ${bodyText}` };
      }

      return { success: true, messageId: data.id };
    } catch (err) {
      logger.error({ err }, 'Resend send threw');
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }
}

function sanitizeTag(tag: string): string {
  const cleaned = tag.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 256);
  return cleaned || 'general';
}
