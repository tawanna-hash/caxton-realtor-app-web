import { logger } from '../logger';
import type { EmailProvider, EmailSendInput, EmailSendResult } from './types';

/** Logs emails to console instead of sending. Used in local dev. */
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = 'console';

  async send(input: EmailSendInput): Promise<EmailSendResult> {
    const recipients = Array.isArray(input.to) ? input.to : [input.to];
    const messageId = `console-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    logger.info(
      {
        emailType: input.emailType,
        to: recipients.map((r) => r.email),
        subject: input.subject,
        text: input.text,
        messageId,
      },
      'Email sent (console)',
    );

    return { success: true, messageId };
  }
}
