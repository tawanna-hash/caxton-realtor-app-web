// Email templates. Pure render functions; only env reads are at the very
// bottom for FROM_NAME / FROM_ADDRESS exports.

interface MagicLinkTemplate {
  subject: string;
  text: string;
  html: string;
}

/**
 * Render the magic link email used for both signup verification and login.
 */
export function renderMagicLinkEmail(opts: {
  firstName: string;
  loginUrl: string;
  expiryMinutes: number;
  purpose: 'signup_verification' | 'login';
}): MagicLinkTemplate {
  const isSignup = opts.purpose === 'signup_verification';
  const subject = isSignup
    ? 'Verify your email — Caxton Publications'
    : 'Your sign-in link — Caxton Publications';

  const greeting = `Hi ${opts.firstName},`;
  const intro = isSignup
    ? "Welcome to the Caxton Publications app! Click the link below to verify your email and finish setting up your account."
    : 'Click the link below to sign in to your account.';

  const text = `${greeting}

${intro}

${opts.loginUrl}

This link expires in ${opts.expiryMinutes} minutes. If you didn't request this email, you can safely ignore it.

—
Caxton Publications, Inc.
RealtyLine — Putting A Face on Real Estate since 1995
Newsline San Antonio
`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="padding:32px 40px 16px;text-align:center;border-bottom:1px solid #eeeeee;">
              <div style="font-size:18px;font-weight:600;color:#333;letter-spacing:0.3px;">Caxton Publications</div>
              <div style="font-size:13px;color:#888;margin-top:4px;">RealtyLine &nbsp;·&nbsp; Newsline San Antonio</div>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;color:#333;font-size:16px;line-height:1.6;">
              <p style="margin:0 0 16px;">${escapeHtml(greeting)}</p>
              <p style="margin:0 0 24px;">${escapeHtml(intro)}</p>
              <p style="margin:0 0 32px;text-align:center;">
                <a href="${escapeHtml(opts.loginUrl)}"
                   style="display:inline-block;background:#1a5490;color:#ffffff;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;">
                  ${isSignup ? 'Verify my email' : 'Sign in'}
                </a>
              </p>
              <p style="margin:0 0 8px;color:#666;font-size:14px;">
                Or copy and paste this URL into your browser:
              </p>
              <p style="margin:0 0 24px;word-break:break-all;font-size:13px;color:#1a5490;">
                ${escapeHtml(opts.loginUrl)}
              </p>
              <p style="margin:0;color:#888;font-size:13px;line-height:1.5;">
                This link expires in ${opts.expiryMinutes} minutes. If you didn't request this email, you can safely ignore it.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;background:#fafafa;border-top:1px solid #eeeeee;color:#888;font-size:12px;line-height:1.5;text-align:center;">
              <div>© Caxton Publications, Inc.</div>
              <div style="margin-top:4px;font-style:italic;">Putting A Face on Real Estate since 1995</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();

  return { subject, text, html };
}

/**
 * Render a simple welcome email after first email verification.
 */
export function renderWelcomeEmail(opts: {
  firstName: string;
  appUrl: string;
}): MagicLinkTemplate {
  const subject = 'Welcome to Caxton Publications';
  const text = `Hi ${opts.firstName},

Welcome to the Caxton Publications REALTOR® app! Your account is now active.

You can sign in anytime at: ${opts.appUrl}

Here's what you can do right away:
  • Browse aggregated Texas real estate news
  • View the upcoming events calendar (HBA, ABoR, SABOR, GSABA, and more)
  • Search the verified vendor directory
  • Look up TREC license status

You'll also start receiving the print edition of ${opts.firstName}, plus our weekly digest with digital replica access, events, and advertiser incentives.

—
Caxton Publications, Inc.
RealtyLine · Newsline San Antonio
`;

  const html = `<p>Hi ${escapeHtml(opts.firstName)},</p>
<p>Welcome to the Caxton Publications REALTOR® app! Your account is now active.</p>
<p><a href="${escapeHtml(opts.appUrl)}">Sign in</a> anytime to browse news, events, and tools built for Texas REALTORS®.</p>
<p>—<br>Caxton Publications, Inc.<br>RealtyLine · Newsline San Antonio</p>`;

  return { subject, text, html };
}

/**
 * Render the newsletter signup confirmation email. Sent immediately after a
 * visitor signs up via the inline NewsletterCTA on the public site.
 */
export function renderNewsletterConfirmationEmail(opts: {
  publication: 'realtyline' | 'newsline';
  manageUrl: string;
}): MagicLinkTemplate {
  const pubLabel =
    opts.publication === 'newsline' ? 'Newsline San Antonio' : 'RealtyLine Austin';
  const subject = `You\u2019re subscribed to ${pubLabel}`;
  const text = `Welcome to ${pubLabel}.

You\u2019re subscribed to our weekly digest. Every week we round up the news, events, and incentives Texas REALTORS\u00AE actually need \u2014 nothing more.

What to expect:
  \u2022 One email per week (sometimes two if news breaks)
  \u2022 Local market updates and ABoR/HBA/SABOR coverage
  \u2022 Event calendars, giveaways, and advertiser incentives
  \u2022 Direct links to the latest digital edition

Manage your subscriptions anytime: ${opts.manageUrl}

\u2014
Caxton Publications, Inc.
RealtyLine \u00B7 Newsline San Antonio
`;

  const html = `<p>Welcome to <strong>${escapeHtml(pubLabel)}</strong>.</p>
<p>You\u2019re subscribed to our weekly digest. Every week we round up the news, events, and incentives Texas REALTORS&reg; actually need \u2014 nothing more.</p>
<p><strong>What to expect:</strong></p>
<ul>
  <li>One email per week (sometimes two if news breaks)</li>
  <li>Local market updates and ABoR/HBA/SABOR coverage</li>
  <li>Event calendars, giveaways, and advertiser incentives</li>
  <li>Direct links to the latest digital edition</li>
</ul>
<p><a href="${escapeHtml(opts.manageUrl)}">Manage your subscriptions</a> anytime.</p>
<p>\u2014<br>Caxton Publications, Inc.<br>RealtyLine \u00B7 Newsline San Antonio</p>`;

  return { subject, text, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Re-export config-derived constants if templates need them
export const FROM_NAME = process.env.EMAIL_FROM_NAME ?? 'Caxton Publications';
export const FROM_ADDRESS = process.env.EMAIL_FROM_ADDRESS ?? '';


// =============================================================================
// Giveaway winner notification
// =============================================================================

interface GiveawayWinnerEmailInput {
  firstName: string;
  giveawayTitle: string;
  prize: string;
  publication: string;
}

const PUBLICATION_BRANDS: Record<string, { name: string; tagline: string }> = {
  austin: { name: 'RealtyLine', tagline: 'Putting A Face on Real Estate since 1995' },
  san_antonio: { name: 'Newsline San Antonio', tagline: 'Founded 1982 - Relaunched 2025' },
  both: { name: 'Caxton Publications', tagline: 'RealtyLine - Newsline San Antonio' },
};

export function renderGiveawayWinnerEmail(input: GiveawayWinnerEmailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const brand = PUBLICATION_BRANDS[input.publication] || PUBLICATION_BRANDS.both!;
  const esc = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const subject = `Congratulations - you won the ${input.prize} from ${brand.name}!`;

  const text = `Hi ${input.firstName},

You won! Your name was randomly drawn from the ${input.giveawayTitle} and you've been selected to receive the ${input.prize}.

We'll be in touch within the next few business days to coordinate getting your prize to you. Watch for an email or call from the ${brand.name} team.

Thanks for being part of the ${brand.name} community.

-
Caxton Publications, Inc.
${brand.tagline}`;

  const html = `<!doctype html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px; background: #fff; color: #1a2a44;">
  <p style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.25em; color: #888; margin: 0 0 8px 0;">${esc(brand.name)}</p>
  <h1 style="font-size: 28px; font-weight: 600; color: #1a2a44; margin: 0 0 24px 0; line-height: 1.2;">Congratulations &mdash; you won!</h1>
  <p style="font-size: 16px; line-height: 1.5; color: #333;">Hi ${esc(input.firstName)},</p>
  <p style="font-size: 16px; line-height: 1.5; color: #333;">Your name was randomly drawn from the <strong>${esc(input.giveawayTitle)}</strong>, and you've been selected to receive:</p>
  <p style="font-size: 22px; font-weight: 600; color: #1a2a44; padding: 20px; background: #faf8f3; border-left: 4px solid #d4af37; margin: 24px 0;">${esc(input.prize)}</p>
  <p style="font-size: 16px; line-height: 1.5; color: #333;">We'll be in touch within the next few business days to coordinate getting your prize to you. Watch for an email or call from the ${esc(brand.name)} team.</p>
  <p style="font-size: 16px; line-height: 1.5; color: #333;">Thanks for being part of the ${esc(brand.name)} community.</p>
  <p style="font-size: 14px; color: #888; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e5e5;">
    Caxton Publications, Inc.<br/>
    <span style="font-style: italic;">${esc(brand.tagline)}</span>
  </p>
</body>
</html>`;

  return { subject, text, html };
}


// =============================================================================
// Admin password reset
// =============================================================================

export function renderPasswordResetEmail(opts: {
  fullName: string;
  resetUrl: string;
  expiryMinutes: number;
}): { subject: string; text: string; html: string } {
  const subject = 'Reset your admin password — Caxton Publications';
  const greeting = `Hi ${opts.fullName},`;
  const intro = 'We received a request to reset your admin password. Click the link below to choose a new one.';

  const text = `${greeting}

${intro}

${opts.resetUrl}

This link expires in ${opts.expiryMinutes} minutes. If you did not request a password reset, you can safely ignore this email — your password will not change.

—
Caxton Publications, Inc.
RealtyLine — Putting A Face on Real Estate since 1995
Newsline San Antonio
`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <tr>
            <td style="padding:32px 40px 16px;text-align:center;border-bottom:1px solid #eeeeee;">
              <div style="font-size:18px;font-weight:600;color:#333;letter-spacing:0.3px;">Caxton Publications Admin</div>
              <div style="font-size:13px;color:#888;margin-top:4px;">Password Reset</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;color:#333;font-size:16px;line-height:1.6;">
              <p style="margin:0 0 16px;">${escapeHtml(greeting)}</p>
              <p style="margin:0 0 24px;">${escapeHtml(intro)}</p>
              <p style="margin:0 0 32px;text-align:center;">
                <a href="${escapeHtml(opts.resetUrl)}"
                   style="display:inline-block;background:#1a2a44;color:#ffffff;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;">
                  Reset my password
                </a>
              </p>
              <p style="margin:0 0 8px;color:#666;font-size:14px;">Or copy and paste this URL into your browser:</p>
              <p style="margin:0 0 24px;word-break:break-all;font-size:13px;color:#1a2a44;">${escapeHtml(opts.resetUrl)}</p>
              <p style="margin:0;color:#888;font-size:13px;line-height:1.5;">
                This link expires in ${opts.expiryMinutes} minutes. If you did not request a password reset, you can safely ignore this email — your password will not change.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px;background:#fafafa;border-top:1px solid #eeeeee;color:#888;font-size:12px;line-height:1.5;text-align:center;">
              <div>© Caxton Publications, Inc.</div>
              <div style="margin-top:4px;font-style:italic;">Putting A Face on Real Estate since 1995</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();

  return { subject, text, html };
}
