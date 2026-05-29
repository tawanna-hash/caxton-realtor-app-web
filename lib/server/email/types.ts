/**
 * Provider-agnostic email interface used by all server code.
 */

export interface EmailRecipient {
  email: string;
  name?: string;
}

export interface EmailSendInput {
  to: EmailRecipient | EmailRecipient[];
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  tags?: string[];
  emailType: string;
  /**
   * Optional per-send override of the From identity. When omitted, the
   * provider uses EMAIL_FROM_ADDRESS / EMAIL_FROM_NAME from env. Either
   * field may be supplied alone — e.g. theme-branded routes that want to
   * override only the display name keep the global from-address.
   */
  from?: {
    email?: string;
    name?: string;
  };
}

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface EmailProvider {
  readonly name: string;
  send(input: EmailSendInput): Promise<EmailSendResult>;
}
