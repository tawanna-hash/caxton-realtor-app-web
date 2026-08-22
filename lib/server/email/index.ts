import { logger } from '../logger';
import { ConsoleEmailProvider } from './console-provider';
import { ResendEmailProvider } from './resend-provider';
import type { EmailProvider } from './types';

/**
 * Pick the email provider per EMAIL_PROVIDER env var:
 *   - resend    → ResendEmailProvider (production)
 *   - console   → ConsoleEmailProvider (default — logs only)
 *
 * Mailchimp/Mandrill is intentionally dropped during the merge — switch to
 * Resend if you were on it before. Add it back as a provider here if needed.
 */
function buildEmailProvider(): EmailProvider {
  const choice = (process.env.EMAIL_PROVIDER ?? 'console').toLowerCase();
  switch (choice) {
    case 'resend':
      return new ResendEmailProvider();
    case 'console':
    default:
      if (choice !== 'console') {
        logger.warn({ choice }, 'Unknown EMAIL_PROVIDER, falling back to console');
      }
      return new ConsoleEmailProvider();
  }
}

// Module-scope singleton per Lambda instance.
let cached: EmailProvider | null = null;
export function getEmailProvider(): EmailProvider {
  if (!cached) cached = buildEmailProvider();
  return cached;
}

export type { EmailProvider,    } from './types';
