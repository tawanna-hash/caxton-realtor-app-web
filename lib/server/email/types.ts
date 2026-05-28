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
